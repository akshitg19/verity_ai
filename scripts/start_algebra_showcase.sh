#!/bin/sh

# Presenter-controlled local showcase. The backend stays on loopback while
# Vite exposes only the browser UI to the presenter's LAN. Nothing calls
# MyScript until the presenter explicitly presses Check line.
set +x
set -eu
umask 077

SCRIPT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)
REPO_DIR=$(CDPATH= cd -- "$SCRIPT_DIR/.." && pwd)
SECRET_FILE=/Users/anyixin/Desktop/VerityAI/.secrets/myscript.env
RUNTIME_DIR=/Users/anyixin/Desktop/VerityAI/.showcase-runtime
LEDGER_FILE="$RUNTIME_DIR/myscript-algebra-showcase-v1.handwriting-ledger.jsonl"
BACKEND_PID=
FRONTEND_PID=

fail() {
  printf '%s\n' "$1" >&2
  exit 1
}

cleanup() {
  trap - EXIT INT TERM HUP
  [ -z "$FRONTEND_PID" ] || kill "$FRONTEND_PID" 2>/dev/null || true
  [ -z "$BACKEND_PID" ] || kill "$BACKEND_PID" 2>/dev/null || true
  wait 2>/dev/null || true
}
trap cleanup EXIT INT TERM HUP

[ -f "$SECRET_FILE" ] || fail "The local MyScript credential file is missing."

if stat -f '%Lp' "$SECRET_FILE" >/dev/null 2>&1; then
  SECRET_MODE=$(stat -f '%Lp' "$SECRET_FILE")
else
  SECRET_MODE=$(stat -c '%a' "$SECRET_FILE")
fi
[ "$SECRET_MODE" = "600" ] || fail "The local credential file must have mode 600."

# shellcheck disable=SC1090
. "$SECRET_FILE"
[ -n "${MYSCRIPT_APPLICATION_KEY:-}" ] || fail "The application credential is not configured."
[ -n "${MYSCRIPT_HMAC_KEY:-}" ] || fail "The HMAC credential is not configured."

mkdir -p "$RUNTIME_DIR"
chmod 700 "$RUNTIME_DIR"

VERITY_SHOWCASE_SECRET=$(openssl rand -hex 32)
export VERITY_API_SECRET="$VERITY_SHOWCASE_SECRET"
export VITE_API_SECRET="$VERITY_SHOWCASE_SECRET"
unset VERITY_SHOWCASE_SECRET

export MYSCRIPT_APPLICATION_KEY MYSCRIPT_HMAC_KEY
export MYSCRIPT_ENABLED=true
export MYSCRIPT_POC_ROUTE_ENABLED=true
export MYSCRIPT_ALLOW_SHARED_ACCESS=true
export MYSCRIPT_EVAL_REQUEST_CAP=20
export MYSCRIPT_EVAL_LEDGER_PATH="$LEDGER_FILE"
export MYSCRIPT_EVAL_RUN_ID=myscript-algebra-showcase-2026-08-18-v1
export MYSCRIPT_TIMEOUT_SECONDS=3
export VITE_HANDWRITING_MODE=algebra-showcase
export VITE_MYSCRIPT_POC_ENABLED=true

[ -x "$REPO_DIR/backend/venv/bin/python" ] || fail "Backend virtual environment is missing."
[ -d "$REPO_DIR/frontend/node_modules" ] || fail "Frontend dependencies are missing."

if [ -e "$LEDGER_FILE" ]; then
  (
    cd "$REPO_DIR/backend"
    ./venv/bin/python -m handwriting_eval.cli ledger-status \
      --ledger "$LEDGER_FILE" \
      --provider myscript \
      --run-id myscript-algebra-showcase-2026-08-18-v1 \
      --request-cap 20 >/dev/null 2>&1
  ) || fail "The existing showcase attempt ledger failed validation."
else
  (
    cd "$REPO_DIR/backend"
    ./venv/bin/python -m handwriting_eval.cli ledger-init \
      --ledger "$LEDGER_FILE" \
      --provider myscript \
      --run-id myscript-algebra-showcase-2026-08-18-v1 \
      --request-cap 20 >/dev/null 2>&1
  ) || fail "The showcase attempt ledger could not be initialized."
fi

printf '%s\n' "Starting the private Algebra showcase…"
printf '%s\n' "MyScript is limited to Algebra and 20 provider attempts for this showcase."
printf '%s\n' "Chemistry and non-Algebra math remain on Gemini."

(
  cd "$REPO_DIR/backend"
  exec ./venv/bin/python -m uvicorn main:app --host 127.0.0.1 --port 8000
) &
BACKEND_PID=$!

(
  cd "$REPO_DIR/frontend"
  exec npm run dev -- --host 0.0.0.0 --port 5173
) &
FRONTEND_PID=$!

wait "$BACKEND_PID" "$FRONTEND_PID"
