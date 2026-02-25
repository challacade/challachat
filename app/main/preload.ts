/**
 * ChallaChat — Electron Preload Script
 *
 * Exposes a minimal API on the window object via contextBridge.
 * For Phase 1 the control panel uses HTTP to talk to the Express backend,
 * so only a marker flag is exposed.  Later phases will add IPC channels here.
 */

import { contextBridge } from 'electron';

contextBridge.exposeInMainWorld('challachat', {
  isElectron: true,
});
