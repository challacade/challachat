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

#### Run locally
- **macOS / Linux:** `npm run start:system`
- **Windows:** `npm run start:system:win`

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
- **Profanity filter** — Load a CSV word list, toggle on/off. Matched words are replaced with the first letter + asterisks (e.g. `word` → `w***`).
- **Message logger** — Log chat to `.jsonl` files in `%LOCALAPPDATA%\ChallaChat\logs\` (Windows) or `~/.challachat/logs/` (Linux/Mac).
- **Jam mode** — Toggle the `!jam` command. Viewers jam once per track; songs with ≥ 3 jams get a finale message on track change.
- **Demo mode** — Display sample messages at random intervals for testing without a live stream.
- **Write song to file** — Writes current track to `song.txt` for OBS text sources.

## Multi-connection

ChallaChat supports up to **5 simultaneous** livestream connections. Each connection has its own:
- Capture instance and poll interval (100–5000 ms)
- Stats tracking (message count, unique chatters, uptime)
- Independent connect/disconnect

Duplicate URLs are rejected. Use "End all connections" to disconnect everything and return to the welcome view.

## Overlay

The overlay renders chat messages with full platform fidelity:

- Inline emotes, platform badges, and author avatars with role-colored rings
- Donation/superchat amounts, sub/membership messages, and reply context
- Real-time message deletion and auto-scaling based on viewport

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

## settings.json

ChallaChat automatically saves all admin panel settings to `settings.json` whenever you make a change. On next launch, saved settings are restored automatically.

Stored in `%LOCALAPPDATA%\ChallaChat\settings.json` (Windows) or `~/.challachat/settings.json` (Linux/Mac):

```json
{
  "scale": 1.35,
  "textOpacity": 1,
  "bubbleOpacity": 0.14,
  "bgOpacity": 0,
  "messageGap": 0.4,
  "textColor": "#ffffff",
  "bubbleColor": "#000000",
  "bgColor": "#000000",
  "showBubbles": true,
  "showAvatars": true,
  "showBadges": true,
  "preset": "Dark",
  "messageVolume": 1,
  "donationVolume": 1,
  "memberVolume": 1,
  "musicPath": "D:/Music/MyPlaylist",
  "autoShuffle": true,
  "playlistLoop": true,
  "songDisplay": "top",
  "songScrollSpeed": 0,
  "songTextSize": 1,
  "writeSongFile": true,
  "filterPath": "D:/filter.csv",
  "filterActive": true,
  "loggerEnabled": false,
  "jamEnabled": false,
  "demoMode": false
}
```

## API reference

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/connect` | Connect to a livestream URL |
| `POST` | `/api/disconnect` | Disconnect a specific connection |
| `POST` | `/api/start-session` | Start session without connecting |
| `POST` | `/api/end-session` | End session and disconnect all |
| `GET` | `/api/status` | Server status and all connections |
| `GET/POST` | `/api/poll-interval` | Get/set poll interval per connection |
| `GET/POST` | `/api/appearance` | Get/set overlay appearance |
| `GET/POST` | `/api/sounds` | Get/set sound volume levels |
| `GET` | `/api/filter` | Filter status |
| `POST` | `/api/filter/toggle` | Enable/disable filter |
| `POST` | `/api/filter/path` | Load filter word list |
| `GET` | `/api/logger` | Logger status |
| `POST` | `/api/logger/toggle` | Enable/disable logging |
| `GET` | `/api/music` | Music settings |
| `POST` | `/api/music/path` | Set music folder |
| `GET` | `/api/music/playlist` | Full playlist |
| `GET` | `/api/music/track/:index` | Stream audio (supports range requests) |
| `GET` | `/api/music/track/:index/meta` | Track ID3 metadata |
| `GET/POST` | `/api/music/nowplaying` | Get/set now-playing track |
| `POST` | `/api/music/songfile` | Write current track to song.txt |
| `GET/POST` | `/api/music/display-settings` | Song display settings |
| `POST` | `/api/music/settings` | Update autoShuffle / playlistLoop |
| `POST` | `/api/demo-mode` | Enable/disable demo mode |
| `GET` | `/api/jam` | Jam mode status |
| `POST` | `/api/jam/toggle` | Enable/disable jam mode |
| `GET` | `/api/stream` | SSE event stream |

## SSE event types

Events on `/api/stream`: `chat`, `appearance`, `sounds`, `music-settings`, `now-playing`, `demo-mode`, `play-sound`, `ping` (heartbeat every 15s).

## Releases (GitHub Actions)

The "Build Full Release" workflow (manual dispatch) creates a tag, builds `ChallaChat-Setup.exe` and `ChallaChat-Portable.exe`, and publishes a GitHub Release with auto-generated release notes.

## License

[Apache-2.0](./LICENSE)
