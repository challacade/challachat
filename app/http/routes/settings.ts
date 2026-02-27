import { Router, type Request, type Response } from 'express';
import { getFilterStatus, loadFilterFromPath, setFilterActive } from '../../core/censor';
import { getLoggerStatus, setLogEnabled, startLogging } from '../../core/logger';
import { updateSettings } from '../../core/settings';
import type { RouteContext } from './context';

/** Routes: /api/filter/*, /api/logger/*, /api/demo-mode */
export function createSettingsRouter(ctx: RouteContext): Router {
  const router = Router();

  // ── Profanity filter ──

  router.get('/filter', (_req: Request, res: Response) => {
    res.json(getFilterStatus());
  });

  router.post('/filter/toggle', (req: Request, res: Response) => {
    const active = req.body?.active;
    if (typeof active === 'boolean') {
      setFilterActive(active);
      updateSettings({ filterActive: active });
    }
    res.json({ ok: true, ...getFilterStatus() });
  });

  router.post('/filter/path', (req: Request, res: Response) => {
    const filterPath = req.body?.filterPath;
    if (typeof filterPath === 'string' && filterPath.trim().length > 0) {
      const trimmed = filterPath.trim();
      const success = loadFilterFromPath(trimmed);
      if (success) {
        updateSettings({ filterPath: trimmed });
      }
      res.json({ ok: success, ...getFilterStatus() });
    } else {
      res.json({ ok: false, error: 'No path provided', ...getFilterStatus() });
    }
  });

  // ── Message logger ──

  router.get('/logger', (_req: Request, res: Response) => {
    res.json(getLoggerStatus());
  });

  router.post('/logger/toggle', (req: Request, res: Response) => {
    const enabled = req.body?.enabled;
    if (typeof enabled === 'boolean') {
      setLogEnabled(enabled);
      updateSettings({ loggerEnabled: enabled });
      // If enabling and currently capturing, start logging immediately
      if (enabled && ctx.isRunning()) {
        const firstConn = ctx.connections.values().next().value;
        const platformPrefix = firstConn?.platform === 'kick' ? 'kk' : firstConn?.platform === 'twitch' ? 'tw' : 'yt';
        startLogging(platformPrefix);
      }
    }
    res.json({ ok: true, ...getLoggerStatus() });
  });

  // ── Demo mode ──

  router.post('/demo-mode', (req: Request, res: Response) => {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ ok: false, error: 'Missing enabled boolean.' });
      return;
    }
    ctx.setDemoMode(enabled);
    ctx.sse.send('demo-mode', { enabled });
    updateSettings({ demoMode: enabled });
    res.json({ ok: true, demoMode: enabled });
  });

  return router;
}
