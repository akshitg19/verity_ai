# Deploy verity.ai to Cloud Run, in the same GCP project that serves Vertex AI.
#
# Run it from the repository root:
#
#     .\deploy.ps1
#
# The first run does the one-time setup (APIs, service account, IAM) and then
# deploys. Every run after that only deploys, so this is also the "ship a
# change" command. It is safe to run repeatedly.
#
# Why this removes `gcloud auth application-default login` from the running
# app: the service runs as the service account created below, and the Google
# client libraries read that identity straight from the Cloud Run metadata
# server. There is no key file to download, store, rotate, or commit.
# You still need to be logged in *locally* to deploy -- that is a different
# login, and the preflight check below is about that one.

$PROJECT = "cs-sail-2b08"
$REGION  = "us-central1"      # matches GOOGLE_CLOUD_LOCATION for Vertex AI
$SERVICE = "verity-ai"
$SA_NAME = "verity-ai-run"
$SA_EMAIL = "$SA_NAME@$PROJECT.iam.gserviceaccount.com"
$REPO    = "cloud-run-source-deploy"

# What the service actually runs with -- instance counts, CPU, memory, and
# the environment including the CORS settings -- is NOT here. It is in
# `cloudbuild.yaml`, which this script submits, so that a push to main and a
# person running this script deploy exactly the same thing. Change it there.

# gcloud is a native executable, not a PowerShell cmdlet, so a failure sets
# $LASTEXITCODE rather than throwing. $ErrorActionPreference does nothing for
# it. Without this check the script cheerfully carries on after an error and
# prints a success banner for a deploy that never happened.
function Assert-Ok($what) {
    if ($LASTEXITCODE -ne 0) {
        Write-Host "`nFAILED: $what" -ForegroundColor Red
        Write-Host "Nothing further was deployed. Fix the error above and re-run .\deploy.ps1"
        exit 1
    }
}

Write-Host "`n=== verity.ai -> Cloud Run ($PROJECT / $REGION) ===`n" -ForegroundColor Cyan

# --- preflight: are we actually logged in? -----------------------------------
# A Google login expires after a while. When it does, every command below
# fails the same way, so it is worth one cheap call up front to say so once
# and in plain language, rather than eight times in gcloud's words.

Write-Host "Checking your Google login..." -ForegroundColor Yellow
gcloud projects describe $PROJECT --format="value(projectId)" 2>&1 | Out-Null
if ($LASTEXITCODE -ne 0) {
    Write-Host "`nYour gcloud login has expired (or you have no access to $PROJECT)." -ForegroundColor Red
    Write-Host "`nRun this, finish the sign-in in your browser, then re-run .\deploy.ps1 :`n"
    Write-Host "    gcloud auth login`n" -ForegroundColor Cyan
    Write-Host "Note there are two separate logins, and they expire independently:"
    Write-Host "  gcloud auth login                       -> lets YOU run gcloud commands (this script)"
    Write-Host "  gcloud auth application-default login   -> lets the app on YOUR LAPTOP call Gemini"
    Write-Host "`nOnce deployed, the Cloud Run service needs neither: it has its own identity."
    exit 1
}
Write-Host "Logged in and $PROJECT is reachable." -ForegroundColor Green

gcloud config set project $PROJECT | Out-Null
Assert-Ok "setting the active project"

# --- one-time setup, idempotent ---------------------------------------------

Write-Host "`nEnabling the APIs this needs (no-op if already on)..." -ForegroundColor Yellow
gcloud services enable `
    run.googleapis.com `
    cloudbuild.googleapis.com `
    artifactregistry.googleapis.com `
    aiplatform.googleapis.com `
    secretmanager.googleapis.com
Assert-Ok "enabling APIs"

Write-Host "`nEnsuring the runtime service account exists..." -ForegroundColor Yellow
$existing = gcloud iam service-accounts list --filter="email:$SA_EMAIL" --format="value(email)"
Assert-Ok "listing service accounts"
if (-not $existing) {
    gcloud iam service-accounts create $SA_NAME `
        --display-name "verity.ai Cloud Run runtime"
    Assert-Ok "creating the service account"
    Write-Host "Created $SA_EMAIL" -ForegroundColor Green
} else {
    Write-Host "$SA_EMAIL already exists" -ForegroundColor Green
}

# This single grant is what lets the deployed app call Gemini. It is the
# whole of the production auth story.
Write-Host "`nGranting Vertex AI access to the runtime account..." -ForegroundColor Yellow
gcloud projects add-iam-policy-binding $PROJECT `
    --member "serviceAccount:$SA_EMAIL" `
    --role "roles/aiplatform.user" `
    --condition=None | Out-Null
Assert-Ok "granting roles/aiplatform.user"
Write-Host "Granted." -ForegroundColor Green

# MyScript credentials are already provisioned in Secret Manager. This block
# deliberately verifies names and IAM only; it never reads or prints a secret
# version's value and never asks a person to paste one into the terminal.
$MYSCRIPT_SECRETS = @(
    "verity-myscript-application-key",
    "verity-myscript-hmac-key"
)
Write-Host "`nVerifying MyScript secret metadata and runtime access..." -ForegroundColor Yellow
foreach ($secret in $MYSCRIPT_SECRETS) {
    gcloud secrets describe $secret --project $PROJECT --format="value(name)" 2>&1 | Out-Null
    Assert-Ok "finding Secret Manager secret $secret"
    gcloud secrets add-iam-policy-binding $secret `
        --project $PROJECT `
        --member "serviceAccount:$SA_EMAIL" `
        --role "roles/secretmanager.secretAccessor" `
        --condition=None 2>&1 | Out-Null
    Assert-Ok "granting runtime access to Secret Manager secret $secret"
}
Write-Host "Secret metadata and runtime access are ready; values were not read." -ForegroundColor Green

Write-Host "`nEnsuring the image repository exists..." -ForegroundColor Yellow
$repo = gcloud artifacts repositories list --location $REGION --filter="name~/$REPO`$" --format="value(name)"
if (-not $repo) {
    gcloud artifacts repositories create $REPO `
        --repository-format docker `
        --location $REGION `
        --description "Images for Cloud Run deploys of verity.ai" | Out-Null
    Assert-Ok "creating the Artifact Registry repository"
    Write-Host "Created $REPO" -ForegroundColor Green
} else {
    Write-Host "$REPO already exists" -ForegroundColor Green
}

# The build runs as a service account of its own, and it needs to be allowed
# to do the two things cloudbuild.yaml asks of it: deploy a Cloud Run
# revision, and hand that revision the runtime identity. Without the second
# grant the build succeeds and the deploy step fails with a permissions error
# that reads as though the runtime account is broken, which it is not.
Write-Host "`nGranting the build account permission to deploy..." -ForegroundColor Yellow
$PROJECT_NUMBER = gcloud projects describe $PROJECT --format="value(projectNumber)"
Assert-Ok "reading the project number"
# Both are granted because which one a build runs as depends on when the
# project was created, and granting the one that is not in use is inert.
$BUILD_ACCOUNTS = @(
    "$PROJECT_NUMBER@cloudbuild.gserviceaccount.com",
    "$PROJECT_NUMBER-compute@developer.gserviceaccount.com"
)
foreach ($account in $BUILD_ACCOUNTS) {
    foreach ($role in @("roles/run.admin", "roles/artifactregistry.writer", "roles/logging.logWriter")) {
        gcloud projects add-iam-policy-binding $PROJECT `
            --member "serviceAccount:$account" `
            --role $role `
            --condition=None 2>&1 | Out-Null
    }
    gcloud iam service-accounts add-iam-policy-binding $SA_EMAIL `
        --member "serviceAccount:$account" `
        --role "roles/iam.serviceAccountUser" 2>&1 | Out-Null
}
Write-Host "Granted." -ForegroundColor Green

# --- deploy ------------------------------------------------------------------

Write-Host "`nBuilding and deploying (first build takes ~5 minutes)..." -ForegroundColor Yellow

# Every setting that shapes the deployed service now lives in cloudbuild.yaml,
# not here: max-instances, min-instances, cpu, memory, and the environment.
# This script used to carry its own copy of those flags, which was fine while
# it was the only way to deploy and became a drift hazard the moment a push
# could deploy too. Submitting the same file means running this by hand and
# merging a pull request produce an identical revision.
gcloud builds submit --config cloudbuild.yaml
Assert-Ok "building and deploying through Cloud Build"

$URL = gcloud run services describe $SERVICE --region $REGION --format="value(status.url)"
Assert-Ok "reading back the service URL"

if (-not $URL) {
    Write-Host "`nDeploy reported success but no URL came back. Check the Cloud Run console." -ForegroundColor Red
    exit 1
}

Write-Host "`n=== Live ===" -ForegroundColor Green
Write-Host "  App:    $URL"
Write-Host "  Health: $URL/health"
Write-Host "  Docs:   $URL/docs"
Write-Host "  Front:  https://verity-ai-lovat.vercel.app"
Write-Host "`nThis deploys with one instance always running, so the link is live"
Write-Host "with no cold start. To stop paying for idle after the demo:" -ForegroundColor Cyan
Write-Host "  gcloud run services update $SERVICE --region $REGION --min-instances 0"
Write-Host "and to turn it back on:"
Write-Host "  gcloud run services update $SERVICE --region $REGION --min-instances 1"
