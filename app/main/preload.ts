/**
 * ChallaChat — Electron Preload Script
 *
 * Exposes a safe `window.challachat` API via contextBridge.
 *
 * - `invoke(channel, ...args)` — call an ipcMain.handle handler and await the result.
 * - `on(channel, callback)` — listen for events pushed from the main process.
 * - `off(channel, callback)` — remove a previously registered listener.
 * - `isElectron` — simple boolean marker so the renderer can feature-detect.
 */

import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron';

// Allowed IPC channels (whitelist for security)
const INVOKE_CHANNELS = ['get-status', 'connect', 'disconnect', 'get-port', 'pick-folder', 'pick-file', 'save-file'] as const;
const EVENT_CHANNELS = ['capture-status', 'capture-error', 'log'] as const;

type InvokeChannel = typeof INVOKE_CHANNELS[number];
type EventChannel = typeof EVENT_CHANNELS[number];

contextBridge.exposeInMainWorld('challachat', {
  isElectron: true,

  /** Call an ipcMain.handle handler and return the result. */
  invoke: (channel: InvokeChannel, ...args: any[]) => {
    if (!INVOKE_CHANNELS.includes(channel)) throw new Error(`Blocked IPC channel: ${channel}`);
    return ipcRenderer.invoke(channel, ...args);
  },

  /** Subscribe to an event pushed by the main process. */
  on: (channel: EventChannel, callback: (...args: any[]) => void) => {
    if (!EVENT_CHANNELS.includes(channel)) throw new Error(`Blocked IPC channel: ${channel}`);
    const listener = (_event: IpcRendererEvent, ...args: any[]) => callback(...args);
    ipcRenderer.on(channel, listener);
    // Return a dispose function so callers can clean up
    return () => { ipcRenderer.removeListener(channel, listener); };
  },
});
