/**
 * ChallaChat — Electron Main Process
 *
 * Creates a BrowserWindow that shows the control panel and starts the Express
 * backend in the same process.  Communication uses IPC (ipcMain.handle) so
 * the renderer never makes HTTP round-trips for control actions.
 *
 * The App class is an EventEmitter; we forward its events to the renderer
 * via webContents.send so the UI updates in real-time.
 */

import { app, BrowserWindow, dialog, ipcMain, shell } from 'electron';
import path from 'path';

// Prevent server.ts from auto-instantiating when we require it
process.env.CHALLACHAT_ELECTRON = '1';

let mainWindow: BrowserWindow | null = null;
let appServer: any = null;

/* ── Helper: send to renderer only when the window is alive ────────── */
function sendToRenderer(channel: string, ...args: any[]) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, ...args);
  }
}

/* ── Window creation ───────────────────────────────────────────────── */
async function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 572,
    height: 540,
    minWidth: 460,
    minHeight: 430,
    title: 'ChallaChat',
    backgroundColor: '#111827',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  await mainWindow.loadURL(`http://localhost:${port}/admin`);

  // Open external links in the user's default browser instead of Electron
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    if (url.startsWith('http://localhost')) return { action: 'allow' };
    shell.openExternal(url);
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', (event, url) => {
    if (!url.startsWith(`http://localhost:${port}`)) {
      event.preventDefault();
      shell.openExternal(url);
    }
  });

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

/* ── IPC handlers (invoke/handle pattern) ──────────────────────────── */
function registerIpcHandlers() {
  ipcMain.handle('get-status', () => {
    if (!appServer) return null;
    return appServer.getStatus();
  });

  ipcMain.handle('connect', async (_e: Electron.IpcMainInvokeEvent, url: string) => {
    if (!appServer) return { error: 'Server not ready' };
    return appServer.apiConnect(url);
  });

  ipcMain.handle('disconnect', async () => {
    if (!appServer) return { error: 'Server not ready' };
    return appServer.apiDisconnect();
  });

  ipcMain.handle('get-port', () => {
    return appServer?.getPort() ?? null;
  });

  ipcMain.handle('pick-folder', async () => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openDirectory'],
      title: 'Select Music Folder',
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });

  ipcMain.handle('pick-file', async (_event, options?: { title?: string; filters?: { name: string; extensions: string[] }[] }) => {
    if (!mainWindow) return null;
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      title: options?.title ?? 'Select File',
      filters: options?.filters,
    });
    if (result.canceled || !result.filePaths.length) return null;
    return result.filePaths[0];
  });
}

/* ── Wire App events → renderer ────────────────────────────────────── */
function wireAppEvents() {
  appServer.on('capture-status', (status: any) => sendToRenderer('capture-status', status));
  appServer.on('capture-error', (error: string) => sendToRenderer('capture-error', error));
  appServer.on('log', (msg: string) => sendToRenderer('log', msg));
}

/* ── Bootstrap ─────────────────────────────────────────────────────── */
app.whenReady().then(async () => {
  registerIpcHandlers();

  // Dynamic require so the env var is set before the module evaluates
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { App } = require('../http/server');
  appServer = new App({ headless: true });

  wireAppEvents();

  const port: number = await appServer.waitForReady();
  await createWindow(port);
});

app.on('window-all-closed', () => {
  if (appServer) {
    appServer.shutdown().then(() => app.exit(0)).catch(() => app.exit(1));
  } else {
    app.quit();
  }
});
