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

export class TerminalUI {
  private rl: readline.Interface;
  private port: number;
  private currentUrl: string | null = null;
  private recent: RecentMessage[] = [];
  private connectingShown = false;
  private headerPrinted = false;
  private lastPrintedUrl: string | null = null;

  constructor(port: number) {
    this.port = port;
    this.rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    try { console.clear(); } catch {}
    console.log('Welcome to the ChallaChat Overlay!');
    this.rl.setPrompt(`${ANSI.bold}${ANSI.yellow}Enter livestream URL:${ANSI.reset} `);
  }

  onLine(cb: (line: string) => void) {
  this.rl.on('line', (input: string) => cb(input.trim()));
  }

  onClose(cb: () => void) {
    this.rl.on('close', cb);
  }

  prompt() { this.rl.prompt(); }

  setUrl(url: string) {
    this.currentUrl = url;
    // If header is already printed, append the URL once without clearing
    if (this.headerPrinted && this.currentUrl && this.currentUrl !== this.lastPrintedUrl) {
      // Print ONLY the URL on the next line after the already-printed label
      console.log(`${ANSI.bold}${ANSI.yellow}${this.currentUrl}${ANSI.reset}`);
      console.log('');
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

  render() {
  if (this.headerPrinted) return; // One-time render only
  try { console.clear(); } catch {}
  console.log(`${ANSI.bold}${ANSI.green}ChallaChat Overlay is Active${ANSI.reset}`);
  console.log('');
  const overlayUrl = `http://localhost:${this.port}/overlay`;
  console.log('Overlay URL:');
  console.log(`${ANSI.bold}${ANSI.cyan}${overlayUrl}${ANSI.reset}`);
  console.log('');
  console.log('Connected to livestream:');
  if (this.currentUrl) {
    console.log(`${ANSI.bold}${ANSI.yellow}${this.currentUrl}${ANSI.reset}`);
    console.log('');
  }
  this.headerPrinted = true;
  this.lastPrintedUrl = this.currentUrl;
  }

  close() { this.rl.close(); }
}
