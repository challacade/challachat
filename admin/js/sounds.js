/**
 * Sound volume controls and test buttons.
 */
import {
  msgVolSlider, msgVolLabel, msgMuteIcon,
  donVolSlider, donVolLabel, donMuteIcon,
  memVolSlider, memVolLabel, memMuteIcon,
  testMsgBtn, testDonBtn, testMemBtn,
} from './dom.js';
import { api } from './api.js';
import { debounce } from '/shared/utils.js';
import { adminAudio, ensureAudioCtx, playSoundAdmin, initAdminAudio } from './audio.js';

// ─── Volume channel descriptors ────────────────────────────────

const VOLUME_CHANNELS = [
  { key: 'messageVolume',  slider: msgVolSlider, labelEl: msgVolLabel, muteIcon: msgMuteIcon, testBtn: testMsgBtn, audioKey: 'message',  savedVol: 1 },
  { key: 'donationVolume', slider: donVolSlider, labelEl: donVolLabel, muteIcon: donMuteIcon, testBtn: testDonBtn, audioKey: 'donation', savedVol: 1 },
  { key: 'memberVolume',   slider: memVolSlider, labelEl: memVolLabel, muteIcon: memMuteIcon, testBtn: testMemBtn, audioKey: 'member',   savedVol: 1 },
];

function updateMuteIcon(ch) {
  const val = Number(ch.slider.value);
  ch.muteIcon.textContent = val === 0 ? '🔇' : '🔊';
}

const sendSounds = debounce(async (patch) => {
  try { await api('POST', '/api/sounds', patch); } catch {}
}, 150);

export async function fetchSounds() {
  try {
    const data = await api('GET', '/api/sounds');
    if (!data) return;
    for (const ch of VOLUME_CHANNELS) {
      if (typeof data[ch.key] === 'number') {
        ch.slider.value = data[ch.key];
        ch.savedVol = data[ch.key];
        ch.labelEl.textContent = `${Math.round(data[ch.key] * 100)}%`;
        updateMuteIcon(ch);
      }
    }
  } catch {}
}

export function bindSoundListeners() {
  for (const ch of VOLUME_CHANNELS) {
    // Volume slider
    ch.slider.addEventListener('input', () => {
      const val = Number(ch.slider.value);
      ch.labelEl.textContent = `${Math.round(val * 100)}%`;
      ch.savedVol = val;
      updateMuteIcon(ch);
      sendSounds({ [ch.key]: val });
    });
    // Mute toggle
    ch.muteIcon.addEventListener('click', () => {
      const current = Number(ch.slider.value);
      if (current > 0) {
        ch.savedVol = current;
        ch.slider.value = 0;
      } else {
        ch.slider.value = ch.savedVol || 1;
      }
      const val = Number(ch.slider.value);
      ch.labelEl.textContent = `${Math.round(val * 100)}%`;
      updateMuteIcon(ch);
      sendSounds({ [ch.key]: val });
    });
    // Test button
    ch.testBtn.addEventListener('click', async () => {
      ensureAudioCtx();
      if (!adminAudio[ch.audioKey]) await initAdminAudio();
      playSoundAdmin(adminAudio[ch.audioKey], Number(ch.slider.value) || 0);
    });
  }
}
