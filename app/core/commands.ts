import type { ChatEvent } from '../capture/types';
import type { NowPlaying } from './nowPlaying';
import { tryJam, isJamEnabled } from './jam';

export type CommandContext = {
  nowPlaying: NowPlaying | null;
  broadcastSystemMessage: (text: string) => void;
};

export function runChatCommands(message: ChatEvent, ctx: CommandContext): void {
  if (!message) return;
  const text = typeof message.text === 'string' ? message.text.trim() : '';
  if (!text) return;

  // Command: !jam
  if (text === '!jam' && isJamEnabled()) {
    const authorName = message.author?.name || '';
    tryJam(authorName, ctx.nowPlaying);
  }
}
