/**
 * Sound volume controls and test buttons.
 */
import {
  msgVolSlider, msgVolLabel, donVolSlider, donVolLabel,
  memVolSlider, memVolLabel, testMsgBtn, testDonBtn, testMemBtn,
} from './dom.js';
import { api } from './api.js';
import { debounce } from '/shared/utils.js';
import { adminAudio, ensureAudioCtx, playSoundAdmin, initAdminAudio } from './audio.js';

// ─── Volume channel descriptors ────────────────────────────────

const VOLUME_CHANNELS = [
  { key: 'messageVolume',  label: 'Message',    slider: msgVolSlider, labelEl: msgVolLabel, testBtn: testMsgBtn, audioKey: 'message'  },
  { key: 'donationVolume', label: 'Donation',   slider: donVolSlider, labelEl: donVolLabel, testBtn: testDonBtn, audioKey: 'donation' },
  { key: 'memberVolume',   label: 'Membership', slider: memVolSlider, labelEl: memVolLabel, testBtn: testMemBtn, audioKey: 'member'   },
];

const sendSounds = debounce(async (patch) => {
  try { await api('POST', '/api/sounds', patch); } catch {}
}, 150);

export async function fetchSounds() {
  try {
    const data = await api('GET', '/api/sounds');
    if (!data) return;
    for (const { key, label, slider, labelEl } of VOLUME_CHANNELS) {
      if (typeof data[key] === 'number') {
        slider.value = data[key];
        labelEl.textContent = `${label}: ${Math.round(data[key] * 100)}%`;
      }
    }
  } catch {}
}

export function bindSoundListeners() {
  for (const { key, label, slider, labelEl, testBtn, audioKey } of VOLUME_CHANNELS) {
    // Volume slider
    slider.addEventListener('input', () => {
      const val = Number(slider.value);
      labelEl.textContent = `${label}: ${Math.round(val * 100)}%`;
      sendSounds({ [key]: val });
    });
    // Test button
    testBtn.addEventListener('click', async () => {
      ensureAudioCtx();
      if (!adminAudio[audioKey]) await initAdminAudio();
      playSoundAdmin(adminAudio[audioKey], Number(slider.value) || 0);
    });
  }
}
