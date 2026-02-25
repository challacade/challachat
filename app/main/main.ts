/**
 * ChallaChat — Electron Main Process
 *
 * Creates a BrowserWindow (the control panel) and starts the Express backend
 * in the same process.  The control panel communicates with the backend via
 * HTTP (same REST APIs the overlay uses), so no IPC is required for Phase 1.
 */

import { app, BrowserWindow } from 'electron';
import path from 'path';

// Prevent server.ts from auto-instantiating when we require it
process.env.CHALLACHAT_ELECTRON = '1';

let mainWindow: BrowserWindow | null = null;
let appServer: any = null;

async function createWindow(port: number) {
  mainWindow = new BrowserWindow({
    width: 520,
    height: 600,
    minWidth: 420,
    minHeight: 480,
    title: 'ChallaChat',
    backgroundColor: '#111827',
    show: false, // show after ready-to-show to avoid flash
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  // Hide the default menu bar
  mainWindow.setMenuBarVisibility(false);

  // Show once the page is painted
  mainWindow.once('ready-to-show', () => {
    mainWindow?.show();
  });

  await mainWindow.loadURL(`http://localhost:${port}/admin`);

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

app.whenReady().then(async () => {
  // Dynamic require so the env var is set before the module evaluates
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { App } = require('../http/server');
  appServer = new App({ headless: true });
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
