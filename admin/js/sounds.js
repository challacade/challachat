/**
 * Sound volume controls and test buttons.
 */
import {
  msgVolSlider, msgVolLabel, donVolSlider, donVolLabel,
  memVolSlider, memVolLabel, testMsgBtn, testDonBtn, testMemBtn,
} from './dom.js';
import { api } from './api.js';
import { adminAudio, ensureAudioCtx, playSoundAdmin, initAdminAudio } from './audio.js';

let soundDebounce = null;
function sendSounds(patch) {
  clearTimeout(soundDebounce);
  soundDebounce = setTimeout(async () => {
    try { await api('POST', '/api/sounds', patch); } catch {}
  }, 150);
}

export async function fetchSounds() {
  try {
    const data = await api('GET', '/api/sounds');
    if (!data) return;
    if (typeof data.messageVolume === 'number') {
      msgVolSlider.value = data.messageVolume;
      msgVolLabel.textContent = 'Message: ' + Math.round(data.messageVolume * 100) + '%';
    }
    if (typeof data.donationVolume === 'number') {
      donVolSlider.value = data.donationVolume;
      donVolLabel.textContent = 'Donation: ' + Math.round(data.donationVolume * 100) + '%';
    }
    if (typeof data.memberVolume === 'number') {
      memVolSlider.value = data.memberVolume;
      memVolLabel.textContent = 'Membership: ' + Math.round(data.memberVolume * 100) + '%';
    }
  } catch {}
}

export function bindSoundListeners() {
  msgVolSlider.addEventListener('input', () => {
    const val = Number(msgVolSlider.value);
    msgVolLabel.textContent = 'Message: ' + Math.round(val * 100) + '%';
    sendSounds({ messageVolume: val });
  });
  donVolSlider.addEventListener('input', () => {
    const val = Number(donVolSlider.value);
    donVolLabel.textContent = 'Donation: ' + Math.round(val * 100) + '%';
    sendSounds({ donationVolume: val });
  });
  memVolSlider.addEventListener('input', () => {
    const val = Number(memVolSlider.value);
    memVolLabel.textContent = 'Membership: ' + Math.round(val * 100) + '%';
    sendSounds({ memberVolume: val });
  });

  testMsgBtn.addEventListener('click', async () => {
    ensureAudioCtx();
    if (!adminAudio.message) await initAdminAudio();
    playSoundAdmin(adminAudio.message, Number(msgVolSlider.value) || 0);
  });
  testDonBtn.addEventListener('click', async () => {
    ensureAudioCtx();
    if (!adminAudio.donation) await initAdminAudio();
    playSoundAdmin(adminAudio.donation, Number(donVolSlider.value) || 0);
  });
  testMemBtn.addEventListener('click', async () => {
    ensureAudioCtx();
    if (!adminAudio.member) await initAdminAudio();
    playSoundAdmin(adminAudio.member, Number(memVolSlider.value) || 0);
  });
}
