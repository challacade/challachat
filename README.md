# ChallaChat

Capture and display any livestream chat in a custom overlay. Add it to your streaming software (OBS, Streamlabs, etc.) as a Browser source.

- **Multi-platform** — YouTube, Twitch, and Kick support
- **Multi-connection** — Monitor up to 5 livestreams simultaneously
- **Ultra-low latency** — Local SSE stream to your overlay
- **Secure & private** — All processing runs on your machine
- **Electron admin panel** — Manage connections, appearance, music, and settings from one window
- **Portable & installer** — Windows executable builds via electron-builder

## Repository layout

```
app/
  capture/      # Livestream chat capture (Puppeteer)
  core/         # Config, SSE hub, censor, logger, music, jam mode, terminal UI
  http/         # Express + Socket.IO server, API routes
  main/         # Electron main process, preload, IPC
admin/          # Electron admin panel (HTML/CSS/JS)
overlay/        # Client overlay (HTML/CSS/JS, images, sounds)
scripts/        # Build and startup scripts
website/        # Marketing / landing page (static)
```

## How it works

1. The server binds to the default port (5050) and serves both the admin panel and the overlay.
2. You paste a livestream URL into the admin panel (or terminal UI). ChallaChat uses Puppeteer to monitor that stream's chat in real time.
3. Chat messages are normalized, optionally filtered, and broadcast over Server-Sent Events at `/api/stream`.
4. The overlay receives those events and renders messages with full styling — emotes, badges, avatars, donations, subs, and more.

## Supported platforms

| Platform | Accepted URL formats |
|----------|---------------------|
| **YouTube** | `/watch?v=`, `/live/`, `youtu.be/` short links, YouTube Studio live URLs |
| **Twitch** | `twitch.tv/channel`, `/chat`, `/popout/.../chat` |
| **Kick** | `kick.com/channel`, `/popout/.../chat` |

## Getting started

```bash
npm install
```

#### Run in Electron (recommended)
```bash
npm run electron:dev
```

#### Run in terminal (no Electron)
```bash
npm run dev
```

#### macOS / Linux
- Run locally: `npm run start:system` or [scripts/start-on-system.sh](./scripts/start-on-system.sh)

#### Windows
- Run locally: `npm run start:system:win` or [scripts/windows/start-on-system.ps1](./scripts/windows/start-on-system.ps1)

#### Build distributables
```bash
npm run dist:win    # Windows NSIS installer + portable
npm run dist:mac    # macOS DMG + ZIP
npm run dist:linux  # Linux AppImage + DEB
```

## Endpoints

Once running, ChallaChat provides:

| URL | Description |
|-----|-------------|
| `http://localhost:5050` | Overlay (use as OBS Browser source) |
| `http://localhost:5050/admin` | Admin panel (Electron loads this automatically) |
| `http://localhost:5050/api/stream` | SSE event stream |
| `http://localhost:5050/api/status` | Server status JSON |

The port auto-increments if 5050 is already in use (up to 50 attempts).

## Admin panel

The Electron admin panel provides a full GUI for managing ChallaChat:

### Home page
- **Welcome view** — Platform logos, livestream URL input, and a "Start without connecting" link.
- **Active view** — Overlay URL card (with copy button), dynamic connection cards showing per-stream stats (messages, unique chatters, uptime), adjustable poll frequency sliders, and an add-connection card for connecting additional streams.
- The ChallaChat logo swaps between a muted and vibrant variant to indicate session state.

### Appearance page
- **Presets**: Dark, Light, Transparent, Custom.
- **Toggles**: Chat bubbles, Avatars, Badges.
- **Sliders**: Scale, Vertical gap, Text opacity, Bubble opacity, Background opacity.
- **Color pickers**: Text, Bubble, Background.
- **Live preview** rendered in a Shadow DOM with sample messages.
- All changes broadcast instantly to connected overlays via SSE.

### Sound page
- **Sound effects** with per-type volume sliders (0–200%) and test buttons:
  - Message sound — standard chat messages
  - Donation sound — donations and cheers
  - Membership sound — subs, gifts, milestones
- **Music player** — Built-in playlist player with play/pause, previous, next, shuffle controls.
  - Now Playing display with ID3 metadata (title, artist).
  - Volume slider (0–200%) with mute toggle.
  - Browse for a music folder (Electron file picker) or enter a path manually.
  - Song display banner on the overlay (top or bottom) with configurable scroll speed and text size.

### Settings page
- **Profanity filter** — Load a CSV word list, toggle on/off.
- **Message logger** — Toggle chat logging to `.jsonl` files.
- **Jam mode** — Toggle the `!jam` chat command.
- **Demo mode** — Toggle demo mode for testing without a live stream.
- **Write song to file** — Writes current track to `song.txt` for OBS text sources.

## Multi-connection

ChallaChat supports up to **5 simultaneous** livestream connections. Each connection has its own:
- Capture instance and poll interval (100–5000 ms)
- Stats tracking (message count, unique chatters, uptime)
- Independent connect/disconnect

Duplicate URLs are rejected. Use "End all connections" to disconnect everything and return to the welcome view.

## Overlay

The overlay renders chat messages with full platform fidelity:

- Inline emotes alongside text
- Author avatars with role-colored rings (owner, mod, member, verified)
- Platform badges (images with emoji fallbacks)
- Donation/superchat amounts with color
- Sub and membership system messages
- Reply context (responding to @user)
- Real-time message deletion
- Auto-scaling based on viewport

### Overlay URL parameters

Customize the overlay via query parameters:

| Parameter | Description |
|-----------|-------------|
| `preset` | `dark`, `light`, `transparent` |
| `scale` | Scale factor (e.g. `1.5`) |
| `noavatars` | Hide avatars |
| `nobadges` | Hide badges |
| `nobubbles` | Hide chat bubbles |
| `gap` | Vertical gap between messages |
| `text` | Text color (hex without `#`) |
| `bubble` | Bubble color (hex) |
| `bg` | Background color (hex) |
| `pagebgcol` | Page background color (hex) |
| `pagebgop` | Page background opacity (0–100) |

## Profanity filter

1. Create a CSV file with one bad word per line (or comma-separated).
2. In the admin Settings page, click **Browse** to select the file.
3. Toggle **Enable filter** to activate censoring.

Words are replaced with the first letter + asterisks (e.g. `word` → `w***`). The filter path is saved to `settings.json` and reloaded on next launch.

## Message logging

When enabled, chat messages are logged to JSON Lines files:

- **Windows:** `%LOCALAPPDATA%\ChallaChat\logs\`
- **Linux/Mac:** `~/.challachat/logs/`

Filename pattern: `chat-{date}-{platform}.jsonl`. Each line:
```json
{"ts":1733788800000,"author":"Username","text":"Hello world!","kind":"text"}
{"ts":1733788805000,"author":"Donor","text":"Great stream!","kind":"donation","amount":"$5.00"}
```

## Music player & song.txt

ChallaChat includes a music player that streams audio to the overlay and optionally writes the current track to a text file for OBS.

### Terminal music hotkeys

When `enableMusicHotkeys` is `true` in settings:

| Key | Action |
|-----|--------|
| `m` | Play / Pause |
| `<` | Previous track |
| `>` | Next track |
| `?` | Shuffle |

### settings.json

Stored in `%LOCALAPPDATA%\ChallaChat\settings.json` (Windows) or `~/.challachat/settings.json` (Linux/Mac):

```json
{
  "musicPath": "D:/Music/MyPlaylist",
  "enableMusicHotkeys": true,
  "jamCountMinimum": 3,
  "autoShuffle": true,
  "playlistLoop": true,
  "disableSongIdNotes": false,
  "filterPath": "D:/filter.csv",
  "writeSongFile": true,
  "songDisplay": "top",
  "songScrollSpeed": 100,
  "songTextSize": 100
}
```

## Jam mode

Viewers type `!jam` in chat to jam along to the current song. Each viewer can jam once per track. When the song changes and the previous song received enough jams (≥ `jamCountMinimum`), a finale system message is broadcast: *"'Song Title' got N jams!"*

## Demo mode

Demo mode displays sample chat messages at random intervals for testing the overlay without a live stream. Enable it from the admin Settings page, the overlay settings panel, or visit `demo.challachat.com`.

## API reference

### Connection management
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/connect` | Connect to a livestream URL |
| `POST` | `/api/disconnect` | Disconnect a specific connection |
| `POST` | `/api/start-session` | Start session without connecting |
| `POST` | `/api/end-session` | End session and disconnect all |
| `GET` | `/api/status` | Server status and all connections |

### Capture settings
| Method | Path | Description |
|--------|------|-------------|
| `GET/POST` | `/api/poll-interval` | Get/set poll interval per connection |
| `GET/POST` | `/api/appearance` | Get/set overlay appearance |
| `GET/POST` | `/api/sounds` | Get/set sound volume levels |

### Filter & logger
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/filter` | Filter status |
| `POST` | `/api/filter/toggle` | Enable/disable filter |
| `POST` | `/api/filter/path` | Load filter word list |
| `GET` | `/api/logger` | Logger status |
| `POST` | `/api/logger/toggle` | Enable/disable logging |

### Music
| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/music` | Music settings |
| `POST` | `/api/music/path` | Set music folder |
| `GET` | `/api/music/playlist` | Full playlist |
| `GET` | `/api/music/track/:index` | Stream audio (supports range requests) |
| `GET` | `/api/music/track/:index/meta` | Track ID3 metadata |
| `GET/POST` | `/api/music/nowplaying` | Get/set now-playing track |
| `POST` | `/api/music/songfile` | Write current track to song.txt |
| `GET/POST` | `/api/music/display-settings` | Song display settings |

### Other
| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/demo-mode` | Enable/disable demo mode |
| `GET/POST` | `/api/jam` | Jam mode status |
| `POST` | `/api/jam/toggle` | Enable/disable jam mode |
| `GET` | `/api/stream` | SSE event stream |

## SSE event types

| Event | Description |
|-------|-------------|
| `chat` | New chat message |
| `appearance` | Overlay appearance update |
| `sounds` | Sound volume update |
| `music-settings` | Music display settings update |
| `now-playing` | Current track changed |
| `demo-mode` | Demo mode toggled |
| `play-sound` | Trigger a sound effect |
| `music-control` | Music player control (play, pause, next, prev, shuffle) |
| `ping` | Heartbeat (every 15s) |
| `end` | Stream ended |

## Releases (GitHub Actions)

The "Build Full Release" workflow (manual) prompts for a version, creates a tag, builds both artifacts, and publishes a GitHub Release with:
- `ChallaChat-Setup.exe` (NSIS installer)
- `ChallaChat-Portable.exe` (portable)

Release notes include all commits on `main` since the previous tag.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start server in dev mode (tsx) |
| `npm run build` | Type-check and compile to `dist/` |
| `npm run electron:dev` | Build + launch Electron |
| `npm run dist:win` | Windows installer + portable |
| `npm run dist:mac` | macOS DMG + ZIP |
| `npm run dist:linux` | Linux AppImage + DEB |

## License

[Apache-2.0](./LICENSE)
