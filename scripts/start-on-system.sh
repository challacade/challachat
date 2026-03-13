#!/usr/bin/env bash
# Start ChallaChat using system Node.js and dependencies
# Runs directly from source without building executables
# Works on both macOS and Linux

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
WHITE='\033[1;37m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(dirname "$SCRIPT_DIR")"

cd "$ROOT_DIR"

run_cmd() {
  echo -e "${CYAN}Running: $1${NC}"
  eval "$1"
}

write_header() {
  echo ""
  echo -e "${MAGENTA}$1${NC}"
  echo -e "${MAGENTA}$(printf '=%.0s' $(seq 1 ${#1}))${NC}"
  echo ""
}

check_node_version() {
  if ! command -v node &> /dev/null; then
    echo -e "${RED}ERROR: Node.js is not installed or not in PATH${NC}"
    echo -e "${RED}Please install Node.js 24+ from https://nodejs.org/${NC}"
    exit 1
  fi

  NODE_VERSION=$(node --version)
  VERSION_NUMBER=${NODE_VERSION#v}
  MAJOR_VERSION=$(echo "$VERSION_NUMBER" | cut -d. -f1)

  echo -e "${GREEN}Detected Node.js version: $NODE_VERSION${NC}"

  if [ "$MAJOR_VERSION" -lt 24 ]; then
    echo -e "${YELLOW}WARNING: Node.js 24+ is recommended. Current version is $NODE_VERSION${NC}"
    echo -e "${YELLOW}The app may still work, but some features might not be available.${NC}"
  fi
}

check_dependencies() {
  local need_install=false

  if [ ! -d "node_modules" ]; then
    need_install=true
  elif [ "$TERMINAL_MODE" = true ] && [ ! -d "node_modules/tsx" ]; then
    need_install=true
  elif [ "$TERMINAL_MODE" != true ] && [ ! -d "node_modules/electron" ]; then
    need_install=true
  fi

  if [ "$need_install" = true ]; then
    echo -e "${YELLOW}Installing dependencies...${NC}"
    run_cmd "npm install"
  else
    echo -e "${GREEN}Dependencies found.${NC}"
  fi
}

start_application() {
  if [ "$TERMINAL_MODE" = true ]; then
    echo ""
    echo -e "${GREEN}Starting ChallaChat (terminal mode)...${NC}"
    echo -e "${YELLOW}The app will be available at:${NC}"
    echo -e "${WHITE}  http://localhost:5050${NC}"
    echo ""
    echo -e "${YELLOW}Press Ctrl+C to stop the server${NC}"
    echo ""
    run_cmd "npx tsx app/http/server.ts"
  else
    echo -e "${YELLOW}Compiling TypeScript...${NC}"
    run_cmd "npm run build"

    echo ""
    echo -e "${GREEN}Starting ChallaChat (Electron)...${NC}"
    echo ""

    # Launch Electron as a detached process so this terminal can close
    ELECTRON_BIN="$ROOT_DIR/node_modules/.bin/electron"
    nohup "$ELECTRON_BIN" . > /dev/null 2>&1 &
    echo -e "${GREEN}ChallaChat is running. You can close this terminal.${NC}"
  fi
}

# Parse flags
TERMINAL_MODE=false
for arg in "$@"; do
  case "$arg" in
    --terminal) TERMINAL_MODE=true ;;
  esac
done

# Main script
write_header "ChallaChat - System Start"

# Check system requirements
echo -e "${YELLOW}Checking system requirements...${NC}"
check_node_version
check_dependencies

echo ""
start_application
