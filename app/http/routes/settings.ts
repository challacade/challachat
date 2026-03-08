import { Router, type Request, type Response } from 'express';
import { getFilterStatus, loadFilterFromPath, setFilterActive } from '../../core/censor';
import { getLoggerStatus, setLogEnabled, startLogging } from '../../core/logger';
import { updateSettings, readSettings } from '../../core/settings';
import type { RouteContext } from './context';

/** Routes: /api/filter/*, /api/logger/*, /api/dummy-chatters */
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

  // ── UI Theme ──

  router.get('/ui-theme', (_req: Request, res: Response) => {
    const { settings } = readSettings();
    res.json({ uiTheme: settings.uiTheme || 'dark' });
  });

  router.post('/ui-theme', (req: Request, res: Response) => {
    const uiTheme = req.body?.uiTheme;
    if (uiTheme === 'dark' || uiTheme === 'light') {
      updateSettings({ uiTheme });
      res.json({ ok: true, uiTheme });
    } else {
      res.status(400).json({ ok: false, error: 'Invalid uiTheme value (dark or light).' });
    }
  });

  // ── UI Zoom ──

  router.get('/ui-zoom', (_req: Request, res: Response) => {
    const { settings } = readSettings();
    res.json({ uiZoom: typeof settings.uiZoom === 'number' ? settings.uiZoom : 0 });
  });

  router.post('/ui-zoom', (req: Request, res: Response) => {
    const uiZoom = req.body?.uiZoom;
    if (typeof uiZoom === 'number' && uiZoom >= 0 && uiZoom <= 100) {
      updateSettings({ uiZoom });
      res.json({ ok: true, uiZoom });
    } else {
      res.status(400).json({ ok: false, error: 'Invalid uiZoom value (0–100).' });
    }
  });

  // ── Clear overlay messages ──

  router.post('/clear-messages', (_req: Request, res: Response) => {
    ctx.sse.send('clear-messages', {});
    res.json({ ok: true });
  });

  // ── Dummy chatters ──

  router.post('/dummy-chatters', (req: Request, res: Response) => {
    const enabled = req.body?.enabled;
    if (typeof enabled !== 'boolean') {
      res.status(400).json({ ok: false, error: 'Missing enabled boolean.' });
      return;
    }
    ctx.setDummyChatters(enabled);
    updateSettings({ dummyChatters: enabled });
    res.json({ ok: true, dummyChatters: enabled });
  });

  return router;
}
