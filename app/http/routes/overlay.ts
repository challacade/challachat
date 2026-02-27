import { Router, type Request, type Response } from 'express';
import { getMusicDisplaySettings, updateSettings } from '../../core/settings';
import { getNowPlaying } from '../../core/nowPlaying';
import type { RouteContext } from './context';

/** Routes: /api/appearance, /api/sounds, /api/stream (SSE) */
export function createOverlayRouter(ctx: RouteContext): Router {
  const router = Router();

  // ── Appearance ──

  router.get('/appearance', (_req: Request, res: Response) => {
    res.json(ctx.appearance);
  });

  router.post('/appearance', (req: Request, res: Response) => {
    const body = req.body;
    if (!body || typeof body !== 'object') {
      res.status(400).json({ error: 'Invalid body' });
      return;
    }
    // Merge only known keys
    if (typeof body.scale === 'number') {
      ctx.appearance.scale = Math.max(0.5, Math.min(3, body.scale));
    }
    if (typeof body.textOpacity === 'number') {
      ctx.appearance.textOpacity = Math.max(0, Math.min(1, body.textOpacity));
    }
    if (typeof body.bubbleOpacity === 'number') {
      ctx.appearance.bubbleOpacity = Math.max(0, Math.min(1, body.bubbleOpacity));
    }
    if (typeof body.bgOpacity === 'number') {
      ctx.appearance.bgOpacity = Math.max(0, Math.min(1, body.bgOpacity));
    }
    if (typeof body.messageGap === 'number') {
      ctx.appearance.messageGap = Math.max(0, Math.min(1.5, body.messageGap));
    }
    if (typeof body.textColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.textColor)) {
      ctx.appearance.textColor = body.textColor;
    }
    if (typeof body.bubbleColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.bubbleColor)) {
      ctx.appearance.bubbleColor = body.bubbleColor;
    }
    if (typeof body.bgColor === 'string' && /^#[0-9a-fA-F]{6}$/.test(body.bgColor)) {
      ctx.appearance.bgColor = body.bgColor;
    }
    if (typeof body.showBubbles === 'boolean') {
      ctx.appearance.showBubbles = body.showBubbles;
    }
    if (typeof body.showAvatars === 'boolean') {
      ctx.appearance.showAvatars = body.showAvatars;
    }
    if (typeof body.showBadges === 'boolean') {
      ctx.appearance.showBadges = body.showBadges;
    }
    if (typeof body.preset === 'string' && ['Dark', 'Light', 'Transparent', 'Custom'].includes(body.preset)) {
      ctx.appearance.preset = body.preset;
    }
    ctx.sse.send('appearance', ctx.appearance);
    updateSettings(ctx.appearance as any);
    res.json({ ok: true, ...ctx.appearance });
  });

  // ── Sound volumes ──

  router.get('/sounds', (_req: Request, res: Response) => {
    res.json(ctx.sounds);
  });

  router.post('/sounds', (req: Request, res: Response) => {
    const body = req.body || {};
    if (typeof body.messageVolume === 'number') {
      ctx.sounds.messageVolume = Math.max(0, Math.min(2, body.messageVolume));
    }
    if (typeof body.donationVolume === 'number') {
      ctx.sounds.donationVolume = Math.max(0, Math.min(2, body.donationVolume));
    }
    if (typeof body.memberVolume === 'number') {
      ctx.sounds.memberVolume = Math.max(0, Math.min(2, body.memberVolume));
    }
    updateSettings(ctx.sounds as any);
    res.json({ ok: true, ...ctx.sounds });
  });

  // ── SSE event stream ──

  router.get('/stream', (_req: Request, res: Response) => {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no'
    });
    res.write(`event: ping\ndata: {"ts": ${Date.now()}}\n\n`);
    res.write(`event: appearance\ndata: ${JSON.stringify(ctx.appearance)}\n\n`);
    res.write(`event: sounds\ndata: ${JSON.stringify(ctx.sounds)}\n\n`);
    res.write(`event: music-settings\ndata: ${JSON.stringify(getMusicDisplaySettings())}\n\n`);
    if (ctx.isDemoMode()) {
      res.write(`event: demo-mode\ndata: ${JSON.stringify({ enabled: true })}\n\n`);
    }
    const np = getNowPlaying();
    if (np) {
      res.write(`event: now-playing\ndata: ${JSON.stringify({ songId: np.songId, index: np.index })}\n\n`);
    }
    ctx.sse.add(res);
  });

  return router;
}
