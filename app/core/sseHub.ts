import type { Response } from 'express';

// Minimal SSE hub to fan out server-sent events to overlay clients
export class SSEHub<T = unknown> {
  private clients = new Set<Response>();
  private heartbeatMs: number;

  constructor(heartbeatMs = 15000) {
    this.heartbeatMs = heartbeatMs;
  }

  add(res: Response) {
    this.clients.add(res);
    const timer = setInterval(() => {
      try { res.write(`event: ping\ndata: {"ts": ${Date.now()}}\n\n`); } catch { /* client disconnected */ }
    }, this.heartbeatMs);
    res.on('close', () => {
      clearInterval(timer);
      this.clients.delete(res);
      try { res.end(); } catch { /* ignore */ }
    });
  }

  send(event: string, payload: T) {
    const data = `event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`;
    for (const res of Array.from(this.clients)) {
      try { res.write(data); } catch { /* client disconnected */ }
    }
  }

  /** Close all SSE client connections (e.g. on shutdown). */
  close() {
    for (const res of Array.from(this.clients)) {
      try { res.end(); } catch { /* ignore */ }
    }
    this.clients.clear();
  }
}
