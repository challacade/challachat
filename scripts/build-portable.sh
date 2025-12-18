#!/usr/bin/env bash
# Portable SEA build for macOS/Linux
# Creates challachat executable next to supporting folders (overlay/, node_modules/)
# Works on both macOS and Linux

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
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

# Detect OS
detect_os() {
  case "$(uname -s)" in
    Darwin*)  OS="macos" ;;
    Linux*)   OS="linux" ;;
    *)        OS="unknown" ;;
  esac
  echo -e "${GREEN}Detected OS: $OS${NC}"
}

write_header "ChallaChat - Portable SEA Build"

detect_os

if [ "$OS" = "unknown" ]; then
  echo -e "${RED}ERROR: Unsupported operating system${NC}"
  exit 1
fi

# Clean build directory
echo -e "${YELLOW}Cleaning build directory...${NC}"
rm -rf build
mkdir -p build

# Build TypeScript
echo -e "${YELLOW}Building TypeScript...${NC}"
run_cmd "npm run build"

# Create optimized structure
echo -e "${YELLOW}Creating optimized directory structure...${NC}"
BUILD_DIR="build/challachat-portable"
mkdir -p "$BUILD_DIR/node_modules"
mkdir -p "$BUILD_DIR/overlay"

# Create optimized webpack config that externalizes ALL dependencies except core modules
echo -e "${YELLOW}Creating optimized app bundle...${NC}"
cat > build/webpack.portable.js << 'WEBPACK_EOF'
const path = require('path');

module.exports = {
  mode: 'production',
  target: 'node',
  entry: './dist/http/server.js',
  output: {
    path: path.resolve(__dirname),
    filename: 'app-bundled.js',
    library: { type: 'commonjs2' }
  },
  externals: {
    // Externalize ALL dependencies to keep the executable smaller
    'puppeteer': 'commonjs2 puppeteer',
    'puppeteer-core': 'commonjs2 puppeteer-core',
    'ws': 'commonjs2 ws',
    'chrome-launcher': 'commonjs2 chrome-launcher',
    'express': 'commonjs2 express',
    'socket.io': 'commonjs2 socket.io',
    'music-metadata': 'commonjs2 music-metadata',
    'iconv-lite': 'commonjs2 iconv-lite'
  },
  resolve: {
    extensions: ['.js', '.json']
  },
  optimization: {
    minimize: true
  },
  node: {
    __dirname: false,
    __filename: false
  }
};
WEBPACK_EOF

run_cmd "npx webpack --config build/webpack.portable.js"

# Copy overlay assets
echo -e "${YELLOW}Copying overlay assets...${NC}"
cp -r overlay/* "$BUILD_DIR/overlay/"

# Install only the heavy external dependencies in node_modules
echo -e "${YELLOW}Installing external dependencies...${NC}"
pushd "$BUILD_DIR" > /dev/null

cat > package.json << 'PACKAGE_EOF'
{
  "name": "challachat-externals",
  "version": "1.0.0",
  "private": true,
  "dependencies": {
    "puppeteer": "^24.9.0",
    "express": "^4.19.2",
    "socket.io": "^4.7.5",
    "music-metadata": "^11.10.3"
  }
}
PACKAGE_EOF

run_cmd "npm install --only=production --no-package-lock"
rm -f package.json

popd > /dev/null

# Create the main launcher script that will be embedded in SEA
echo -e "${YELLOW}Creating SEA launcher...${NC}"
cat > build/sea-main.js << 'SEA_MAIN_EOF'
/**
 * ChallaChat - Optimized SEA Launcher
 * Embedded in the executable, loads external dependencies
 */

const path = require('path');
const fs = require('fs');

// Get the directory where this executable is located
const exeDir = path.dirname(process.execPath);
const overlayDir = path.join(exeDir, 'overlay');
const nodeModulesDir = path.join(exeDir, 'node_modules');

// Set up environment
process.env.CHALLACHAT_OVERLAY_DIR = overlayDir;
process.env.CHALLACHAT_PORTABLE = 'true';
process.env.NODE_PATH = nodeModulesDir;

console.log('Starting ChallaChat (Optimized SEA)...');
console.log('Executable directory:', exeDir);
console.log('Overlay assets:', overlayDir);
console.log('External modules:', nodeModulesDir);
console.log('');

// Check if required directories exist
const requiredDirs = [overlayDir, nodeModulesDir];
for (const dir of requiredDirs) {
  if (!fs.existsSync(dir)) {
    console.error('Error: Required directory not found:', dir);
    console.error('Make sure you have extracted the complete ChallaChat distribution.');
    process.exit(1);
  }
}

// Add node_modules to the require resolution path
const originalResolve = require.resolve;
require.resolve = function(id, options) {
  // For non-core modules, check our external node_modules first
  if (!id.startsWith('node:') && !id.startsWith('.') && !id.startsWith('/')) {
    try {
      return originalResolve(id, {
        ...options,
        paths: [nodeModulesDir, ...(options && options.paths || [])]
      });
    } catch (e) {
      // Fall back to original resolution
    }
  }
  return originalResolve(id, options);
};

// Load and start the bundled application from SEA assets
try {
  const sea = require('node:sea');
  if (sea && sea.isSea && sea.isSea()) {
    // We're running in SEA mode - load the embedded app
    console.log('Loading embedded application...');
    const appCode = sea.getAsset('app-bundled.js', 'utf8');
    
    // Set up proper context for the bundled app
    const Module = require('module');
    const vm = require('vm');
    
    // Create a new module for our app
    const appModule = new Module('app-bundled.js', null);
    appModule.filename = path.join(exeDir, 'app-bundled.js');
    appModule.paths = Module._nodeModulePaths(exeDir);
    appModule.paths.unshift(nodeModulesDir);
    
    // Set up the context
    const context = vm.createContext({
      require: appModule.require.bind(appModule),
      module: appModule,
      exports: appModule.exports,
      __dirname: exeDir,
      __filename: appModule.filename,
      process: process,
      console: console,
      global: global,
      Buffer: Buffer,
      setTimeout: setTimeout,
      setInterval: setInterval,
      clearTimeout: clearTimeout,
      clearInterval: clearInterval,
      setImmediate: setImmediate,
      clearImmediate: clearImmediate
    });
    
    vm.runInContext(appCode, context, { filename: appModule.filename });
    
  } else {
    // Fallback for non-SEA mode
    console.error('This should only run in SEA mode');
    process.exit(1);
  }
} catch (error) {
  console.error('Failed to start ChallaChat:', error.message);
  console.error(error.stack);
  process.exit(1);
}
SEA_MAIN_EOF

# Create SEA config
echo -e "${YELLOW}Creating SEA configuration...${NC}"
cat > build/sea-config.json << 'SEA_CONFIG_EOF'
{
  "main": "build/sea-main.js",
  "output": "build/sea-prep.blob",
  "disableExperimentalSEAWarning": true,
  "useCodeCache": true,
  "assets": {
    "app-bundled.js": "build/app-bundled.js"
  }
}
SEA_CONFIG_EOF

# Generate SEA blob
echo -e "${YELLOW}Generating SEA blob...${NC}"
run_cmd "node --experimental-sea-config build/sea-config.json"

# Create the base executable from Node.js
echo -e "${YELLOW}Creating base executable...${NC}"
NODE_EXE_PATH=$(which node)
BASE_EXE_PATH="$BUILD_DIR/challachat-base"
FINAL_EXE_PATH="$BUILD_DIR/challachat"

cp "$NODE_EXE_PATH" "$BASE_EXE_PATH"

# Remove code signature on macOS (required before modifying the binary)
if [ "$OS" = "macos" ]; then
  echo -e "${YELLOW}Removing code signature (macOS)...${NC}"
  codesign --remove-signature "$BASE_EXE_PATH" 2>/dev/null || true
fi

# Inject the SEA blob using postject
echo -e "${YELLOW}Injecting SEA blob into executable...${NC}"
if [ "$OS" = "macos" ]; then
  run_cmd "npx postject '$BASE_EXE_PATH' NODE_SEA_BLOB build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2 --macho-segment-name NODE_SEA"
else
  run_cmd "npx postject '$BASE_EXE_PATH' NODE_SEA_BLOB build/sea-prep.blob --sentinel-fuse NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2"
fi

# Rename to final executable
mv "$BASE_EXE_PATH" "$FINAL_EXE_PATH"

# Make executable
chmod +x "$FINAL_EXE_PATH"

# Optionally re-sign on macOS (ad-hoc signature for local use)
if [ "$OS" = "macos" ]; then
  echo -e "${YELLOW}Applying ad-hoc code signature (macOS)...${NC}"
  codesign --sign - "$FINAL_EXE_PATH" 2>/dev/null || true
fi

# Create README
cat > "$BUILD_DIR/README.txt" << 'README_EOF'
=======================================
ChallaChat - Portable SEA Distribution
=======================================

This is a portable version using Node.js 24 Single Executable Application.

Directory Structure:
├── challachat            # Executable with embedded Node.js runtime
├── README.txt            # This file  
├── node_modules/         # External dependencies
│   ├── puppeteer/
│   ├── express/
│   ├── socket.io/
│   └── music-metadata/
└── overlay/              # Web assets
    ├── index.html
    ├── app.js
    ├── styles.css
    └── favicon.ico

Usage:
1. Run ./challachat from terminal (or double-click on some systems)
2. Paste a livestream URL when prompted
3. Add a Browser Source in OBS pointing to http://localhost:5050/

Note: On macOS, you may need to allow the app in System Preferences > 
Security & Privacy if you see a warning about unidentified developer.
README_EOF

# Calculate sizes
echo ""
echo -e "${GREEN}=============================${NC}"
echo -e "${GREEN}Portable SEA build complete!${NC}"
echo -e "${GREEN}=============================${NC}"
echo ""

# Get sizes
if [ "$OS" = "macos" ]; then
  TOTAL_SIZE=$(du -sh "$BUILD_DIR" | cut -f1)
  EXE_SIZE=$(du -h "$FINAL_EXE_PATH" | cut -f1)
  NODE_MODULES_SIZE=$(du -sh "$BUILD_DIR/node_modules" | cut -f1)
  OVERLAY_SIZE=$(du -sh "$BUILD_DIR/overlay" | cut -f1)
else
  TOTAL_SIZE=$(du -sh "$BUILD_DIR" | cut -f1)
  EXE_SIZE=$(du -h "$FINAL_EXE_PATH" | cut -f1)
  NODE_MODULES_SIZE=$(du -sh "$BUILD_DIR/node_modules" | cut -f1)
  OVERLAY_SIZE=$(du -sh "$BUILD_DIR/overlay" | cut -f1)
fi

echo -e "${CYAN}Output: build/challachat-portable/${NC}"
echo -e "${CYAN}  - challachat:     $EXE_SIZE${NC}"
echo -e "${CYAN}  - node_modules/:  $NODE_MODULES_SIZE${NC}"
echo -e "${CYAN}  - overlay/:       $OVERLAY_SIZE${NC}"
echo -e "${CYAN}  - Total:          $TOTAL_SIZE${NC}"
echo ""

# Clean up build artifacts
echo -e "${YELLOW}Cleaning up...${NC}"
rm -f build/webpack.portable.js
rm -f build/sea-config.json
rm -f build/sea-prep.blob
rm -f build/sea-main.js
rm -f build/app-bundled.js

echo -e "${GREEN}Done!${NC}"
