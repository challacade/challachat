/**
 * ChallaChat Overlay - Utility Functions
 * Avatar fallback generation and image load retries
 */

import { IMAGE_MAX_RETRIES, IMAGE_RETRY_BASE_DELAY_MS, IMAGE_DEAD_TTL_MS, IMAGE_DEAD_MAX_ENTRIES } from './state.js';

// ================================
// Avatar Error Handling
// ================================

// Generate a solid color fallback avatar as a data URI
export function generateFallbackAvatar(seed = '') {
  const colors = ['#6366f1', '#8b5cf6', '#d946ef', '#ec4899', '#f43f5e', '#f97316', '#eab308', '#22c55e', '#14b8a6', '#06b6d4', '#3b82f6'];
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = seed.charCodeAt(i) + ((hash << 5) - hash);
  }
  const color = colors[Math.abs(hash) % colors.length];
  
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><circle cx="32" cy="32" r="32" fill="${color}"/></svg>`;
  return 'data:image/svg+xml,' + encodeURIComponent(svg);
}

// ================================
// Image Retry (avatars + emotes)
// ================================

// url -> { attempt, waiters: Set<img> }; one probe chain per URL no matter how many imgs use it
const pendingRetries = new Map();
// url -> expiry timestamp; URLs that exhausted retries are not retried again until expiry
const deadUrls = new Map();
// img -> { url, fallbackSrc, onGiveUp, failures }
const trackedImages = new WeakMap();

function isDeadUrl(url) {
  const expiry = deadUrls.get(url);
  if (expiry === undefined) return false;
  if (Date.now() < expiry) return true;
  deadUrls.delete(url);
  return false;
}

function markDeadUrl(url) {
  if (deadUrls.size >= IMAGE_DEAD_MAX_ENTRIES) {
    const now = Date.now();
    for (const [key, expiry] of deadUrls) if (expiry <= now) deadUrls.delete(key);
    if (deadUrls.size >= IMAGE_DEAD_MAX_ENTRIES) deadUrls.delete(deadUrls.keys().next().value);
  }
  deadUrls.set(url, Date.now() + IMAGE_DEAD_TTL_MS);
}

function cacheBust(url, attempt) {
  if (!/^https?:/i.test(url)) return url;
  return url + (url.includes('?') ? '&' : '?') + '_r=' + attempt;
}

function giveUpImage(img) {
  const info = trackedImages.get(img);
  img.removeEventListener('error', onImageError);
  trackedImages.delete(img);
  if (info?.onGiveUp && img.isConnected) info.onGiveUp(img);
}

function scheduleProbe(url, entry) {
  const delay = IMAGE_RETRY_BASE_DELAY_MS * 2 ** entry.attempt + Math.random() * 500;
  setTimeout(() => probeUrl(url, entry), delay);
}

function probeUrl(url, entry) {
  for (const img of entry.waiters) if (!img.isConnected) entry.waiters.delete(img);
  if (!entry.waiters.size) {
    pendingRetries.delete(url);
    return;
  }

  entry.attempt++;
  const retryUrl = cacheBust(url, entry.attempt);
  const tester = new Image();
  tester.onload = () => {
    pendingRetries.delete(url);
    for (const img of entry.waiters) if (img.isConnected) img.src = retryUrl;
  };
  tester.onerror = () => {
    if (entry.attempt >= IMAGE_MAX_RETRIES) {
      pendingRetries.delete(url);
      markDeadUrl(url);
      for (const img of entry.waiters) giveUpImage(img);
      return;
    }
    scheduleProbe(url, entry);
  };
  tester.src = retryUrl;
}

function onImageError(event) {
  const img = event.currentTarget;
  const info = trackedImages.get(img);
  if (!info) return;
  if (info.fallbackSrc && img.getAttribute('src') === info.fallbackSrc) return;
  if (info.fallbackSrc) img.src = info.fallbackSrc;

  // Per-img cap guards against a probe succeeding while the real img keeps failing
  info.failures++;
  if (info.failures > IMAGE_MAX_RETRIES || isDeadUrl(info.url)) {
    giveUpImage(img);
    return;
  }

  let entry = pendingRetries.get(info.url);
  if (!entry) {
    entry = { attempt: 0, waiters: new Set() };
    pendingRetries.set(info.url, entry);
    scheduleProbe(info.url, entry);
  }
  entry.waiters.add(img);
}

/**
 * Retry a failed image load with exponential backoff; gives up after IMAGE_MAX_RETRIES.
 * @param {HTMLImageElement} img
 * @param {string} url - Original image URL
 * @param {{ fallbackSrc?: string, onGiveUp?: (img: HTMLImageElement) => void }} [options]
 */
export function retryImageOnError(img, url, options = {}) {
  trackedImages.set(img, {
    url,
    fallbackSrc: options.fallbackSrc || '',
    onGiveUp: options.onGiveUp || null,
    failures: 0,
  });
  img.addEventListener('error', onImageError);
}
