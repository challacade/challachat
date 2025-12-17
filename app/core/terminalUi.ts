/* eslint-disable no-console */
import readline from 'readline';

const ANSI = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  yellow: '\x1b[33m',
  white: '\x1b[37m'
};

export interface RecentMessage { name: string; text: string }

export type MusicHotkeyAction = 'playPause' | 'prev' | 'next' | 'shuffle';

// Terminal UI: handles prompts and the one-time status header
export class TerminalUI {
  private rl: readline.Interface;
  private port: number;
  private currentUrl: string | null = null;
  private recent: RecentMessage[] = [];
  private connectingShown = false;
  private headerPrinted = false;
  private lastPrintedUrl: string | null = null;
  // Number of lines to move cursor UP from the bottom to reach the reserved URL line.
  // When null, no reposition is needed (URL already printed in place).
  private urlOffsetFromBottom: number | null = null;
  private captureNextResolver: ((line: string) => void) | null = null;
  private defaultPrompt: string;

  private musicHotkeysActive = false;
  private keypressHandler: ((str: string, key: any) => void) | null = null;

  constructor(port: number) {
    this.port = port;
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try { console.clear(); } catch {}
    this.defaultPrompt = `${ANSI.bold}${ANSI.yellow}Enter livestream URL:${ANSI.reset} `;
    this.rl.setPrompt(this.defaultPrompt);
  }

  onLine(cb: (line: string) => void) {
  // Ensure only one listener that respects one-off capture
  this.rl.removeAllListeners('line');
  this.rl.on('line', (input: string) => {
      const trimmed = input.trim();
      if (this.captureNextResolver) {
        const resolver = this.captureNextResolver; this.captureNextResolver = null;
        // Restore default prompt for main entry
        this.rl.setPrompt(this.defaultPrompt);
        resolver(trimmed);
        return;
      }
      cb(trimmed);
    });
  }

  onClose(cb: () => void) {
    this.rl.on('close', cb);
  }

  prompt() { this.rl.prompt(); }

  showWelcome() {
    console.log('Welcome to the ChallaChat Overlay!');
    this.rl.setPrompt(this.defaultPrompt);
  }

  async askOnce(question: string): Promise<string> {
    return new Promise<string>((resolve) => {
      this.captureNextResolver = (ans: string) => {
        resolve(ans);
        // After resolving, show the main prompt again (but don't auto-prompt here to avoid double prompts)
      };
      this.rl.setPrompt(`${ANSI.bold}${ANSI.yellow}${question}:${ANSI.reset} `);
      this.rl.prompt();
    });
  }

  setPort(port: number) {
    this.port = port;
  }

  setUrl(url: string) {
    this.currentUrl = url;
    // If header is already printed, append the URL once without clearing
    if (this.headerPrinted && this.currentUrl && this.currentUrl !== this.lastPrintedUrl) {
      if (this.urlOffsetFromBottom != null) {
        // Move to the reserved URL line (directly under the label), write the URL, then return to bottom
        try {
          readline.moveCursor(process.stdout, 0, -this.urlOffsetFromBottom);
          readline.clearLine(process.stdout, 0);
          // Write URL (reserved line) and keep exactly one blank line before instructions
          process.stdout.write(`${ANSI.bold}${ANSI.yellow}${this.currentUrl}${ANSI.reset}` + '\n');
          // After writing one newline, the distance to bottom decreases by 1
          readline.moveCursor(process.stdout, 0, this.urlOffsetFromBottom - 1);
        } catch {
          // Fallback: just append at bottom if cursor ops fail
          console.log(`${ANSI.bold}${ANSI.yellow}${this.currentUrl}${ANSI.reset}`);
          console.log('');
        }
        this.urlOffsetFromBottom = null;
      } else {
        // No reserved slot tracked; append at bottom
        console.log(`${ANSI.bold}${ANSI.yellow}${this.currentUrl}${ANSI.reset}`);
        console.log('');
      }
      this.lastPrintedUrl = this.currentUrl;
    }
  }

  showConnectingOnce() {
    if (!this.connectingShown) {
      console.log('Connecting...');
      this.connectingShown = true;
    }
  }

  addRecent(_name: string, _text: string) {
    // Intentionally no-op: we no longer preview chat in the terminal
  }

  enableMusicHotkeys(onAction: (action: MusicHotkeyAction) => void): boolean {
    if (this.musicHotkeysActive) return true;

    const input: any = process.stdin as any;
    if (!input || !input.isTTY) return false;

    try {
      // Wire keypress events for the existing readline interface.
      (readline as any).emitKeypressEvents(input, this.rl);
    } catch {
      try { (readline as any).emitKeypressEvents(input); } catch {}
    }

    this.keypressHandler = (str: string, key: any) => {
      try {
        if (key?.ctrl && key?.name === 'c') {
          // Preserve Ctrl+C behavior.
          try { this.disableMusicHotkeys(); } catch {}
          try { process.emit('SIGINT'); } catch {}
          return;
        }

        const ch = typeof str === 'string' ? str : '';
        if (ch === 'm' || ch === 'M') { onAction('playPause'); return; }
        if (ch === '<' || (key?.name === 'comma' && key?.shift)) { onAction('prev'); return; }
        if (ch === '>' || (key?.name === 'period' && key?.shift)) { onAction('next'); return; }
        if (ch === '?' || (key?.name === 'slash' && key?.shift)) { onAction('shuffle'); return; }
      } catch {
        // ignore
      }
    };

    try {
      input.on('keypress', this.keypressHandler);
      input.setRawMode(true);
      input.resume();
      this.musicHotkeysActive = true;
      return true;
    } catch {
      // If anything fails (non-TTY, raw mode unsupported), leave it disabled.
      try { input.off('keypress', this.keypressHandler); } catch {}
      this.keypressHandler = null;
      this.musicHotkeysActive = false;
      return false;
    }
  }

  disableMusicHotkeys() {
    if (!this.musicHotkeysActive) return;
    const input: any = process.stdin as any;
    try {
      if (this.keypressHandler) input.off('keypress', this.keypressHandler);
    } catch {}
    this.keypressHandler = null;
    try { input.setRawMode(false); } catch {}
    this.musicHotkeysActive = false;
  }

  render() {
  if (this.headerPrinted) return; // One-time render only
  try { console.clear(); } catch {}
  const headerWhite = `${ANSI.bold}${ANSI.white}ChallaChat Overlay is${ANSI.reset}`;
  const headerGreen = `${ANSI.bold}${ANSI.green} Active on Port ${this.port}${ANSI.reset}`;
  console.log(`${headerWhite}${headerGreen}`);
  console.log('');
  // Livestream URL section
  console.log('Connected to livestream:');
  if (this.currentUrl) {
    console.log(`${ANSI.bold}${ANSI.yellow}${this.currentUrl}${ANSI.reset}`);
    // Do not add another blank here; the instructions block starts with a spacer line
    this.urlOffsetFromBottom = null;
  } else {
    // Reserve a blank line for the URL to be filled later, and remember how far up it is from the bottom
    console.log('');
  // Lines after the reserved URL line (current layout):
  // 1) spacer before instructions
  // 2) step 1
  // 3) step 2
  // 4) step 3
  // 5) spacer
  // 6) background note
  // 7) visit link
  // To reach the reserved line from the bottom, move up N+1 = 8 lines
  this.urlOffsetFromBottom = 8;
  }
  // Instructions block
  const overlayUrl = `http://localhost:${this.port}`;
  console.log('');
  console.log('1. Create a new Browser source in your streaming software.');
  console.log(`2. Set the URL to: ${ANSI.bold}${ANSI.cyan}${overlayUrl}${ANSI.reset}`);
  console.log("3. Once created, select 'Interact' on the source to edit settings.");
  console.log('');
  console.log('This terminal runs in the background, keeping the overlay updated.');
console.log(`Visit ${ANSI.bold}challachat.com${ANSI.reset} for more information!`);
  this.headerPrinted = true;
  this.lastPrintedUrl = this.currentUrl;
  }

  close() { this.rl.close(); }
}
