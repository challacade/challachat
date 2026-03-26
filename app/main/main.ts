/**
 * ChallaChat - Electron Main Process
 *
 * Creates a BrowserWindow that shows the control panel and starts the Express
 * backend in the same process.  Communication uses IPC (ipcMain.handle) so
 * the renderer never makes HTTP round-trips for control actions.
 *
 * The App class is an EventEmitter; we forward its events to the renderer
 * via webContents.send so the UI updates in real-time.
 */

import { app, BrowserWindow, dialog, ipcMain, screen, shell } from 'electron';
import path from 'path';
import { readSettings, updateSettings } from '../core/settings';

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
function isPositionVisible(x: number, y: number, w: number, h: number): boolean {
  const displays = screen.getAllDisplays();
  // Window is "visible" if at least 100px of its area overlaps any display
  const overlap = 100;
  return displays.some(d => {
    const db = d.bounds;
    return (
      x + w > db.x + overlap &&
      x < db.x + db.width - overlap &&
      y + h > db.y + overlap &&
      y < db.y + db.height - overlap
    );
  });
}

async function createWindow(port: number) {
  const { settings } = readSettings();
  const saved = {
    width: settings.windowWidth ?? 528,
    height: settings.windowHeight ?? 562,
    x: settings.windowX,
    y: settings.windowY,
    maximized: settings.windowMaximized ?? false,
  };

  // Only restore position if the saved coordinates are still on a connected display
  const hasPosition = saved.x !== undefined && saved.y !== undefined;
  const positionValid = hasPosition && isPositionVisible(saved.x!, saved.y!, saved.width, saved.height);

  mainWindow = new BrowserWindow({
    width: saved.width,
    height: saved.height,
    ...(positionValid ? { x: saved.x, y: saved.y } : {}),
    minWidth: 420,
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

  if (saved.maximized) mainWindow.maximize();

  mainWindow.once('ready-to-show', () => mainWindow?.show());

  await mainWindow.loadURL(`http://localhost:${port}/admin`);

  // Persist window bounds on resize / move (debounced)
  let saveTimer: ReturnType<typeof setTimeout> | null = null;
  let lastNormalBounds: Electron.Rectangle | null = null;

  function saveWindowBounds() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      const isMaximized = mainWindow.isMaximized();
      const patch: Record<string, any> = { windowMaximized: isMaximized };
      if (!isMaximized) {
        const bounds = mainWindow.getBounds();
        lastNormalBounds = bounds;
        patch.windowWidth = bounds.width;
        patch.windowHeight = bounds.height;
        patch.windowX = bounds.x;
        patch.windowY = bounds.y;
      } else {
        // Save the display the maximized window is on so it restores on the right monitor
        const bounds = mainWindow.getBounds();
        const display = screen.getDisplayMatching(bounds);
        const db = display.bounds;
        // Place the saved position at the center of this display (using last known size)
        const w = lastNormalBounds?.width ?? (settings.windowWidth ?? 528);
        const h = lastNormalBounds?.height ?? (settings.windowHeight ?? 562);
        patch.windowX = Math.round(db.x + (db.width - w) / 2);
        patch.windowY = Math.round(db.y + (db.height - h) / 2);
        if (lastNormalBounds) {
          patch.windowWidth = lastNormalBounds.width;
          patch.windowHeight = lastNormalBounds.height;
        }
      }
      updateSettings(patch);
    }, 500);
  }
  mainWindow.on('resize', saveWindowBounds);
  mainWindow.on('move', saveWindowBounds);
  mainWindow.on('maximize', saveWindowBounds);
  mainWindow.on('unmaximize', saveWindowBounds);

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

  ipcMain.handle('disconnect', async (_e: Electron.IpcMainInvokeEvent, connectionId?: string) => {
    if (!appServer) return { error: 'Server not ready' };
    return appServer.apiDisconnect(connectionId);
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

  ipcMain.handle('save-file', async (_event, options?: { title?: string; defaultPath?: string; filters?: { name: string; extensions: string[] }[] }) => {
    if (!mainWindow) return null;
    const result = await dialog.showSaveDialog(mainWindow, {
      title: options?.title ?? 'Save File',
      defaultPath: options?.defaultPath,
      filters: options?.filters,
    });
    if (result.canceled || !result.filePath) return null;
    return result.filePath;
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
    // Force-exit after 8s if shutdown stalls (covers browser close, server drain, etc.)
    const forceExit = setTimeout(() => app.exit(1), 8000);
    forceExit.unref();
    appServer.shutdown().then(() => app.exit(0)).catch(() => app.exit(1));
  } else {
    app.quit();
  }
});
