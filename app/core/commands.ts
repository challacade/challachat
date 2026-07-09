import type { ChatEvent } from '../capture/types';

export function runChatCommands(message: ChatEvent): void {
  if (!message) return;
  // Command engine to be reimplemented via commands.json.
}
