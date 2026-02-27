/**
 * Appearance controls — presets, live preview (Shadow DOM), sliders/pickers/toggles.
 */
import {
  scaleSlider, scaleLabel, textOpSlider, textOpLabel,
  bubbleOpSlider, bubbleOpLabel, bgOpSlider, bgOpLabel,
  gapSlider, gapLabel, textColorPicker, bubbleColorPicker, bgColorPicker,
  showBubblesToggle, showAvatarsToggle, showBadgesToggle,
  presetSelect, previewHost,
} from './dom.js';
import { api } from './api.js';
import { PRESETS } from '/shared/presets.js';
import { clamp, hexToRgba, debounce } from '/shared/utils.js';

// ─── Live preview (Shadow DOM) ─────────────────────────────────

let previewShadow = null;

export async function initPreview() {
  if (!previewHost || previewShadow) return;
  try {
    const res = await fetch('/styles.css');
    const overlayCss = await res.text();
    previewShadow = previewHost.attachShadow({ mode: 'open' });

    // Google Fonts link for the overlay font
    const fontLink = document.createElement('link');
    fontLink.rel = 'stylesheet';
    fontLink.href = 'https://fonts.googleapis.com/css2?family=Inter:wght@400;600;800&display=swap';
    previewShadow.appendChild(fontLink);

    const style = document.createElement('style');
    style.textContent = overlayCss + `\n
      /* Preview overrides – :root vars don't inherit into shadow DOM,
         so we re-declare them on the wrapper which scopes all children. */
      :host { display: block; }
      .preview-wrap {
        --base-scale: 1;
        --scale: var(--base-scale);
        --message-gap: 0.4;
        --text: #fff;
        --bubble: rgba(0,0,0,0.35);
        --bubble-blur: blur(8px);
        --primary: #00b5ff;
        --emote-scale: 0.95;
        border-radius: 8px;
        padding: 12px 10px;
        overflow: hidden;
        transition: background 0.15s;
        font-family: Inter, "Segoe UI Emoji", "Apple Color Emoji", "Noto Color Emoji", system-ui, sans-serif;
      }
      .messages {
        position: relative !important;
        inset: unset !important;
      }
      .message { animation: none !important; }
      /* hide overlay-only UI */
      .settings-btn, .settings, .toast, .song-display-overlay { display: none !important; }
    `;
    previewShadow.appendChild(style);

    const wrap = document.createElement('div');
    wrap.className = 'preview-wrap';
    wrap.innerHTML = `
      <div class="overlay">
        <div class="messages" style="position:relative;inset:unset;">
          <div class="message single-line ring-mod">
            <div class="avatar"><img src="https://api.dicebear.com/9.x/thumbs/svg?seed=mod" alt="avatar" /></div>
            <div class="body">
              <span class="header"><span class="name">ModUser</span></span>
              <span class="content"> Welcome to the stream!</span>
            </div>
          </div>
          <div class="message single-line">
            <div class="avatar"><img src="https://api.dicebear.com/9.x/thumbs/svg?seed=viewer" alt="avatar" /></div>
            <div class="body">
              <span class="header no-inline-badges"><span class="name">Viewer123</span></span>
              <span class="content"> This is a chat message preview</span>
            </div>
          </div>
        </div>
      </div>
    `;
    previewShadow.appendChild(wrap);
  } catch (e) {
    console.warn('Preview init failed:', e);
  }
}

function updatePreview() {
  if (!previewShadow) return;
  const wrap = previewShadow.querySelector('.preview-wrap');
  const overlay = previewShadow.querySelector('.overlay');
  if (!wrap || !overlay) return;

  const scale = Number(scaleSlider.value) || 1;
  const textOp = Number(textOpSlider.value);
  const bubbleOp = Number(bubbleOpSlider.value);
  const bgOp = Number(bgOpSlider.value);
  const gap = Number(gapSlider.value);
  const showBubbles = showBubblesToggle.checked;

  // Preview uses a fixed scale for readability — we apply a clamped version
  const previewScale = clamp(scale * 0.65, 0.55, 1.1);
  wrap.style.setProperty('--base-scale', String(previewScale));
  wrap.style.setProperty('--scale', String(previewScale));
  wrap.style.setProperty('--message-gap', String(gap));
  wrap.style.setProperty('--text', hexToRgba(textColorPicker.value, textOp));

  const bubbleOpVal = showBubbles ? bubbleOp : 0;
  wrap.style.setProperty('--bubble', hexToRgba(bubbleColorPicker.value, bubbleOpVal));
  wrap.style.setProperty('--bubble-blur', bubbleOpVal > 0 ? 'blur(8px)' : 'none');
  wrap.style.background = hexToRgba(bgColorPicker.value, bgOp);
  overlay.classList.toggle('no-bubbles', !showBubbles);
  overlay.classList.toggle('no-avatars', !showAvatarsToggle.checked);
  overlay.classList.toggle('no-badges', !showBadgesToggle.checked);
}

// ─── Appearance UI ─────────────────────────────────────────────

function updateAppearanceUI(a) {
  // Slider controls: { key, slider, label, format }
  const sliders = [
    { key: 'scale',         slider: scaleSlider,    label: scaleLabel,    format: v => 'Scale: ' + v.toFixed(2) },
    { key: 'textOpacity',   slider: textOpSlider,   label: textOpLabel,   format: v => 'Text opacity: ' + Math.round(v * 100) + '%' },
    { key: 'bubbleOpacity', slider: bubbleOpSlider, label: bubbleOpLabel, format: v => 'Bubble opacity: ' + Math.round(v * 100) + '%' },
    { key: 'bgOpacity',     slider: bgOpSlider,     label: bgOpLabel,     format: v => 'Back opacity: ' + Math.round(v * 100) + '%' },
    { key: 'messageGap',    slider: gapSlider,      label: gapLabel,      format: v => 'Vertical gap: ' + v.toFixed(2) },
  ];
  for (const { key, slider, label, format } of sliders) {
    if (typeof a[key] === 'number') {
      slider.value = a[key];
      label.textContent = format(a[key]);
    }
  }
  // Color pickers
  for (const [key, picker] of [['textColor', textColorPicker], ['bubbleColor', bubbleColorPicker], ['bgColor', bgColorPicker]]) {
    if (typeof a[key] === 'string') picker.value = a[key];
  }
  // Toggles
  for (const [key, toggle] of [['showBubbles', showBubblesToggle], ['showAvatars', showAvatarsToggle], ['showBadges', showBadgesToggle]]) {
    if (typeof a[key] === 'boolean') toggle.checked = a[key];
  }
  if (typeof a.preset === 'string') presetSelect.value = a.preset;
  updatePreview();
}

const sendAppearance = debounce(async (patch) => {
  try { await api('POST', '/api/appearance', patch); } catch {}
}, 150);

export async function fetchAppearance() {
  try {
    const data = await api('GET', '/api/appearance');
    if (data) updateAppearanceUI(data);
  } catch {}
}

// ─── Event listeners ───────────────────────────────────────────

export function bindAppearanceListeners() {
  // Data-driven appearance listeners — sliders
  [
    { key: 'scale',         slider: scaleSlider,    label: scaleLabel,    format: v => 'Scale: ' + v.toFixed(2) },
    { key: 'textOpacity',   slider: textOpSlider,   label: textOpLabel,   format: v => 'Text opacity: ' + Math.round(v * 100) + '%' },
    { key: 'bubbleOpacity', slider: bubbleOpSlider, label: bubbleOpLabel, format: v => 'Bubble opacity: ' + Math.round(v * 100) + '%' },
    { key: 'bgOpacity',     slider: bgOpSlider,     label: bgOpLabel,     format: v => 'Back opacity: ' + Math.round(v * 100) + '%' },
    { key: 'messageGap',    slider: gapSlider,      label: gapLabel,      format: v => 'Vertical gap: ' + v.toFixed(2) },
  ].forEach(({ key, slider, label, format }) => {
    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      label.textContent = format(val);
      presetSelect.value = 'Custom';
      sendAppearance({ [key]: val, preset: 'Custom' });
      updatePreview();
    });
  });

  // Data-driven appearance listeners — color pickers
  [
    ['textColor',   textColorPicker],
    ['bubbleColor', bubbleColorPicker],
    ['bgColor',     bgColorPicker],
  ].forEach(([key, picker]) => {
    picker.addEventListener('input', () => {
      presetSelect.value = 'Custom';
      sendAppearance({ [key]: picker.value, preset: 'Custom' });
      updatePreview();
    });
  });

  // Data-driven appearance listeners — toggles
  [
    ['showBubbles', showBubblesToggle],
    ['showAvatars', showAvatarsToggle],
    ['showBadges',  showBadgesToggle],
  ].forEach(([key, toggle]) => {
    toggle.addEventListener('change', () => {
      presetSelect.value = 'Custom';
      sendAppearance({ [key]: toggle.checked, preset: 'Custom' });
      updatePreview();
    });
  });

  presetSelect.addEventListener('change', () => {
    const name = presetSelect.value;
    const p = PRESETS[name];
    if (p) {
      updateAppearanceUI({ ...p, preset: name });
      sendAppearance({ ...p, preset: name });
    } else {
      sendAppearance({ preset: 'Custom' });
    }
  });
}
