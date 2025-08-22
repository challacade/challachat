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

  setUrl(url: string) { this.currentUrl = url; }

  showConnectingOnce() {
    if (!this.connectingShown) {
      console.log('Connecting...');
      this.connectingShown = true;
    }
  }

  addRecent(name: string, text: string) {
    this.recent.push({ name, text });
    if (this.recent.length > 8) this.recent = this.recent.slice(-8);
  }

  render() {
    try { console.clear(); } catch {}
    console.log(`${ANSI.bold}${ANSI.green}ChallaChat Overlay is Active${ANSI.reset}`);
    console.log('');
    const overlayUrl = `http://localhost:${this.port}/overlay`;
    console.log('Overlay URL:');
    console.log(`${ANSI.bold}${ANSI.cyan}${overlayUrl}${ANSI.reset}`);
    console.log('');
    console.log('Connected to livestream:');
    console.log(`${ANSI.bold}${ANSI.yellow}${this.currentUrl || ''}${ANSI.reset}`);
    console.log('');
    for (const m of this.recent) {
      console.log(`${ANSI.bold}${m.name}${ANSI.reset}: ${ANSI.white}${m.text}${ANSI.reset}`);
    }
  }

  close() { this.rl.close(); }
}
