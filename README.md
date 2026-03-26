# ChallaChat

Capture and display any livestream chat in a custom overlay. Add it to your streaming software (OBS, Streamlabs, etc.) as a Browser source.

- **Multi-platform** - YouTube, Twitch, and Kick support
- **Multi-connection** - Monitor up to 10 livestreams simultaneously
- **Ultra-low latency** - Local SSE stream to your overlay
- **Secure & private** - All processing runs on your machine
- **Electron admin panel** - Manage connections, appearance, music, and settings from one window
- **Portable & installer** - Windows, Mac, and Linux builds via electron-builder

## Repository layout

```
app/
  capture/      # Livestream chat capture (Puppeteer)
  core/         # Config, SSE hub, censor, logger, music, jam mode, terminal UI
  http/         # Express + Socket.IO server
    routes/     # Modular API route handlers
  main/         # Electron main process, preload, IPC
admin/          # Electron admin panel (HTML/CSS/JS)
  js/           # Admin ES modules (api, appearance, audio, connections, etc.)
overlay/        # Client overlay (HTML/CSS/JS, images, sounds)
  js/           # Overlay ES modules (messages, settings, sse, state, etc.)
shared/         # Shared ES modules used by both admin and overlay (presets, utils)
scripts/        # Build and startup scripts
website/        # Marketing / landing page (static)
```

## How it works

1. The server binds to the default port (5050) and serves both the admin panel and the overlay.
2. You paste a livestream URL into the admin panel (or terminal UI). ChallaChat uses Puppeteer to monitor that stream's chat in real time.
3. Chat messages are normalized, optionally filtered, and broadcast over Server-Sent Events at `/api/stream`.
4. The overlay receives those events and renders messages with full styling - emotes, badges, avatars, donations, subs, and more.

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

> **Note:** `npm install` may show deprecation warnings for packages like `rimraf`, `inflight`, `glob`, and `boolean`. These are transitive dependencies of `electron` and `electron-builder`, not used directly by ChallaChat.

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

| URL | Description |
|-----|-------------|
| `http://localhost:5050` | Overlay (use as OBS Browser source) |
| `http://localhost:5050/admin` | Admin panel (Electron loads this automatically) |
| `http://localhost:5050/api/stream` | SSE event stream |
| `http://localhost:5050/api/status` | Server status JSON |

The port auto-increments if 5050 is already in use (up to 50 attempts).

## Admin panel

### Home
- **Welcome view** - Platform logos, livestream URL input, and a "Start without connecting" link.
- **Active view** - Overlay URL card (with copy button), connection cards with per-stream stats (messages, unique chatters, uptime), poll frequency sliders, and an add-connection card.
- The ChallaChat logo swaps between a muted and vibrant variant to indicate session state.

### Appearance
- **Presets**: Dark, Light, Transparent, Custom.
- **Toggles**: Chat bubbles, Avatars, Badges.
- **Sliders**: Scale, Vertical gap, Text opacity, Bubble opacity, Background opacity.
- **Color pickers**: Text, Bubble, Background.
- **Live preview** rendered in a Shadow DOM with sample messages.
- All changes broadcast instantly to connected overlays via SSE.

### Sound
- **Sound effects** with per-type volume sliders (0-200%) and test buttons for message, donation, and membership sounds.
- **Music player** - Play/pause, previous, next, shuffle, volume (0-200%), mute toggle.
  - Browse for a music folder (Electron file picker) or enter a path manually.
  - Now Playing display with ID3 metadata (title, artist).
  - Song display banner on the overlay (top or bottom) with configurable scroll speed and text size.

### Settings
- **Profanity filter** - Load a CSV word list, toggle on/off. Matched words are replaced with the first letter + asterisks (e.g. `word` -> `w***`).
- **Message logger** - Log chat to `.jsonl` files in `%LOCALAPPDATA%\ChallaChat\logs\` (Windows) or `~/.challachat/logs/` (Linux/Mac).
- **Jam mode** - Toggle the `!jam` command. Viewers jam once per track; songs with 3+ jams get a finale message on track change.
- **Dummy chatters** - Display sample messages at random intervals for testing the overlay without a live stream.
- **Write song to file** - Writes current track to `song.txt` for OBS text sources.

### settings.json

All settings are persisted to `settings.json` in the app data directory:

- **Windows:** `%LOCALAPPDATA%\ChallaChat\settings.json`
- **macOS / Linux:** `~/.challachat/settings.json`

```jsonc
{
  // Music & song display
  "musicPath": "",
  "autoShuffle": false,
  "playlistLoop": true,
  "songDisplay": "none",        // "none", "top", or "bottom"
  "writeSongFile": false,
  "songFilePath": "",
  "songScrollSpeed": 1,         // 0 = off, 1 = 100% (60px/s)
  "songTextSize": 1,            // 0-2, where 1 = 100%

  // Filter
  "filterPath": "",
  "filterActive": false,

  // Appearance
  "scale": 1,
  "textOpacity": 1,
  "bubbleOpacity": 1,
  "bgOpacity": 1,
  "messageGap": 0,
  "textColor": "#ffffff",
  "bubbleColor": "#000000",
  "bgColor": "#000000",
  "showBubbles": true,
  "showAvatars": true,
  "showBadges": true,
  "preset": "dark",
  "overlayFont": "",
  "messageFlow": "",
  "edgePadding": 0,
  "textShadow": 0,
  "transitionSpeed": 0,

  // Sound volumes (0-200)
  "messageVolume": 100,
  "donationVolume": 100,
  "memberVolume": 100,

  // Custom sound file paths
  "messageSoundPath": "",
  "donationSoundPath": "",
  "memberSoundPath": "",

  // Toggles
  "loggerEnabled": false,
  "jamEnabled": false,

  // Logger
  "logFolderPath": "",

  // UI
  "uiZoom": 1,
  "uiTheme": "",
  "filmingMode": false
}
```

## Multi-connection

ChallaChat supports up to **10 simultaneous** livestream connections. Each connection has its own capture instance, poll interval (100-5000 ms), stats tracking, and independent connect/disconnect. Duplicate URLs are rejected.

## Overlay

The overlay renders chat messages with full platform fidelity:

- Inline emotes, platform badges, and author avatars with role-colored rings
- Donation/superchat amounts, sub/membership messages, and reply context
- Real-time message deletion and auto-scaling based on viewport

### Overlay URL parameters

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
| `pagebgop` | Page background opacity (0-100) |

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
| `POST` | `/api/dummy-chatters` | Enable/disable dummy chatters |
| `POST` | `/api/clear-messages` | Clear all overlay messages |
| `GET` | `/api/jam` | Jam mode status |
| `POST` | `/api/jam/toggle` | Enable/disable jam mode |
| `GET` | `/api/stream` | SSE event stream |

## SSE event types

Events on `/api/stream`: `chat`, `appearance`, `sounds`, `music-settings`, `now-playing`, `play-sound`, `clear-messages`, `ping` (heartbeat every 15s).

## Releases (GitHub Actions)

The "Build Full Release" workflow (manual dispatch) creates a tag, builds all platforms (`ChallaChat-Windows-Installer.exe`, `ChallaChat-Windows-Portable.zip`, `ChallaChat-Mac-Portable.tar.gz`, `ChallaChat-Linux-Portable.tar.gz`), and publishes a GitHub Release with auto-generated release notes.

> **Why is the Mac build so much larger?** macOS `.framework` bundles use symlinks internally (e.g. `Electron Framework.framework/Electron Framework` -> `Versions/A/Electron Framework`). Steam's depot system doesn't support symlinks, so the Mac archive is built with dereferenced symlinks - every symlink is replaced with a real copy of the file it points to. This roughly triples the on-disk size compared to a native `.app` bundle, but Steam's CDN deduplicates identical content so the actual download size for users is unaffected.

## License

[Apache-2.0](./LICENSE)
