ChallaChat (TypeScript)

A full TypeScript refactor of the standalone ChallaChat app. It scrapes YouTube Live Chat locally with Puppeteer and serves a browser overlay you can drop into OBS. No cloud services required.

Key URLs (default port 5050)

- Overlay: http://localhost:5050/
- SSE stream: http://localhost:5050/api/stream
- Status: http://localhost:5050/api/status

Quick start

1) Install Node.js 18+.
2) From this folder:
   - dev (auto-reload via tsx): npm run dev
   - production build: npm run build; npm start
3) In the terminal prompt, paste a YouTube livestream URL when asked.
4) In OBS, add a Browser Source pointing to http://localhost:5050/

Notes

- Poll interval can be adjusted from the overlay Settings panel (General tab). The server clamps to >= 100ms.
- Everything runs locally. If YouTube changes the chat DOM, selectors in the scraper may need updates.
# challachat
Overlay application that displays any YouTube/Twitch livestream in a local Browser source for OBS/Streamlabs/etc
