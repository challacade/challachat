import type { ChatEvent } from '../capture/types';
import type { NowPlaying } from './nowPlaying';
import { tryJam, isJamEnabled } from './jam';

export type CommandContext = {
  nowPlaying: NowPlaying | null;
};

export function runChatCommands(message: ChatEvent, ctx: CommandContext): void {
  if (!message) return;
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (!text) return;

  // Command: !jam (case-insensitive)
  if (text.toLowerCase() === '!jam' && isJamEnabled()) {
    const authorName = message.author?.name || '';
    const result = tryJam(authorName, ctx.nowPlaying);
    if (result.accepted) {
      // Rewrite the chat text so it reads: "<username> is jamming!"
      // (the overlay renders the username separately in the header)
      message.text = 'is jamming!';
      message.segments = [
        { t: 'text', text: 'is jamming! ' },
        { t: 'emote', url: 'https://cdn.7tv.app/emote/01F6MWBB8R000255K4X1KDFFY5/4x.avif', alt: 'NOTED' },
      ];
      message.effects = { ...(message.effects || {}), jam: true };
    }
  }
}
