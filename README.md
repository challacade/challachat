# ChallaChat (TypeScript)

A full TypeScript refactor of the standalone ChallaChat app. It scrapes YouTube Live Chat locally with Puppeteer and serves a browser overlay you can drop into OBS. No cloud services required.

## Key URLs (default port 3000)

- Overlay: http://localhost:3000/
- SSE stream: http://localhost:3000/api/stream
- Status: http://localhost:3000/api/status

## Quick Start

### Development
1. Install Node.js 24+ (required for SEA support)
2. From this folder:
   ```bash
   npm install
   npm run dev
   ```
3. In the terminal prompt, paste a YouTube livestream URL when asked
4. In OBS, add a Browser Source pointing to http://localhost:3000/

### Production Build
1. Install Node.js 24+ (required for Single Executable Applications)
2. Build the self-contained executable:
   ```bash
   npm run build:win  # Creates build/challachat.exe
   ```
3. Run the executable:
   ```bash
   .\build\challachat.exe
   ```

## Build System

This project uses **Node.js 24 Single Executable Applications (SEA)** to create a self-contained executable that includes:
- Node.js runtime
- All dependencies
- Static assets (HTML, CSS, JS, images, sounds)

The build process:
1. Compiles TypeScript to JavaScript
2. Bundles all dependencies with Webpack
3. Generates SEA blob with embedded assets
4. Injects the blob into a Node.js binary

## Notes

- Poll interval can be adjusted from the overlay Settings panel (General tab). The server clamps to >= 100ms
- Everything runs locally. If YouTube changes the chat DOM, selectors in the scraper may need updates
- The SEA executable is fully portable and doesn't require Node.js to be installed on the target machine
