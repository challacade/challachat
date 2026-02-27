import { Router, type Request, type Response } from 'express';
import { DEFAULT_POLL_INTERVAL, clampPollInterval } from '../../core/config';
import type { RouteContext } from './context';

/** Routes: /api/status, /api/poll-interval, /api/connect, /api/disconnect, /api/start-session, /api/end-session */
export function createCaptureRouter(ctx: RouteContext): Router {
  const router = Router();

  router.get('/status', (_req: Request, res: Response) => {
    res.json(ctx.getStatus());
  });

  router.get('/poll-interval', (req: Request, res: Response) => {
    const connId = String(req.query.connectionId || '');
    const conn = connId ? ctx.connections.get(connId) : ctx.connections.values().next().value;
    res.json({ pollIntervalMs: conn?.capture?.pollInterval || DEFAULT_POLL_INTERVAL });
  });

  router.post('/poll-interval', (req: Request, res: Response) => {
    const connId = String(req.body?.connectionId || '');
    const conn = connId ? ctx.connections.get(connId) : ctx.connections.values().next().value;
    const next = clampPollInterval(Number(req.body?.pollIntervalMs));
    if (conn) conn.capture.setPollInterval(next);
    res.json({ ok: true, pollIntervalMs: conn?.capture?.pollInterval || next });
  });

  router.post('/connect', async (req: Request, res: Response) => {
    const url = req.body?.url;
    if (!url || typeof url !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing or invalid URL.' });
      return;
    }
    const result = await ctx.apiConnect(url);
    res.json(result);
  });

  router.post('/disconnect', async (req: Request, res: Response) => {
    const connectionId = req.body?.connectionId;
    if (!connectionId || typeof connectionId !== 'string') {
      res.status(400).json({ ok: false, error: 'Missing connectionId.' });
      return;
    }
    await ctx.apiDisconnect(connectionId);
    res.json({ ok: true });
  });

  router.post('/start-session', async (_req: Request, res: Response) => {
    await ctx.ensureServer();
    ctx.setSessionActive(true);
    res.json({ ok: true });
  });

  router.post('/end-session', async (_req: Request, res: Response) => {
    await ctx.shutdownCapture();
    ctx.setSessionActive(false);
    ctx.setDemoMode(false);
    ctx.sse.send('demo-mode', { enabled: false });
    res.json({ ok: true });
  });

  return router;
}
