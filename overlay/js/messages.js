/**
 * ChallaChat Overlay - Message Rendering
 * Message rendering, avatar handling, push/remove/update, and dummy chatters
 */

import { state, elements, DUMMY_MESSAGES, showToast } from './state.js';
import { handleAvatarError } from './utils.js';

// ================================
// Shared Segment Renderer
// ================================

/**
 * Append parsed chat segments (text + emote images) into a container element.
 * @param {HTMLElement} container - Target element to append nodes into
 * @param {Array} segments - Array of {t:'text',text} or {t:'emote',url,alt} objects
 */
function renderSegments(container, segments) {
  for (const segment of segments) {
    if (!segment) continue;
    if (segment.t === 'text') {
      container.append(segment.text || '');
    } else if (segment.t === 'emote' && segment.url) {
      const img = document.createElement('img');
      img.className = 'emoji-img';
      img.src = segment.url;
      img.alt = segment.alt || '';
      img.decoding = 'async';
      img.loading = 'lazy';
      container.appendChild(img);
    }
  }
}

// ================================
// Dummy Chatters
// ================================

let dummyMessageIndex = 0;
let dummyChattersInterval = null;
let dummyMessageCount = 0;

export function startDummyChatters() {
  if (dummyChattersInterval) return;
  showToast('Dummy chatters started');
  dummyMessageCount = 0;
  addDummyMessage();
  scheduleNextDummyMessage();
}

function scheduleNextDummyMessage() {
  let delay;
  if (dummyMessageCount === 1) {
    delay = 2000;
  } else if (dummyMessageCount === 2) {
    delay = 3000;
  } else {
    delay = Math.random() * 3000 + 3000;
  }
  dummyChattersInterval = setTimeout(() => {
    addDummyMessage();
    scheduleNextDummyMessage();
  }, delay);
}

export function stopDummyChatters() {
  if (dummyChattersInterval) {
    clearTimeout(dummyChattersInterval);
    dummyChattersInterval = null;
    dummyMessageCount = 0;
    showToast('Dummy chatters stopped');
  }
}

function addDummyMessage() {
  const message = DUMMY_MESSAGES[dummyMessageIndex];
  dummyMessageIndex = (dummyMessageIndex + 1) % DUMMY_MESSAGES.length;
  dummyMessageCount++;
  
  const demoEvent = {
    id: `dummy_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    author: message.author,
    text: message.text,
    kind: message.kind,
    ts: Date.now()
  };
  
  const item = extEventToItem(demoEvent);
  const messageNode = renderMessage(item);
  
  if (messageNode) {
    pushMessageElement(messageNode, item.snippet.publishedAt);
  }
}

// ================================
// Event Transformation
// ================================

export function extEventToItem(event) {
  const id = event.id || `ext_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const nowIso = new Date(event.ts || Date.now()).toISOString();
  
  const authorDetails = {
    displayName: event?.author?.name || 'User',
    profileImageUrl: event?.author?.avatar || '',
    isChatOwner: !!event?.author?.flags?.owner,
    isChatModerator: !!event?.author?.flags?.mod,
    isVerified: !!event?.author?.flags?.verified,
    isChatSponsor: !!event?.author?.flags?.member,
    badges: Array.isArray(event?.author?.badges) ? event.author.badges : undefined,
    nameColor: event?.author?.nameColor || undefined,
    badgePosition: event?.author?.badgePosition || 'right'
  };
  
  let type = 'textMessageEvent';
  const kind = event.kind || 'text';
  
  if (kind === 'sub' || kind === 'sub-gift' || kind === 'member' || kind === 'member-renewal' || kind === 'member-gift' || kind === 'streak') {
    type = 'newSponsorEvent';
  } else if (kind === 'member-milestone') {
    type = 'memberMilestoneChatEvent';
  } else if (kind === 'cheer' || kind === 'donation' || kind === 'tip') {
    type = 'superChatEvent';
  }
  
  const snippet = {
    type,
    publishedAt: nowIso,
    displayMessage: event.text || '',
    textMessageDetails: { messageText: event.text || '' }
  };
  
  const segments = Array.isArray(event.segments) ? event.segments : undefined;
  
  const extras = {};
  if (kind === 'donation' && typeof event.amountDisplay === 'string') {
    extras.amountDisplay = event.amountDisplay;
    extras.color = event.color || '';
  }
  // Pass through systemMessage for sub/membership events
  if (typeof event.systemMessage === 'string' && event.systemMessage) {
    extras.systemMessage = event.systemMessage;
  }
  // Pass through replyTo for reply messages
  if (event.replyTo && typeof event.replyTo.username === 'string') {
    extras.replyTo = event.replyTo;
  }
  
  const showUsername = event?.showUsername !== false;
  const effects = (event && typeof event === 'object') ? (event.effects || null) : null;
  
  return { id, snippet, authorDetails, segments, showUsername, effects, ...extras };
}

// ================================
// Message Rendering
// ================================

export function renderMessage(item) {
  const { id, snippet, authorDetails } = item;
  if (state.seenIds.has(id)) return null;
  state.seenIds.add(id);

  const isSuper = (snippet?.type === 'superChatEvent' || snippet?.type === 'superStickerEvent' || snippet?.type === 'newSponsorEvent' || snippet?.type === 'memberMilestoneChatEvent');
  const container = document.createElement('div');
  container.className = `message${isSuper ? ' super' : ''}`;
  container.dataset.id = id;

  // Optional effects (e.g. !jam)
  if (item?.effects && item.effects.jam) {
    container.classList.add('fx-jam');
  } else if (item?.effects && item.effects.jamFinale) {
    container.classList.add('fx-jam-finale');
  }

  const isOwner = !!authorDetails?.isChatOwner;
  const isMod = !!authorDetails?.isChatModerator;
  const isMember = !!authorDetails?.isChatSponsor || snippet?.type === 'newSponsorEvent' || snippet?.type === 'memberMilestoneChatEvent';
  const isVerified = !!authorDetails?.isVerified;
  
  if (isOwner) { container.classList.add('ring-owner'); }
  else if (isMod) { container.classList.add('ring-mod'); }
  else if (isMember) { container.classList.add('ring-member'); }
  else if (isVerified) { container.classList.add('ring-verified'); }

  const avatarUrl = authorDetails?.profileImageUrl || authorDetails?.avatar || '';
  if (state.showAvatars && avatarUrl) {
    const avatar = document.createElement('div');
    avatar.className = 'avatar';
    const avatarImg = document.createElement('img');
    avatarImg.alt = 'avatar';
    avatarImg.src = avatarUrl;
    avatarImg.dataset.retryCount = '0';
    avatarImg.dataset.originalSrc = avatarUrl;
    avatarImg.addEventListener('error', handleAvatarError);
    avatar.appendChild(avatarImg);
    container.appendChild(avatar);
  }

  const body = document.createElement('div');
  body.className = 'body';
  const showUsername = item?.showUsername !== false;
  const nameElement = document.createElement('span');
  nameElement.className = 'name';
  const baseName = (authorDetails?.displayName || authorDetails?.name || 'Unknown');
  nameElement.textContent = baseName;
  
  // Apply username color if provided (primarily from Twitch)
  if (authorDetails?.nameColor) {
    nameElement.style.color = authorDetails.nameColor;
  }
  
  const contentElement = document.createElement('span');
  contentElement.className = 'content';
  
  // If a donation amount is displayed, prepend a single space to the message content
  const hasAmount = (snippet?.type === 'superChatEvent' && typeof item.amountDisplay === 'string' && item.amountDisplay) || (typeof item.amountDisplay === 'string' && item.amountDisplay);
  if (hasAmount) {
    contentElement.append(' ');
  }

  // Skip regular segment rendering for subscription messages (handled later with systemMessage)
  const isSubMessageType = snippet?.type === 'newSponsorEvent' && typeof item.systemMessage === 'string' && item.systemMessage;
  
  const segments = item?.segments;
  if (!isSubMessageType && Array.isArray(segments) && segments.length) {
    renderSegments(contentElement, segments);
  } else if (!isSubMessageType) {
    const text = snippet?.displayMessage || snippet?.textMessageDetails?.messageText || '';
    contentElement.textContent = '';

    // Jam finale system message: only color the trailing "got N jams!" part.
    if (item?.effects?.jamFinale && typeof text === 'string') {
      const idx = text.lastIndexOf("' got ");
      if (idx > 0 && idx + 2 < text.length) {
        const prefix = text.slice(0, idx + 1);
        const suffix = text.slice(idx + 2);
        const accent = document.createElement('span');
        accent.className = 'jam-accent';
        accent.textContent = suffix;
        contentElement.append(prefix);
        contentElement.append(' ');
        contentElement.appendChild(accent);
      } else {
        contentElement.append(text);
      }
    } else {
      contentElement.append(text);
    }
  }

  // Render header with optional badges
  const header = document.createElement('span');
  header.className = 'header';
  const badgePosition = authorDetails?.badgePosition || 'right';

  const badges = Array.isArray(item?.authorDetails?.badges) ? item.authorDetails.badges : [];
  let badgesWrap = null;
  if (showUsername && state.showBadges && badges.length) {
    badgesWrap = document.createElement('span');
    badgesWrap.className = 'badges badges-inline';
    // Add position class for CSS styling if needed
    badgesWrap.classList.add(badgePosition === 'left' ? 'badges-left' : 'badges-right');
    try {
      const cs = getComputedStyle(nameElement);
      const fs = cs.fontSize;
      const lh = cs.lineHeight;
      if (fs) badgesWrap.style.fontSize = fs;
      if (lh && lh !== 'normal') badgesWrap.style.lineHeight = lh;
    } catch {}
    
    for (const b of badges) {
      if (b?.url) {
        const img = document.createElement('img');
        img.className = 'emoji-img badge-img';
        img.src = b.url;
        img.alt = '';
        if (b.alt || b.type) img.title = b.alt || b.type;
        img.decoding = 'async';
        img.loading = 'lazy';
        badgesWrap.appendChild(img);
      } else if (b?.emoji && state.showEmojiBadges) {
        const span = document.createElement('span');
        span.className = 'badge-emoji';
        span.textContent = b.emoji;
        span.title = b.alt || b.type || '';
        badgesWrap.appendChild(span);
      }
    }
  }
  
  // Append elements in correct order based on badge position
  const hasBadges = badgesWrap && badgesWrap.childElementCount > 0;
  if (showUsername) {
    if (hasBadges && badgePosition === 'left') {
      header.appendChild(badgesWrap);
      header.appendChild(nameElement);
    } else {
      header.appendChild(nameElement);
      if (hasBadges) {
        header.appendChild(badgesWrap);
      }
    }
    if (!hasBadges) {
      header.classList.add('no-inline-badges');
    }
  } else {
    header.classList.add('no-inline-badges');
  }

  // If super chat, show amount next to name (after badges)
  if (showUsername && snippet?.type === 'superChatEvent' && typeof item.amountDisplay === 'string' && item.amountDisplay) {
    const amountEl = document.createElement('span');
    amountEl.className = 'primary';
    amountEl.textContent = `\u00A0${item.amountDisplay}`;
    header.appendChild(amountEl);
  }
  
  // Display reply preview ABOVE the header (e.g., "@username: message preview")
  if (item.replyTo && typeof item.replyTo.username === 'string') {
    const replyEl = document.createElement('div');
    replyEl.className = 'reply-preview';
    
    const replyUsername = document.createElement('span');
    replyUsername.className = 'reply-username';
    replyUsername.textContent = `@${item.replyTo.username}`;
    replyEl.appendChild(replyUsername);
    
    if (item.replyTo.messagePreview) {
      const replyText = document.createElement('span');
      replyText.className = 'reply-text';
      replyText.textContent = `: ${item.replyTo.messagePreview}`;
      replyEl.appendChild(replyText);
    }
    
    body.appendChild(replyEl);
  }
  
  if (showUsername) body.appendChild(header);
  
  // For subscription messages, render systemMessage as inline content (not a separate line)
  // For other message types with systemMessage, show it on its own line
  const isSubMessage = snippet?.type === 'newSponsorEvent' && typeof item.systemMessage === 'string' && item.systemMessage;
  
  if (typeof item.systemMessage === 'string' && item.systemMessage && !isSubMessage) {
    // Non-subscription system messages get their own line
    const systemEl = document.createElement('div');
    systemEl.className = 'system-message';
    systemEl.textContent = item.systemMessage;
    body.appendChild(systemEl);
  }
  
  // For subscriptions, render systemMessage as inline content
  // Custom message (segments) goes on its own line below
  if (isSubMessage) {
    contentElement.textContent = item.systemMessage;
    
    // If there's also custom message content, add it on a new line
    const segments = item?.segments;
    if (Array.isArray(segments) && segments.length) {
      const customMsgEl = document.createElement('div');
      customMsgEl.className = 'sub-custom-message';
      renderSegments(customMsgEl, segments);
      // Only append if there's actual content
      if (customMsgEl.textContent?.trim() || customMsgEl.querySelector('img')) {
        body.appendChild(contentElement);
        body.appendChild(customMsgEl);
        container.appendChild(body);
        return container;
      }
    }
  }
  
  body.appendChild(contentElement);
  container.appendChild(body);
  return container;
}

// ================================
// Message Management
// ================================

export function pushMessageElement(node, timestamp) {
  node.dataset.ts = String(timestamp || Date.now());
  elements.messages.appendChild(node);
  try { adjustMessageAlignment(node); } catch {}
}

export function adjustMessageAlignment(node) {
  const body = node.querySelector('.body');
  const content = node.querySelector('.content');
  if (!body || !content) return;
  
  const computedStyle = getComputedStyle(content);
  let lineHeight = parseFloat(computedStyle.lineHeight);
  if (isNaN(lineHeight) || computedStyle.lineHeight === 'normal') {
    const fontSize = parseFloat(computedStyle.fontSize) || 14;
    lineHeight = fontSize * 1.35;
  }
  
  const bodyHeight = body.getBoundingClientRect().height;
  const isSingleLine = bodyHeight <= (lineHeight * 1.5);
  node.classList.toggle('single-line', isSingleLine);
}

export function removeMessageById(messageId) {
  if (!messageId) return;
  const messageElement = document.querySelector(`.message[data-id="${messageId}"]`);
  if (messageElement) {
    messageElement.classList.add('deleting');
    setTimeout(() => {
      if (messageElement.parentElement) {
        messageElement.parentElement.removeChild(messageElement);
      }
    }, 300);
  }
  state.seenIds.delete(messageId);
  state.byId.delete(messageId);
}

export function updateMessageById(updateEvent) {
  if (!updateEvent.id) return;
  const messageElement = document.querySelector(`.message[data-id="${updateEvent.id}"]`);
  if (!messageElement) return;
  
  const contentElement = messageElement.querySelector('.content');
  if (!contentElement) return;
  
  contentElement.textContent = '';
  const segments = updateEvent.segments;
  
  if (Array.isArray(segments) && segments.length) {
    renderSegments(contentElement, segments);
  } else {
    const text = updateEvent.text || '';
    contentElement.append(text);
  }
  
  try { adjustMessageAlignment(messageElement); } catch {}
}

export function clearAllMessages() {
  elements.messages.innerHTML = '';
  state.seenIds.clear();
  state.byId.clear();
  showToast('All messages cleared');
}
