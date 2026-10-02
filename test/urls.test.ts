import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  detectPlatform, extractKickChannel, extractTwitchChannel, extractVideoId, extractVideoIdFromYouTubeHtml,
  extractYouTubeChannelLabel, extractYouTubeChannelLiveUrl, getYouTubeSourceKind, isYouTubeHandleLiveUrl, toPublicLiveUrl,
} from '../app/capture/urls';

test('detectPlatform', () => {
  assert.equal(detectPlatform('https://www.youtube.com/watch?v=abc'), 'youtube');
  assert.equal(detectPlatform('https://youtu.be/abc'), 'youtube');
  assert.equal(detectPlatform('https://studio.youtube.com/video/abc/livestreaming'), 'youtube');
  assert.equal(detectPlatform('https://www.twitch.tv/somechannel'), 'twitch');
  assert.equal(detectPlatform('https://kick.com/somechannel'), 'kick');
  assert.equal(detectPlatform('https://example.com/live'), null);
  assert.equal(detectPlatform(''), null);
});

test('extractTwitchChannel', () => {
  assert.equal(extractTwitchChannel('https://www.twitch.tv/SomeChannel'), 'somechannel');
  assert.equal(extractTwitchChannel('https://www.twitch.tv/somechannel/chat'), 'somechannel');
  assert.equal(extractTwitchChannel('https://www.twitch.tv/popout/somechannel/chat?popout='), 'somechannel');
  assert.equal(extractTwitchChannel('https://www.twitch.tv/'), null);
  assert.equal(extractTwitchChannel('https://kick.com/somechannel'), null);
  assert.equal(extractTwitchChannel('twitch.tv/popout/SomeChannel/chat'), 'somechannel');
});

test('extractKickChannel', () => {
  assert.equal(extractKickChannel('https://kick.com/SomeChannel'), 'somechannel');
  assert.equal(extractKickChannel('https://kick.com/popout/somechannel/chat'), 'somechannel');
  assert.equal(extractKickChannel('https://kick.com'), null);
  assert.equal(extractKickChannel('https://www.twitch.tv/somechannel'), null);
  assert.equal(extractKickChannel('kick.com/SomeChannel'), 'somechannel');
});

test('extractVideoId', () => {
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(extractVideoId('https://www.youtube.com/watch?v=jfKfPfyJRdk&t=10'), 'jfKfPfyJRdk');
  assert.equal(extractVideoId('https://www.youtube.com/live/jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(extractVideoId('https://youtu.be/jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(extractVideoId('https://www.youtube.com/live_chat?v=jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(extractVideoId('https://studio.youtube.com/video/jfKfPfyJRdk/livestreaming'), 'jfKfPfyJRdk');
  assert.equal(extractVideoId('https://studio.youtube.com/live_chat?is_popout=1&v=jfKfPfyJRdk'), 'jfKfPfyJRdk');
  assert.equal(extractVideoId('https://www.youtube.com/@LofiGirl/live'), null);
  assert.equal(extractVideoId('youtube.com/watch?v=jfKfPfyJRdk'), 'jfKfPfyJRdk');
});

test('extractVideoIdFromYouTubeHtml', () => {
  assert.equal(extractVideoIdFromYouTubeHtml('<link rel="canonical" href="https://www.youtube.com/watch?v=jfKfPfyJRdk">'), 'jfKfPfyJRdk');
  assert.equal(extractVideoIdFromYouTubeHtml('<link rel="shortlinkUrl" href="https://youtu.be/jfKfPfyJRdk">'), 'jfKfPfyJRdk');
  assert.equal(extractVideoIdFromYouTubeHtml('{"videoId":"jfKfPfyJRdk"}'), 'jfKfPfyJRdk');
  assert.equal(extractVideoIdFromYouTubeHtml('<html></html>'), null);
  assert.equal(extractVideoIdFromYouTubeHtml(''), null);
});

test('isYouTubeHandleLiveUrl', () => {
  assert.equal(isYouTubeHandleLiveUrl('https://www.youtube.com/@LofiGirl/live'), true);
  assert.equal(isYouTubeHandleLiveUrl('https://www.youtube.com/@LofiGirl/live/'), true);
  assert.equal(isYouTubeHandleLiveUrl('https://m.youtube.com/@LofiGirl/live'), true);
  assert.equal(isYouTubeHandleLiveUrl('https://www.youtube.com/@LofiGirl'), false);
  assert.equal(isYouTubeHandleLiveUrl('https://www.youtube.com/live/jfKfPfyJRdk'), false);
  assert.equal(isYouTubeHandleLiveUrl('https://notyoutube.com/@LofiGirl/live'), false);
});

test('getYouTubeSourceKind', () => {
  assert.equal(getYouTubeSourceKind('https://studio.youtube.com/video/abc/livestreaming'), 'studio');
  assert.equal(getYouTubeSourceKind('https://youtu.be/abc'), 'shortlink');
  assert.equal(getYouTubeSourceKind('https://www.youtube.com/@LofiGirl/live'), 'channel-live');
  assert.equal(getYouTubeSourceKind('https://www.youtube.com/watch?v=abc'), 'direct-video');
});

test('YouTube channel helpers', () => {
  assert.equal(extractYouTubeChannelLiveUrl('https://www.youtube.com/@LofiGirl/live'), 'https://www.youtube.com/@LofiGirl');
  assert.equal(extractYouTubeChannelLiveUrl('https://www.youtube.com/watch?v=abc'), undefined);
  assert.equal(extractYouTubeChannelLabel('https://www.youtube.com/@LofiGirl'), '@LofiGirl');
  assert.equal(toPublicLiveUrl('abc'), 'https://www.youtube.com/live/abc');
});
