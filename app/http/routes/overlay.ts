import { Router, type Request, type Response } from 'express';
import { getMusicDisplaySettings, updateSettings } from '../../core/settings';
import { getNowPlaying } from '../../core/nowPlaying';
import type { RouteContext } from './context';

/** Routes: /api/appearance, /api/sounds, /api/stream (SSE) */
export function createOverlayRouter(ctx: RouteContext): Router {
  const router = Router();

  // ── Appearance schema: defines validation rules for each known key ──

  type Rule =
    | { type: 'number'; min: number; max: number }
    | { type: 'color' }
    | { type: 'boolean' }
    | { type: 'enum'; values: string[] };

  const appearanceRules: Record<string, Rule> = {
    scale:         { type: 'number', min: 0.5, max: 3 },
    textOpacity:   { type: 'number', min: 0, max: 1 },
    bubbleOpacity: { type: 'number', min: 0, max: 1 },
    bgOpacity:     { type: 'number', min: 0, max: 1 },
    messageGap:    { type: 'number', min: 0, max: 1.5 },
    textColor:     { type: 'color' },
    bubbleColor:   { type: 'color' },
    bgColor:       { type: 'color' },
    showBubbles:   { type: 'boolean' },
    showAvatars:   { type: 'boolean' },
    showBadges:    { type: 'boolean' },
    preset:        { type: 'enum', values: ['Dark', 'Light', 'Transparent', 'Custom'] },
    texture:          { type: 'enum', values: ['none', 'noise'] },
    textureIntensity: { type: 'number', min: 0, max: 1 },
    textureScale:     { type: 'number', min: 0.25, max: 4 },
  };

  const hexColorRe = /^#[0-9a-fA-F]{6}$/;

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
    for (const [key, rule] of Object.entries(appearanceRules)) {
      const val = body[key];
      if (val === undefined) continue;
      switch (rule.type) {
        case 'number':
          if (typeof val === 'number') ctx.appearance[key] = Math.max(rule.min, Math.min(rule.max, val));
          break;
        case 'color':
          if (typeof val === 'string' && hexColorRe.test(val)) ctx.appearance[key] = val;
          break;
        case 'boolean':
          if (typeof val === 'boolean') ctx.appearance[key] = val;
          break;
        case 'enum':
          if (typeof val === 'string' && rule.values.includes(val)) ctx.appearance[key] = val;
          break;
      }
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
    ctx.sse.send('sounds', ctx.sounds);
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
