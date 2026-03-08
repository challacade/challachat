/**
 * DOM element references and shared state for the admin panel.
 */

// ─── Feature detect ────────────────────────────────────────────
export const isElectron = !!(window.challachat && window.challachat.isElectron);

// ─── DOM refs ──────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);

export const logoImg       = $('logoImg');
export const urlInput      = $('urlInput');
export const connectBtn    = $('connectBtn');
export const connectError  = $('connectError');
export const connectSection  = $('connectSection');
export const connectionsContainer = $('connectionsContainer');
export const overlayUrl      = $('overlayUrl');
export const copyBtn         = $('copyBtn');
export const overlayCard     = $('overlayCard');
export const dummyChattersToggle  = $('dummyChattersToggle');
export const startWithoutConnecting = $('startWithoutConnecting');
export const welcomeView     = $('welcomeView');
export const activeView      = $('activeView');
export const addConnectionCard = $('addConnectionCard');
export const addUrlInput     = $('addUrlInput');
export const addConnectBtn   = $('addConnectBtn');
export const closeServerLink = $('closeServerLink');
// Settings
export const filterPathInput = $('filterPathInput');
export const filterBrowseBtn = $('filterBrowseBtn');
export const filterToggle    = $('filterToggle');
export const filterMeta      = $('filterMeta');
export const loggerToggle    = $('loggerToggle');
export const jamToggle       = $('jamToggle');
export const clearMessagesBtn = $('clearMessagesBtn');
// Appearance
export const scaleSlider     = $('scaleSlider');
export const scaleLabel      = $('scaleLabel');
export const textOpSlider    = $('textOpSlider');
export const textOpLabel     = $('textOpLabel');
export const bubbleOpSlider  = $('bubbleOpSlider');
export const bubbleOpLabel   = $('bubbleOpLabel');
export const bgOpSlider      = $('bgOpSlider');
export const bgOpLabel       = $('bgOpLabel');
export const gapSlider       = $('gapSlider');
export const gapLabel        = $('gapLabel');
export const edgePaddingSlider = $('edgePaddingSlider');
export const edgePaddingLabel  = $('edgePaddingLabel');
export const textColorPicker   = $('textColorPicker');
export const bubbleColorPicker = $('bubbleColorPicker');
export const bgColorPicker     = $('bgColorPicker');
export const showBubblesToggle = $('showBubblesToggle');
export const showAvatarsToggle = $('showAvatarsToggle');
export const showBadgesToggle  = $('showBadgesToggle');
export const presetSelect      = $('presetSelect');
// Font
export const overlayFontSelect       = $('overlayFontSelect');
// Texture
export const textureSelect          = $('textureSelect');
export const textureIntensitySlider  = $('textureIntensitySlider');
export const textureIntensityLabel   = $('textureIntensityLabel');
export const textureScaleSlider      = $('textureScaleSlider');
export const textureScaleLabel       = $('textureScaleLabel');
export const textureColorPicker      = $('textureColorPicker');
// Sound
export const msgVolSlider      = $('msgVolSlider');
export const msgVolLabel       = $('msgVolLabel');
export const msgMuteIcon       = $('msgMuteIcon');
export const donVolSlider      = $('donVolSlider');
export const donVolLabel       = $('donVolLabel');
export const donMuteIcon       = $('donMuteIcon');
export const memVolSlider      = $('memVolSlider');
export const memVolLabel       = $('memVolLabel');
export const memMuteIcon       = $('memMuteIcon');
export const testMsgBtn        = $('testMsgBtn');
export const testDonBtn        = $('testDonBtn');
export const testMemBtn        = $('testMemBtn');
export const browseMsgBtn      = $('browseMsgBtn');
export const browseDonBtn      = $('browseDonBtn');
export const browseMemBtn      = $('browseMemBtn');
export const msgFilename       = $('msgFilename');
export const donFilename       = $('donFilename');
export const memFilename       = $('memFilename');
// Music
export const musicNowPlaying   = $('musicNowPlaying');
export const musicPrevBtn      = $('musicPrevBtn');
export const musicPlayBtn      = $('musicPlayBtn');
export const musicNextBtn      = $('musicNextBtn');
export const musicShuffleBtn   = $('musicShuffleBtn');
export const musicVolSlider    = $('musicVolSlider');
export const musicVolLabel     = $('musicVolLabel');
export const musicVolIcon      = $('musicVolIcon');
export const musicPathInput    = $('musicPathInput');
export const musicBrowseBtn    = $('musicBrowseBtn');
export const songDisplaySelect = $('songDisplaySelect');
export const scrollSpeedSlider = $('scrollSpeedSlider');
export const scrollSpeedLabel  = $('scrollSpeedLabel');
export const songTextSizeSlider = $('songTextSizeSlider');
export const songTextSizeLabel  = $('songTextSizeLabel');
export const writeSongFileToggle = $('writeSongFileToggle');
export const autoShuffleToggle  = $('autoShuffleToggle');
export const playlistLoopToggle = $('playlistLoopToggle');
// UI Theme & Zoom
export const uiThemeSelect     = $('uiThemeSelect');
export const uiZoomSelect      = $('uiZoomSelect');
export const chatDirectionSelect = $('chatDirectionSelect');
// Navigation
export const navHome         = $('navHome');
export const navAppearance   = $('navAppearance');
export const navSound        = $('navSound');
export const navSettings     = $('navSettings');

export const pages = {
  home:       $('pageHome'),
  appearance: $('pageAppearance'),
  sound:      $('pageSound'),
  settings:   $('pageSettings'),
};

export const navButtons = [navHome, navAppearance, navSound, navSettings];
