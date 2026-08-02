/**
 * Sound volume controls and test buttons.
 */
import {
  msgVolSlider, msgVolLabel, msgMuteIcon,
  donVolSlider, donVolLabel, donMuteIcon,
  memVolSlider, memVolLabel, memMuteIcon,
  testMsgBtn, testDonBtn, testMemBtn,
  browseMsgBtn, browseDonBtn, browseMemBtn,
  msgFilename, donFilename, memFilename,
  isElectron,
} from './dom.js';
import { api } from './api.js';
import { debounce } from '/shared/utils.js';
import { adminAudio, ensureAudioCtx, playTestSoundAdmin, stopTestSound, updateTestSoundVolume, initAdminAudio, reloadCustomSound } from './audio.js';
export { stopTestSound };

// ─── Volume channel descriptors ────────────────────────────────

const VOLUME_CHANNELS = [
  { key: 'messageVolume',  pathKey: 'messageSoundPath',  slider: msgVolSlider, labelEl: msgVolLabel, muteIcon: msgMuteIcon, testBtn: testMsgBtn, browseBtn: browseMsgBtn, filenameEl: msgFilename, audioKey: 'message',  savedVol: 0 },
  { key: 'donationVolume', pathKey: 'donationSoundPath', slider: donVolSlider, labelEl: donVolLabel, muteIcon: donMuteIcon, testBtn: testDonBtn, browseBtn: browseDonBtn, filenameEl: donFilename, audioKey: 'donation', savedVol: 1 },
  { key: 'memberVolume',   pathKey: 'memberSoundPath',   slider: memVolSlider, labelEl: memVolLabel, muteIcon: memMuteIcon, testBtn: testMemBtn, browseBtn: browseMemBtn, filenameEl: memFilename, audioKey: 'member',   savedVol: 1 },
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
      // Display custom filename or <default>, and set button mode
      const customPath = data[ch.pathKey];
      if (customPath && typeof customPath === 'string') {
        ch.filenameEl.textContent = customPath.split(/[\\/]/).pop();
        ch.filenameEl.style.display = '';
        setBrowseMode(ch, 'reset');
      } else {
        ch.filenameEl.textContent = '';
        ch.filenameEl.style.display = 'none';
        setBrowseMode(ch, 'browse');
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
      updateTestSoundVolume(val);
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
      updateTestSoundVolume(val);
      sendSounds({ [ch.key]: val });
    });
    // Test button
    ch.testBtn.addEventListener('click', async () => {
      ensureAudioCtx();
      if (!adminAudio[ch.audioKey]) await initAdminAudio();
      playTestSoundAdmin(adminAudio[ch.audioKey], Number(ch.slider.value) || 0);
    });
    // Browse / Reset button
    ch.browseBtn.addEventListener('click', async () => {
      if (ch.browseBtn.dataset.mode === 'reset') {
        // Reset to default
        stopTestSound();
        try {
          const resp = await api('POST', '/api/sounds/path', { type: ch.audioKey, filePath: '' });
          if (resp?.ok) {
            ch.filenameEl.textContent = '';
            ch.filenameEl.style.display = 'none';
            setBrowseMode(ch, 'browse');
            await reloadCustomSound(ch.audioKey);
          }
        } catch {}
        return;
      }
      // Browse for custom file
      if (!isElectron) return;
      const result = await window.challachat.invoke('pick-file', {
        title: `Choose ${ch.audioKey} sound`,
        filters: [{ name: 'Audio', extensions: ['mp3', 'wav', 'ogg', 'flac', 'aac', 'm4a'] }],
      });
      if (!result) return;
      try {
        const resp = await api('POST', '/api/sounds/path', { type: ch.audioKey, filePath: result });
        if (resp?.ok) {
          ch.filenameEl.textContent = resp.filename || result.split(/[\\/]/).pop();
          ch.filenameEl.style.display = '';
          setBrowseMode(ch, 'reset');
          await reloadCustomSound(ch.audioKey);
        }
      } catch {}
    });
  }
}

function setBrowseMode(ch, mode) {
  ch.browseBtn.dataset.mode = mode;
  if (mode === 'reset') {
    ch.browseBtn.textContent = 'Reset';
    ch.browseBtn.classList.remove('primary');
    ch.browseBtn.classList.add('danger');
  } else {
    ch.browseBtn.textContent = 'Browse';
    ch.browseBtn.classList.remove('danger');
    ch.browseBtn.classList.add('primary');
  }
}
