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
    aiplatform.googleapis.com
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

# --- deploy ------------------------------------------------------------------

Write-Host "`nBuilding and deploying (first build takes ~5 minutes)..." -ForegroundColor Yellow

# --max-instances 1 is deliberate and load-bearing, not caution:
#   * Problem sessions -- the answer vault and the level-3 hint budget -- are
#     held in the serving process's memory. A second instance would hold a
#     second, separate set, and a hint request landing on the wrong one would
#     quietly fall back to the static hint.
#   * It is also a hard ceiling on spend. One instance cannot run up a bill.
# --min-instances 0 means the service costs nothing while nobody is using it,
# at the price of a few seconds on the first request after it goes idle.
gcloud run deploy $SERVICE `
    --source . `
    --region $REGION `
    --allow-unauthenticated `
    --service-account $SA_EMAIL `
    --max-instances 1 `
    --min-instances 0 `
    --memory 1Gi `
    --cpu 1 `
    --timeout 300 `
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=$REGION,GEMINI_MODEL=gemini-2.5-flash"
Assert-Ok "deploying to Cloud Run"

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
Write-Host "`nOn demo day, keep it warm with:" -ForegroundColor Cyan
Write-Host "  gcloud run services update $SERVICE --region $REGION --min-instances 1"
Write-Host "and afterwards put it back to 0 so it costs nothing:"
Write-Host "  gcloud run services update $SERVICE --region $REGION --min-instances 0"
