#!/usr/bin/env bash
# Local development: API on :8000, Vite dev server on :5173 (proxies /api).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"

if [ ! -d "$ROOT/backend/.venv" ]; then
  python3 -m venv "$ROOT/backend/.venv"
  "$ROOT/backend/.venv/bin/pip" install -q -r "$ROOT/backend/requirements.txt"
fi
[ -d "$ROOT/frontend/node_modules" ] || (cd "$ROOT/frontend" && npm install)

(cd "$ROOT/backend" && .venv/bin/uvicorn app.main:app --reload --port 8000) &
API=$!
trap 'kill $API' EXIT
cd "$ROOT/frontend" && npm run dev
