#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")"

PYTHON_BIN="${PYTHON_BIN:-python3.11}"
if ! command -v "$PYTHON_BIN" >/dev/null 2>&1; then
  echo "Python 3.11 is required. Install it, or set PYTHON_BIN to a compatible interpreter." >&2
  exit 1
fi

rm -rf venv
"$PYTHON_BIN" -m venv --clear venv
./venv/bin/python -m pip install --upgrade pip
./venv/bin/python -m pip install -r requirements.txt

echo "Backend ready. Run ./start-backend.sh"
