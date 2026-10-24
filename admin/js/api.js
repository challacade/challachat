/**
 * Generic API helper (IPC or HTTP) and lightweight fetch wrapper.
 */
import { isElectron } from './dom.js';

let apiTokenPromise = null;

// Per-launch token from the Electron main process; the server requires it to change filesystem paths.
function getApiToken() {
  if (!isElectron) return Promise.resolve(null);
  if (!apiTokenPromise) apiTokenPromise = window.challachat.invoke('get-api-token').catch(() => null);
  return apiTokenPromise;
}

async function buildHeaders(headers = {}) {
  const token = await getApiToken();
  return token ? { ...headers, 'X-ChallaChat-Token': token } : headers;
}

export async function api(method, path, body) {
  if (isElectron) {
    // IPC calls - map REST paths to IPC channels
    if (path === '/api/status')          return window.challachat.invoke('get-status');
    if (path === '/api/connect')         return window.challachat.invoke('connect', body?.url);
    if (path === '/api/disconnect')      return window.challachat.invoke('disconnect', body?.connectionId);
    // Settings go through REST even in Electron (served on localhost)
    // Fall through to fetch
  }
  const opts = { method, headers: await buildHeaders() };
  if (body) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  return res.json();
}

export async function postJsonQuiet(url, body) {
  try {
    await fetch(url, { method: 'POST', headers: await buildHeaders({ 'Content-Type': 'application/json' }), body: JSON.stringify(body) });
  } catch {}
}
