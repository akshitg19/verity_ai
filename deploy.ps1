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

# The Vercel frontend calls this API cross-origin, so its origin has to be
# allowed or every request from it fails preflight and the browser reports
# nothing more useful than "Failed to fetch". `main.py` defaults this to
# localhost only, which is right for development and wrong for the deployed
# pair, and `--set-env-vars` below replaces the whole set rather than adding
# to it, so leaving these out silently un-fixes it on the next deploy.
$CORS_ORIGINS = "https://verity-ai-lovat.vercel.app"

# Naming origins one at a time was the bug, not the fix. Vercel mints a new
# hostname for every push and every branch, so the named alias worked and
# every deployment opened from the Vercel dashboard did not. The regex covers
# all of them, for good, and stays scoped to this project's own name.
$CORS_ORIGIN_REGEX = "https://verity-ai[a-z0-9-]*\.vercel\.app"

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
# --min-instances 1 keeps one box running at all times. This is the only
# setting here that bills while nothing is happening, and it is deliberate:
# the link is meant to be a normal website that works when anyone opens it,
# not one that needs a warm-up lap. At --min-instances 0 the first request
# after an idle spell waits for a container to boot and import RDKit, which
# reads as "the site is broken" to anyone who did not build it.
#
# --cpu 2 because one instance serves everybody. Three people writing at once
# means overlapping transcription, judging and hint generation in a single
# process, and the RDKit and SymPy work is CPU-bound even though the model
# calls are just waiting.
gcloud run deploy $SERVICE `
    --source . `
    --region $REGION `
    --allow-unauthenticated `
    --service-account $SA_EMAIL `
    --max-instances 1 `
    --min-instances 1 `
    --memory 2Gi `
    --cpu 2 `
    --timeout 300 `
    --set-env-vars "GOOGLE_CLOUD_PROJECT=$PROJECT,GOOGLE_CLOUD_LOCATION=$REGION,GEMINI_MODEL=gemini-2.5-flash,CORS_ORIGINS=$CORS_ORIGINS,CORS_ORIGIN_REGEX=$CORS_ORIGIN_REGEX"
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
Write-Host "  Front:  https://verity-ai-lovat.vercel.app"
Write-Host "`nThis deploys with one instance always running, so the link is live"
Write-Host "with no cold start. To stop paying for idle after the demo:" -ForegroundColor Cyan
Write-Host "  gcloud run services update $SERVICE --region $REGION --min-instances 0"
Write-Host "and to turn it back on:"
Write-Host "  gcloud run services update $SERVICE --region $REGION --min-instances 1"
