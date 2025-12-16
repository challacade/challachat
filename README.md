# ChallaChat

Capture and display any livestream chat in a custom overlay. You can add this to your streaming software (OBS, Streamlabs) using a Browser source. 

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

GET http://localhost:5050/api/filter<br>
POST http://localhost:5050/api/filter/reload

## Getting started

#### Windows
- Run locally: [scripts/windows/start-on-system.ps1](./scripts/windows/start-on-system.ps1)
- Portable build: [scripts/windows/build-portable.ps1](./scripts/windows/build-portable.ps1)
- Installer build: [scripts/windows/build-installer.ps1](./scripts/windows/build-installer.ps1)

## Profanity Filter

ChallaChat includes an optional profanity filter that censors bad words in chat messages.

#### Setup
1. Create a file named `censor.csv` with one bad word per line (or comma-separated)
2. Place it in one of these locations (checked in order):
   - Next to the ChallaChat executable (portable builds)
   - Current working directory
   - `~/.challachat/censor.csv` (Linux/Mac)
   - `%LOCALAPPDATA%\ChallaChat\censor.csv` (Windows)

#### Example censor.csv
```
badword1
badword2
another,phrase,here
```

The filter loads automatically on startup. Use `POST /api/filter/reload` to reload after editing the file.

## Message Logging

ChallaChat can optionally log all chat messages to a JSON Lines file for archival or later review.

#### Enabling Logging
1. Open the overlay in your browser
2. Click the ⚙️ (Settings) button
3. Check the "Log Messages" checkbox

#### Log File Location
Logs are saved to:
- **Windows:** `%LOCALAPPDATA%\ChallaChat\logs\`
- **Linux/Mac:** `~/.challachat/logs/`

Each capture session creates a new file named `chat-{videoId}-{date}_{time}.jsonl`.

#### Log Format
Each line is a JSON object with the message data:
```json
{"ts":1733788800000,"author":"Username","text":"Hello world!","kind":"text","id":"abc123"}
{"ts":1733788805000,"author":"Donor","text":"Great stream!","kind":"donation","amount":"$5.00","id":"def456"}
```

#### API Endpoints
GET /api/logger — Get logger status<br>
POST /api/logger/toggle { enabled: boolean } — Enable/disable logging

## Music + song.txt

ChallaChat can serve a local music playlist and optionally write the current song to a text file for OBS overlays.

- Settings file: `%LOCALAPPDATA%\ChallaChat\settings.json` (Windows)
- Song file: `%LOCALAPPDATA%\ChallaChat\song.txt` (Windows)

### Terminal music hotkeys

When a stream is connected and a non-empty playlist is available, you can control the overlay music player from the terminal:

- `m` — play/pause
- `<` — previous track
- `>` — next track
- `?` — shuffle

### settings.json options

```json
{
   "musicPath": "D:/Music/MyPlaylist",
   "maxSongIdLength": 80,
   "enableMusicHotkeys": true,
   "jamCountMinimum": 3
}
```

- `musicPath` — Folder to scan for music files.
- `maxSongIdLength` — Optional maximum length for the song id string ("Title - Artist"). If the song id exceeds this length, it’s truncated and suffixed with `...`. This applies to both `song.txt` output (still wrapped in musical notes) and system messages like the `!jam` finale.
- `enableMusicHotkeys` — Optional; when `true`, enables terminal hotkeys (`m`, `<`, `>`, `?`) to control overlay music.
- `jamCountMinimum` — Optional minimum number of jams required before the jam finale message is sent when the song changes.

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
