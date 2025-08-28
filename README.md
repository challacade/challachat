# ChallaChat (TypeScript)

Local-first YouTube Live Chat capture + overlay server. Drop the overlay into OBS and stream in seconds. No cloud, no accounts. ⚡🔒

- Ultra‑low latency local SSE stream to your overlay
- Secure & private: all processing runs on your machine
- Portable Windows build and installer options
- Auto port selection with friendly terminal UI

## Repository layout

```
app/
   capture/      # Livestream chat capture (Puppeteer)
   core/         # config, SSE hub, terminal UI
   http/         # express + socket.io server
overlay/        # client overlay (HTML/CSS/JS, images, sounds)
scripts/windows # build-portable, build-installer, package-zip, etc.
website/        # marketing site (static)
```

## How it works

- Terminal UI binds to the default port (5050), and prompts for a livestream URL.
- Using Puppeteer, the app monitors the livestream chat and normalizes events.
- The Node server hosts the overlay and exposes a Server-Sent Events stream at `/api/stream`.

#### Once active, ChallaChat provides the following endpoints:
Overlay: http://localhost:5050/<br>
SSE stream: http://localhost:5050/api/stream<br>
Status: http://localhost:5050/api/status

#### API snippets:
GET http://localhost:5050/api/poll-interval<br>
POST http://localhost:5050/api/poll-interval { pollIntervalMs: number }

## Getting started

#### Windows
- Run locally: [scripts/windows/start-on-system.ps1](./scripts/windows/start-on-system.ps1)
- Portable build: [scripts/windows/build-portable.ps1](./scripts/windows/build-portable.ps1)
- Installer build: [scripts/windows/build-installer.ps1](./scripts/windows/build-installer.ps1)

## Releases (GitHub Actions)

The "Build Full Release" workflow (manual) prompts for a version (e.g., `1.2.3` or `v1.2.3`), creates tag `vX.Y.Z`, builds both artifacts, and publishes a GitHub Release with:
- challachat-setup.exe (installer)
- challachat-win-portable.zip (zipped portable folder)

Release notes include all commits on `main` since the previous tag.

## Scripts

`npm run dev` — start server in dev mode<br>
`npm run build` — type-check and compile to `dist/`<br>
`npm run build:portable` — portable distribution at `build/challachat-portable/`<br>
`npm run build:installer` — create `build/challachat-setup.exe` (Inno Setup in PATH)

## License

[Apache-2.0](./LICENSE)
