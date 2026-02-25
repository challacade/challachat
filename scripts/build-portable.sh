#!/usr/bin/env bash
# Build ChallaChat portable distribution using electron-builder (unpacked)
# Works on macOS and Linux

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m'

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

# Detect platform flag for electron-builder
detect_platform() {
  case "$(uname -s)" in
    Darwin*)  PLATFORM_FLAG="--mac" ;;
    Linux*)   PLATFORM_FLAG="--linux" ;;
    MINGW*|MSYS*|CYGWIN*) PLATFORM_FLAG="--win" ;;
    *)
      echo -e "${RED}ERROR: Unsupported OS${NC}"
      exit 1
      ;;
  esac
}

write_header "ChallaChat - Portable Electron Build"

detect_platform

# Clean previous builds
echo -e "${YELLOW}Cleaning previous build output...${NC}"
rm -rf build/electron

# Build TypeScript
echo -e "${YELLOW}Compiling TypeScript...${NC}"
run_cmd "npm run build"

# Package with electron-builder (--dir = unpacked, no installer)
echo -e "${YELLOW}Packaging with electron-builder (portable)...${NC}"
run_cmd "npx electron-builder $PLATFORM_FLAG --dir"

# Report results
echo ""
echo -e "${GREEN}=====================================${NC}"
echo -e "${GREEN} Portable build complete!${NC}"
echo -e "${GREEN}=====================================${NC}"
echo ""

OUTPUT_DIR="build/electron"
if [ -d "$OUTPUT_DIR" ]; then
  TOTAL_SIZE=$(du -sh "$OUTPUT_DIR" | cut -f1)
  echo -e "${CYAN}Output: $OUTPUT_DIR/${NC}"
  echo -e "${CYAN}  Total: $TOTAL_SIZE${NC}"
  echo ""

  # Show the main executable
  EXE=$(find "$OUTPUT_DIR" -maxdepth 2 \( -name "ChallaChat" -o -name "ChallaChat.exe" -o -name "challachat" \) -type f 2>/dev/null | head -1)
  if [ -n "$EXE" ]; then
    echo -e "${GREEN}Run with: $EXE${NC}"
  fi
else
  echo -e "${RED}Output directory not found — check electron-builder output above.${NC}"
fi
