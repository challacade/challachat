/* eslint-disable no-console */
import os from 'os';
import path from 'path';
import puppeteer, { Browser } from 'puppeteer-core';

/**
 * BrowserPool - Singleton that manages a shared headless Chromium instance.
 *
 * Instead of launching a fresh browser for every capture session, we detect a
 * system Chrome/Edge once at startup and reuse the same browser process.
 *
 * Benefits:
 *   - No bundled Chromium (puppeteer-core, ~200 MB lighter)
 *   - Faster connect (browser already running after the first capture)
 *   - Lower memory usage (one Chromium process vs. one per platform)
 */

const LAUNCH_ARGS: string[] = [
  '--headless=new',
  '--no-sandbox',
  '--disable-setuid-sandbox',
  '--disable-dev-shm-usage',
  '--disable-accelerated-2d-canvas',
  '--no-first-run',
  '--no-zygote',
  '--disable-gpu',
  '--disable-background-timer-throttling',
  '--disable-backgrounding-occluded-windows',
  '--disable-renderer-backgrounding',
  '--disable-features=TranslateUI,VizDisplayCompositor,site-per-process',
  '--disable-extensions',
  '--disable-plugins',
  '--mute-audio',
  '--disable-web-security',
  // Some system Chrome/Edge builds briefly create a native surface even in
  // headless mode. Keep that surface out of the user's workspace without
  // shrinking the actual Puppeteer page viewport.
  '--start-minimized',
  '--window-position=-32000,-32000',
];

// Keep capture browser state separate from the user's normal Chrome/Edge profile.
const USER_DATA_DIR = path.join(os.tmpdir(), 'challachat-capture-browser');

// ── Executable detection ──────────────────────────────────────────

function findWindowsBrowserPaths(): string[] {
  const env = process.env;
  const candidates = [
    `${env['PROGRAMFILES']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['PROGRAMFILES(X86)']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['PROGRAMW6432']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['LOCALAPPDATA']}\\Google\\Chrome\\Application\\chrome.exe`,
    `${env['PROGRAMFILES']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${env['PROGRAMFILES(X86)']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${env['PROGRAMW6432']}\\Microsoft\\Edge\\Application\\msedge.exe`,
    `${env['LOCALAPPDATA']}\\Microsoft\\Edge\\Application\\msedge.exe`,
  ];
  return candidates.filter((p) => p && p.trim().length > 0);
}

function findMacBrowserPaths(): string[] {
  return [
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
  ];
}

function findLinuxBrowserPaths(): string[] {
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
  ];
}

/**
 * Try to launch a browser instance, attempting multiple strategies in order:
 *   1. Chrome via `channel`
 *   2. Edge via `channel`
 *   3. Known install paths for the current OS
 *
 * Returns the Browser or throws if nothing works.
 */
async function launchBrowser(): Promise<Browser> {
  const base: any = {
    headless: 'new',
    userDataDir: USER_DATA_DIR,
    args: LAUNCH_ARGS,
    timeout: 60_000,
    protocolTimeout: 60_000,
  };

  // 1. Try channel-based detection
  for (const channel of ['chrome', 'msedge'] as const) {
    try {
      return await puppeteer.launch({ ...base, channel });
    } catch { /* skip */ }
  }

  // 2. Explicit paths per OS
  const paths =
    process.platform === 'win32' ? findWindowsBrowserPaths() :
    process.platform === 'darwin' ? findMacBrowserPaths() :
    findLinuxBrowserPaths();

  for (const exe of paths) {
    try {
      return await puppeteer.launch({ ...base, executablePath: exe });
    } catch { /* skip */ }
  }

  throw new Error(
    'No Chrome or Edge found. Please install Google Chrome or Microsoft Edge and try again.',
  );
}

// ── Singleton pool ────────────────────────────────────────────────

let sharedBrowser: Browser | null = null;
let launchPromise: Promise<Browser> | null = null;

/**
 * Acquire the shared headless browser.  The first call launches it; subsequent
 * calls return the same instance.  If the browser crashes or is explicitly
 * closed, the next call will re-launch it.
 */
export async function acquireBrowser(): Promise<Browser> {
  // If we already have a live browser, return it
  if (sharedBrowser && sharedBrowser.connected) {
    return sharedBrowser;
  }

  // If a launch is in progress, wait for it
  if (launchPromise) {
    return launchPromise;
  }

  launchPromise = (async () => {
    try {
      console.log('[BrowserPool] Launching shared headless browser…');
      const browser = await launchBrowser();
      sharedBrowser = browser;

      // If the browser exits unexpectedly, clear the reference so the next
      // acquireBrowser() call will re-launch.
      browser.on('disconnected', () => {
        console.log('[BrowserPool] Browser disconnected');
        if (sharedBrowser === browser) sharedBrowser = null;
      });

      console.log('[BrowserPool] Browser ready');
      return browser;
    } finally {
      launchPromise = null;
    }
  })();

  return launchPromise;
}

/**
 * Gracefully close the shared browser (e.g. on app shutdown).
 */
export async function closeBrowser(): Promise<void> {
  if (sharedBrowser) {
    const b = sharedBrowser;
    sharedBrowser = null;
    try { await b.close(); } catch { /* ignore */ }
  }
}
