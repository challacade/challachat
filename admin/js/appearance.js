/**
 * Appearance controls — presets, sliders/pickers/toggles.
 */
import {
  scaleSlider, scaleLabel, textOpSlider, textOpLabel,
  bubbleOpSlider, bubbleOpLabel, bgOpSlider, bgOpLabel,
  gapSlider, gapLabel, edgePaddingSlider, edgePaddingLabel, textColorPicker, bubbleColorPicker, bgColorPicker,
  showBubblesToggle, showAvatarsToggle, showBadgesToggle,
  presetSelect,
  textureSelect, textureIntensitySlider, textureIntensityLabel,
  textureScaleSlider, textureScaleLabel, textureColorPicker,
  overlayFontSelect, chatDirectionSelect,
} from './dom.js';
import { api } from './api.js';
import { PRESETS } from '/shared/presets.js';
import { debounce } from '/shared/utils.js';

// ─── Appearance UI ─────────────────────────────────────────────

function updateAppearanceUI(a) {
  // Slider controls: { key, slider, label, format }
  const sliders = [
    { key: 'scale',         slider: scaleSlider,    label: scaleLabel,    format: v => 'Scale: ' + v.toFixed(2) },
    { key: 'textOpacity',   slider: textOpSlider,   label: textOpLabel,   format: v => 'Text opacity: ' + Math.round(v * 100) + '%' },
    { key: 'bubbleOpacity', slider: bubbleOpSlider, label: bubbleOpLabel, format: v => 'Bubble opacity: ' + Math.round(v * 100) + '%' },
    { key: 'bgOpacity',     slider: bgOpSlider,     label: bgOpLabel,     format: v => 'Back opacity: ' + Math.round(v * 100) + '%' },
    { key: 'messageGap',    slider: gapSlider,      label: gapLabel,      format: v => 'Vertical gap: ' + v.toFixed(2) },
    { key: 'edgePadding',   slider: edgePaddingSlider, label: edgePaddingLabel, format: v => 'Edge padding: ' + v.toFixed(2) },
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
  // Font
  if (typeof a.overlayFont === 'string' && overlayFontSelect) overlayFontSelect.value = a.overlayFont;
  // Chat direction
  if (typeof a.chatDirection === 'string' && chatDirectionSelect) chatDirectionSelect.value = a.chatDirection;
  // Texture
  if (typeof a.texture === 'string' && textureSelect) textureSelect.value = a.texture;
  if (typeof a.textureIntensity === 'number' && textureIntensitySlider) {
    textureIntensitySlider.value = a.textureIntensity;
    textureIntensityLabel.textContent = 'Intensity: ' + Math.round(a.textureIntensity * 100) + '%';
  }
  if (typeof a.textureScale === 'number' && textureScaleSlider) {
    textureScaleSlider.value = a.textureScale;
    textureScaleLabel.textContent = 'Scale: ' + a.textureScale.toFixed(2);
  }
  if (typeof a.textureColor === 'string' && textureColorPicker) {
    textureColorPicker.value = a.textureColor;
  }
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
    { key: 'edgePadding',   slider: edgePaddingSlider, label: edgePaddingLabel, format: v => 'Edge padding: ' + v.toFixed(2) },
  ].forEach(({ key, slider, label, format }) => {
    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      label.textContent = format(val);
      presetSelect.value = 'Custom';
      sendAppearance({ [key]: val, preset: 'Custom' });
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
    });
  });

  // Font control
  if (overlayFontSelect) {
    overlayFontSelect.addEventListener('change', () => {
      sendAppearance({ overlayFont: overlayFontSelect.value });
    });
  }

  // Chat direction control
  if (chatDirectionSelect) {
    chatDirectionSelect.addEventListener('change', () => {
      sendAppearance({ chatDirection: chatDirectionSelect.value });
    });
  }

  // Texture controls
  if (textureSelect) {
    textureSelect.addEventListener('change', () => {
      sendAppearance({ texture: textureSelect.value });
    });
  }
  if (textureIntensitySlider) {
    textureIntensitySlider.addEventListener('input', () => {
      const val = Number(textureIntensitySlider.value);
      textureIntensityLabel.textContent = 'Intensity: ' + Math.round(val * 100) + '%';
      sendAppearance({ textureIntensity: val });
    });
  }
  if (textureScaleSlider) {
    textureScaleSlider.addEventListener('input', () => {
      const val = Number(textureScaleSlider.value);
      textureScaleLabel.textContent = 'Scale: ' + val.toFixed(2);
      sendAppearance({ textureScale: val });
    });
  }
  if (textureColorPicker) {
    textureColorPicker.addEventListener('input', () => {
      sendAppearance({ textureColor: textureColorPicker.value });
    });
  }

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
