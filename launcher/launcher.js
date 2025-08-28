#!/usr/bin/env node
/**
 * ChallaChat Launcher
 * Small Node.js script that will be compiled to a tiny executable
 * This launches the main app with proper paths and environment
 */

const path = require('path');
const { spawn } = require('child_process');
const fs = require('fs');

// Get the directory where this launcher is located
const launcherDir = path.dirname(process.execPath);
const appDir = path.join(launcherDir, 'app');
const runtimeDir = path.join(launcherDir, 'runtime');
const overlayDir = path.join(launcherDir, 'overlay');

// Check if required directories exist
const requiredDirs = [appDir, runtimeDir, overlayDir];
for (const dir of requiredDirs) {
  if (!fs.existsSync(dir)) {
    console.error(`Error: Required directory not found: ${dir}`);
    console.error('Make sure you have extracted the complete ChallaChat distribution.');
    console.log('\nPress any key to exit...');
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on('data', () => process.exit(1));
    return;
  }
}

// Set up environment
process.env.NODE_PATH = path.join(appDir, 'node_modules');
process.env.CHALLACHAT_OVERLAY_DIR = overlayDir;
process.env.CHALLACHAT_PORTABLE = 'true';

console.log('Starting ChallaChat...');
console.log(`App directory: ${appDir}`);
console.log(`Runtime: ${runtimeDir}`);
console.log(`Overlay assets: ${overlayDir}`);
console.log('');

// Launch the main application
const nodeExe = path.join(runtimeDir, 'node.exe');
const appMain = path.join(appDir, 'app.js');

const child = spawn(nodeExe, [appMain], {
  cwd: launcherDir,
  stdio: 'inherit',
  env: process.env
});

child.on('close', (code) => {
  if (code !== 0) {
  console.error(`\nChallaChat exited with code ${code}`);
  } else {
  console.log('\nChallaChat closed successfully');
  }
  
  // Keep console open for a moment
  console.log('\nPress any key to exit...');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', () => process.exit(code));
});

child.on('error', (err) => {
  console.error('Failed to start ChallaChat:', err.message);
  console.log('\nPress any key to exit...');
  process.stdin.setRawMode(true);
  process.stdin.resume();
  process.stdin.on('data', () => process.exit(1));
});

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
  console.log('\nShutting down ChallaChat...');
  child.kill('SIGINT');
});
