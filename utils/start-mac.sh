#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$ROOT_DIR"

DEV=false
PORT=5050
REINSTALL=false
SKIP_BUILD=false

while [[ $# -gt 0 ]]; do
  case "$1" in
    -d|--dev) DEV=true; shift ;;
    -p|--port) PORT="$2"; shift 2 ;;
    --reinstall) REINSTALL=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

export PORT="$PORT"

ensure_node() {
  if command -v node >/dev/null 2>&1; then
    return
  fi
  echo "Node.js not found. Please install Node 22 LTS (https://nodejs.org) or use a version manager." >&2
  exit 1
}

ensure_deps() {
  if [[ "$REINSTALL" == "true" && -d node_modules ]]; then
    rm -rf node_modules
  fi
  if [[ ! -d node_modules ]]; then
    if [[ -f package-lock.json ]]; then
      npm ci || npm install
    else
      npm install
    fi
  fi
}

ensure_chromium() {
  if command -v "google-chrome" >/dev/null 2>&1 || command -v "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" >/dev/null 2>&1 || command -v "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge" >/dev/null 2>&1; then
    return
  fi
  # Let Puppeteer manage Chrome-for-Testing if no system Chrome/Edge
  npx puppeteer browsers install chrome >/dev/null 2>&1 || true
}

ensure_node
ensure_deps
ensure_chromium

echo "ChallaChat is starting on port $PORT..."
if [[ "$DEV" == "true" ]]; then
  npm run dev
else
  if [[ "$SKIP_BUILD" != "true" ]]; then npm run build; fi
  npm start
fi
