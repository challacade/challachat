/**
 * Windows System Media Transport Controls (SMTC) reader.
 *
 * Spawns a persistent PowerShell process that polls the Windows media session
 * via WinRT and reports now-playing info as JSON lines on stdout.
 * Only operates on win32; start() is a no-op on other platforms.
 */

import { spawn, type ChildProcess } from 'child_process';

export interface SmtcInfo {
  title: string;
  artist: string;
  albumTitle: string;
  playbackStatus: string;
  sourceAppId: string;
}

/** Fired when the detected song changes. Empty songId + null info means no active session. */
export type SmtcCallback = (songId: string, info: SmtcInfo | null) => void;

// PowerShell script that initialises WinRT once, then polls SMTC every 3 s.
// Outputs one JSON line per poll to stdout.
const PS_SCRIPT = `$ErrorActionPreference = 'SilentlyContinue'
Add-Type -AssemblyName System.Runtime.WindowsRuntime

$asTaskGeneric = ([System.WindowsRuntimeSystemExtensions].GetMethods() | Where-Object {
  $_.Name -eq 'AsTask' -and $_.GetParameters().Count -eq 1 -and
  $_.GetParameters()[0].ParameterType.Name -eq 'IAsyncOperation\`1'
})[0]

function AwaitOp($WinRtTask, $ResultType) {
  $asTask = $asTaskGeneric.MakeGenericMethod($ResultType)
  $netTask = $asTask.Invoke($null, @($WinRtTask))
  $netTask.Wait(-1) | Out-Null
  $netTask.Result
}

try {
  [void][Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager, Windows.Media.Control, ContentType=WindowsRuntime]
  $manager = AwaitOp ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager]::RequestAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionManager])
} catch {
  $err = @{ status = 'init_error'; message = $_.Exception.Message } | ConvertTo-Json -Compress
  [Console]::WriteLine($err)
  exit 1
}

[Console]::WriteLine('{"status":"ready"}')

while ($true) {
  try {
    $session = $manager.GetCurrentSession()
    if ($null -eq $session) {
      [Console]::WriteLine('{"status":"no_session"}')
    } else {
      $mediaProperties = AwaitOp ($session.TryGetMediaPropertiesAsync()) ([Windows.Media.Control.GlobalSystemMediaTransportControlsSessionMediaProperties])
      $playbackInfo = $session.GetPlaybackInfo()
      $obj = @{
        status = 'ok'
        title = if ($mediaProperties.Title) { [string]$mediaProperties.Title } else { '' }
        artist = if ($mediaProperties.Artist) { [string]$mediaProperties.Artist } else { '' }
        albumTitle = if ($mediaProperties.AlbumTitle) { [string]$mediaProperties.AlbumTitle } else { '' }
        playbackStatus = [string]$playbackInfo.PlaybackStatus
        sourceAppId = [string]$session.SourceAppUserModelId
      }
      [Console]::WriteLine(($obj | ConvertTo-Json -Compress))
    }
  } catch {
    $err = @{ status = 'error'; message = $_.Exception.Message } | ConvertTo-Json -Compress
    [Console]::WriteLine($err)
  }
  Start-Sleep -Seconds 3
}`;

export class SmtcPoller {
  private child: ChildProcess | null = null;
  private buffer = '';
  private lastSongId: string | null = null;
  private cb: SmtcCallback | null = null;
  private exitCleanup: (() => void) | null = null;

  /** Start polling Windows SMTC. No-op on non-Windows platforms. */
  start(callback: SmtcCallback): void {
    if (this.child) return;
    if (process.platform !== 'win32') return;

    this.cb = callback;
    this.lastSongId = null;
    this.buffer = '';

    const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');

    try {
      this.child = spawn('powershell.exe', [
        '-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass',
        '-EncodedCommand', encoded
      ], {
        stdio: ['ignore', 'pipe', 'ignore'],
        windowsHide: true
      });
    } catch {
      this.child = null;
      return;
    }

    this.child.stdout?.setEncoding('utf-8');
    this.child.stdout?.on('data', (chunk: string) => {
      this.buffer += chunk;
      let idx: number;
      while ((idx = this.buffer.indexOf('\n')) !== -1) {
        const line = this.buffer.slice(0, idx).trim();
        this.buffer = this.buffer.slice(idx + 1);
        if (line) this.handleLine(line);
      }
    });

    this.child.on('error', () => { this.child = null; });
    this.child.on('exit', () => { this.child = null; });

    // Ensure cleanup when the host process exits
    this.exitCleanup = () => this.stop();
    process.once('exit', this.exitCleanup);
  }

  /** Stop polling and kill the PowerShell process. */
  stop(): void {
    if (this.exitCleanup) {
      process.removeListener('exit', this.exitCleanup);
      this.exitCleanup = null;
    }
    if (this.child) {
      try { this.child.kill(); } catch { /* ignore */ }
      this.child = null;
    }
    this.buffer = '';
    this.lastSongId = null;
    this.cb = null;
  }

  get running(): boolean {
    return this.child !== null;
  }

  private handleLine(line: string): void {
    let data: Record<string, unknown>;
    try { data = JSON.parse(line); } catch { return; }

    const status = data.status;
    if (status === 'ready' || status === 'init_error' || status === 'error') return;

    if (status === 'no_session') {
      if (this.lastSongId !== '') {
        this.lastSongId = '';
        this.cb?.('', null);
      }
      return;
    }

    if (status === 'ok') {
      const title = String(data.title || '').trim();
      const artist = String(data.artist || '').trim();
      const songId = artist ? `${title} - ${artist}` : title;

      if (songId !== this.lastSongId) {
        this.lastSongId = songId;
        if (songId) {
          this.cb?.(songId, {
            title,
            artist,
            albumTitle: String(data.albumTitle || '').trim(),
            playbackStatus: String(data.playbackStatus || '').trim(),
            sourceAppId: String(data.sourceAppId || '').trim(),
          });
        } else {
          this.cb?.('', null);
        }
      }
    }
  }
}
