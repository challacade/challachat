import { Router, type Request, type Response } from 'express';
import path from 'path';
import fs from 'fs';
import { getMusicDisplaySettings, getMusicSettingsStatus, updateSettings, writeSongTxt } from '../../core/settings';
import { getTrackByIndex, getTrackMetaByIndex, refreshPlaylist } from '../../core/music';
import { getNowPlaying, setNowPlayingByIndex } from '../../core/nowPlaying';
import { getJamStatus, onNowPlayingUpdated, setJamEnabled } from '../../core/jam';
import type { RouteContext } from './context';

/** Broadcast a jam-finale system message if a finale was triggered. */
function announceJamFinale(ctx: RouteContext, finale: ReturnType<typeof onNowPlayingUpdated>) {
  if (!finale) return;
  const quotedSongId = `'${String(finale.songId).replace(/'/g, '\u2019')}'`;
  ctx.broadcastSystemMessage(`${quotedSongId} got ${finale.jamCount} jams!`, { showUsername: false, effects: { jamFinale: true } });
}

/** Routes: /api/music/*, /api/jam/* */
export function createMusicRouter(ctx: RouteContext): Router {
  const router = Router();

  // ── Music settings ──

  router.get('/music', (_req: Request, res: Response) => {
    res.json(getMusicSettingsStatus());
  });

  router.get('/music/display-settings', (_req: Request, res: Response) => {
    res.json(getMusicDisplaySettings());
  });

  router.post('/music/display-settings', (req: Request, res: Response) => {
    const patch: Record<string, unknown> = {};
    if (typeof req.body?.songDisplay === 'string') {
      const val = req.body.songDisplay;
      patch.songDisplay = ['none', 'top', 'bottom'].includes(val) ? val : 'none';
    }
    if (typeof req.body?.writeSongFile === 'boolean') {
      patch.writeSongFile = req.body.writeSongFile;
    }
    if (typeof req.body?.songFilePath === 'string') {
      patch.songFilePath = req.body.songFilePath;
    }
    if (typeof req.body?.songScrollSpeed === 'number') {
      patch.songScrollSpeed = Math.max(0, Math.min(2, req.body.songScrollSpeed));
    }
    if (typeof req.body?.songTextSize === 'number') {
      patch.songTextSize = Math.max(0, Math.min(2, req.body.songTextSize));
    }
    const result = updateSettings(patch);
    if (!result.ok) {
      res.status(500).json({ error: 'Failed to write settings' });
      return;
    }
    const current = getMusicDisplaySettings();
    ctx.sse.send('music-settings', current);
    res.json({ ok: true, ...current });
  });

  router.post('/music/settings', (req: Request, res: Response) => {
    const patch: Record<string, unknown> = {};
    if (typeof req.body?.autoShuffle === 'boolean') {
      patch.autoShuffle = req.body.autoShuffle;
    }
    if (typeof req.body?.playlistLoop === 'boolean') {
      patch.playlistLoop = req.body.playlistLoop;
    }
    if (typeof req.body?.musicVolume === 'number') {
      patch.musicVolume = Math.max(0, Math.min(2, req.body.musicVolume));
    }
    if (typeof req.body?.musicPan === 'number') {
      patch.musicPan = Math.max(-1, Math.min(1, req.body.musicPan));
    }
    const result = updateSettings(patch);
    if (!result.ok) {
      res.status(500).json({ error: 'Failed to write settings' });
      return;
    }
    res.json({ ok: true, autoShuffle: result.settings.autoShuffle === true, playlistLoop: result.settings.playlistLoop !== false });
  });

  router.post('/music/path', (req: Request, res: Response) => {
    const musicPath = typeof req.body?.musicPath === 'string' ? req.body.musicPath.trim() : '';
    const result = updateSettings({ musicPath: musicPath || undefined });
    if (!result.ok) {
      res.status(500).json({ error: 'Failed to write settings' });
      return;
    }
    const current = refreshPlaylist();
    res.json({
      ok: true,
      musicPath: musicPath || null,
      playlist: current.playlist,
      count: current.playlist.length
    });
  });

  // ── Now playing ──

  router.get('/music/nowplaying', (_req: Request, res: Response) => {
    const now = getNowPlaying();
    res.json({ nowPlaying: now ? { index: now.index, songId: now.songId, updatedAt: now.updatedAt } : null });
  });

  router.post('/music/nowplaying', (req: Request, res: Response) => {
    const idx = Number(req.body?.index);
    if (!Number.isInteger(idx) || idx < 0) {
      res.status(400).json({ error: 'Invalid index' });
      return;
    }
    const songId = typeof req.body?.songId === 'string' ? req.body.songId : undefined;
    const now = setNowPlayingByIndex(idx, songId);
    announceJamFinale(ctx, onNowPlayingUpdated(now));
    res.json({ ok: true, nowPlaying: now ? { index: now.index, songId: now.songId, updatedAt: now.updatedAt } : null });
    if (now) {
      ctx.sse.send('now-playing', { songId: now.songId, index: now.index });
    }
  });

  // ── Playlist & tracks ──

  router.get('/music/playlist', (_req: Request, res: Response) => {
    const current = refreshPlaylist();
    res.json({
      musicPath: current.musicPath,
      playlist: current.playlist,
      count: current.playlist.length,
      scannedAt: current.scannedAt
    });
  });

  router.get('/music/track/:index/meta', async (req: Request, res: Response) => {
    const idx = Number(req.params.index);
    if (!Number.isInteger(idx) || idx < 0) {
      res.status(400).json({ error: 'Invalid index' });
      return;
    }
    const filePath = getTrackByIndex(idx);
    if (!filePath) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }
    try {
      const meta = await getTrackMetaByIndex(idx);
      res.json({ title: meta?.title ?? null, artist: meta?.artist ?? null });
    } catch {
      res.status(500).json({ error: 'Failed to read track metadata' });
    }
  });

  router.post('/music/songfile', async (req: Request, res: Response) => {
    const idx = Number(req.body?.index);
    if (!Number.isInteger(idx) || idx < 0) {
      res.status(400).json({ error: 'Invalid index' });
      return;
    }

    const songId = typeof req.body?.songId === 'string' ? req.body.songId : undefined;
    const now = setNowPlayingByIndex(idx, songId);
    announceJamFinale(ctx, onNowPlayingUpdated(now));

    const filePath = getTrackByIndex(idx);
    if (!filePath) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }

    let title: string | null = null;
    let artist: string | null = null;
    try {
      const meta = await getTrackMetaByIndex(idx);
      title = meta?.title ?? null;
      artist = meta?.artist ?? null;
    } catch {
      // fallback to filename
    }

    const fallbackTitle = path.basename(filePath, path.extname(filePath));
    const finalTitle = (typeof title === 'string' && title.trim()) ? title.trim() : fallbackTitle;
    const finalArtist = (typeof artist === 'string' && artist.trim()) ? artist.trim() : null;
    const details = finalArtist ? `${finalTitle} - ${finalArtist}` : finalTitle;
    const line = `\u266b  ${details}  \u266b`;

    const writeResult = writeSongTxt(line);
    if (!writeResult.ok) {
      res.status(500).json({ error: 'Failed to write song file', path: writeResult.path });
      return;
    }
    res.json({ ok: true, path: writeResult.path, line });
  });

  router.get('/music/track/:index', (req: Request, res: Response) => {
    const idx = Number(req.params.index);
    const filePath = getTrackByIndex(idx);
    if (!filePath) {
      res.status(404).json({ error: 'Track not found' });
      return;
    }
    try {
      const stat = fs.statSync(filePath);
      const total = stat.size;
      const range = req.headers.range;

      const MIME_TYPES: Record<string, string> = {
        '.mp3': 'audio/mpeg',
        '.wav': 'audio/wav',
        '.ogg': 'audio/ogg',
        '.flac': 'audio/flac',
        '.aac': 'audio/aac',
        '.m4a': 'audio/mp4',
        '.opus': 'audio/opus',
        '.wma': 'audio/x-ms-wma',
        '.webm': 'audio/webm',
      };
      const ext = path.extname(filePath).toLowerCase();
      res.setHeader('Content-Type', MIME_TYPES[ext] || 'application/octet-stream');
      res.setHeader('Accept-Ranges', 'bytes');

      if (range) {
        const m = /^bytes=(\d+)-(\d*)$/i.exec(range);
        if (!m) {
          res.status(416).end();
          return;
        }
        const start = Number(m[1]);
        const end = m[2] ? Number(m[2]) : total - 1;
        const clampedStart = Math.max(0, Math.min(total - 1, start));
        const clampedEnd = Math.max(clampedStart, Math.min(total - 1, end));
        const chunkSize = clampedEnd - clampedStart + 1;

        res.status(206);
        res.setHeader('Content-Range', `bytes ${clampedStart}-${clampedEnd}/${total}`);
        res.setHeader('Content-Length', String(chunkSize));
        fs.createReadStream(filePath, { start: clampedStart, end: clampedEnd }).pipe(res);
        return;
      }

      res.setHeader('Content-Length', String(total));
      fs.createReadStream(filePath).pipe(res);
    } catch {
      res.status(500).json({ error: 'Failed to read track' });
    }
  });

  // ── Jam mode ──

  router.get('/jam', (_req: Request, res: Response) => {
    res.json(getJamStatus(getNowPlaying()));
  });

  router.post('/jam/toggle', (req: Request, res: Response) => {
    const enabled = req.body?.enabled;
    if (typeof enabled === 'boolean') {
      setJamEnabled(enabled);
      updateSettings({ jamEnabled: enabled });
    }
    res.json({ ok: true, ...getJamStatus(getNowPlaying()) });
  });

  return router;
}
