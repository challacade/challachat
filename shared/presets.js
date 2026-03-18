/**
 * Shared theme presets - single source of truth for overlay + admin.
 *
 * Uses the flat key format (same as the server appearance API):
 *   scale, messageGap, textColor, bubbleColor, bgColor,
 *   textOpacity, bubbleOpacity, bgOpacity,
 *   showBubbles, showAvatars, showBadges
 */

export const PRESETS = {
  Dark: {
    scale: 1.35, messageGap: 0.5,
    textColor: '#ffffff', bubbleColor: '#ffffff', bgColor: '#000000',
    textOpacity: 1, bubbleOpacity: 0.14, bgOpacity: 1, textShadow: 0.25,
    showBubbles: true, showAvatars: true, showBadges: true,
  },
  Light: {
    scale: 1.35, messageGap: 0.5,
    textColor: '#111111', bubbleColor: '#000000', bgColor: '#ffffff',
    textOpacity: 1, bubbleOpacity: 0.08, bgOpacity: 1, textShadow: 0.25,
    showBubbles: true, showAvatars: true, showBadges: true,
  },
  Transparent: {
    scale: 1.35, messageGap: 0.4,
    textColor: '#ffffff', bubbleColor: '#ffffff', bgColor: '#000000',
    textOpacity: 1, bubbleOpacity: 0.14, bgOpacity: 0, textShadow: 0.25,
    showBubbles: false, showAvatars: true, showBadges: true,
  },
};
