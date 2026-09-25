import { ChildProcess, execFile, spawn } from 'child_process'
import { promisify } from 'util'
import { app } from 'electron'
import readline from 'readline'
import path from 'path'
import fs from 'fs'

import { BasePlaybackHandler } from './BasePlaybackHandler.js'
import { log, LogLevel } from '../utils.js'

import { PlaybackData, RepeatMode } from '../../types/Playback.js'

const execFileAsync = promisify(execFile)

const PERL = '/usr/bin/perl'
const VOLUME_POLL_MS = 3000

interface NowPlayingInfo {
  bundleIdentifier?: string
  playing?: boolean
  title?: string
  artist?: string | null
  album?: string | null
  duration?: number | null
  elapsedTime?: number | null
  timestamp?: string | null
  playbackRate?: number | null
  shuffleMode?: number | null
  repeatMode?: number | null
  contentItemIdentifier?: string | null
  artworkData?: string | null
}

const REPEAT_FROM_MR: Record<number, RepeatMode> = {
  1: 'off',
  2: 'one',
  3: 'on'
}
const REPEAT_TO_MR: Record<RepeatMode, number> = { off: 1, one: 2, on: 3 }

function adapterDir() {
  return path.join(
    process.env.NODE_ENV === 'development'
      ? app.getAppPath()
      : path.join(process.resourcesPath, 'app.asar.unpacked'),
    'resources',
    'common',
    'mediaremote'
  )
}

function adapterArgs(...args: string[]) {
  const dir = adapterDir()
  return [
    path.join(dir, 'mediaremote-adapter.pl'),
    path.join(dir, 'MediaRemoteAdapter.framework'),
    ...args
  ]
}

async function runAdapter(...args: string[]) {
  const { stdout } = await execFileAsync(PERL, adapterArgs(...args), {
    timeout: 5000,
    maxBuffer: 20 * 1024 * 1024
  })
  return stdout
}

class MacNowPlayingHandler extends BasePlaybackHandler {
  name: string = 'native'
  requiresInternet: boolean = false

  private proc: ChildProcess | null = null
  private info: NowPlayingInfo | null = null
  private receivedAt = 0
  private volume = 50
  private volumeTimer: NodeJS.Timeout | null = null
  private active = false
  private image: Buffer | null = null
  private imageKey: string | null = null

  async setup(): Promise<void> {
    log('Setting up (MediaRemote adapter)', 'Native')
    this.active = true
    this.startStream()
    await this.readVolume()
    this.volumeTimer = setInterval(async () => {
      const before = this.volume
      await this.readVolume()
      if (before !== this.volume && this.info) this.emitPlayback()
    }, VOLUME_POLL_MS)
  }

  async cleanup(): Promise<void> {
    log('Cleaning up', 'Native')
    this.active = false
    if (this.volumeTimer) clearInterval(this.volumeTimer)
    this.volumeTimer = null
    this.proc?.kill('SIGTERM')
    this.proc = null
    this.info = null
    this.removeAllListeners()
  }

  async validateConfig(): Promise<boolean> {
    return fs.existsSync(path.join(adapterDir(), 'mediaremote-adapter.pl'))
  }

  private startStream() {
    const proc = spawn(
      PERL,
      adapterArgs('stream', '--no-diff', '--no-artwork', '--debounce=150'),
      { stdio: ['ignore', 'pipe', 'pipe'] }
    )
    this.proc = proc

    readline.createInterface({ input: proc.stdout! }).on('line', line => {
      try {
        const message = JSON.parse(line)
        if (message.type !== 'data') return
        const payload = message.payload as NowPlayingInfo
        this.info = payload && payload.title ? payload : null
        this.receivedAt = Date.now()
        this.emitPlayback()
      } catch {
        // ignore partial lines
      }
    })

    proc.stderr!.on('data', (chunk: Buffer) =>
      log(chunk.toString().trim(), 'Native', LogLevel.DEBUG)
    )

    proc.on('exit', code => {
      if (this.proc !== proc) return
      this.proc = null
      if (!this.active) return
      log(
        `MediaRemote adapter exited (${code}), restarting`,
        'Native',
        LogLevel.WARN
      )
      setTimeout(() => {
        if (this.active && !this.proc) this.startStream()
      }, 2000)
    })
  }

  private async readVolume() {
    try {
      const { stdout } = await execFileAsync(
        'osascript',
        ['-e', 'output volume of (get volume settings)'],
        { timeout: 3000 }
      )
      const value = parseInt(stdout.trim(), 10)
      if (!isNaN(value)) this.volume = value
    } catch {
      // volume stays at the last known value
    }
  }

  private emitPlayback() {
    this.emit('playback', this.toPlayback())
  }

  private toPlayback(): PlaybackData {
    const info = this.info
    if (!info || !info.title) return null

    const playing = !!info.playing
    const elapsed = info.elapsedTime ?? 0
    const capturedAt = info.timestamp
      ? Date.parse(info.timestamp)
      : this.receivedAt
    const rate = info.playbackRate || 1
    const drift = playing ? ((Date.now() - capturedAt) / 1000) * rate : 0
    const duration = info.duration ?? 0
    const current = Math.min(
      duration || Infinity,
      Math.max(0, elapsed + drift)
    )

    const data: PlaybackData = {
      isPlaying: playing,
      volume: this.volume,
      shuffle: (info.shuffleMode ?? 1) > 1,
      repeat: REPEAT_FROM_MR[info.repeatMode ?? 1] ?? 'off',
      track: {
        name: info.title,
        artists: info.artist ? [info.artist] : [],
        album: info.album ?? '',
        duration: {
          current: Math.round(current * 1000),
          total: Math.round(duration * 1000)
        }
      },
      supportedActions: [
        'play',
        'pause',
        'next',
        'previous',
        'volume',
        'image'
      ]
    }
    if (duration) data.supportedActions.push('seek')
    if (info.shuffleMode != null) data.supportedActions.push('shuffle')
    if (info.repeatMode != null) data.supportedActions.push('repeat')
    return data
  }

  private async send(...args: string[]) {
    try {
      await runAdapter(...args)
    } catch (err) {
      log(
        `Command ${args.join(' ')} failed: ${(err as Error).message}`,
        'Native',
        LogLevel.WARN
      )
    }
  }

  async getPlayback(): Promise<PlaybackData> {
    return this.toPlayback()
  }

  async play(): Promise<void> {
    await this.send('send', '0')
  }

  async pause(): Promise<void> {
    await this.send('send', '1')
  }

  async next(): Promise<void> {
    await this.send('send', '4')
  }

  async previous(): Promise<void> {
    await this.send('send', '5')
  }

  async seek(positionMs: number): Promise<void> {
    const micros = Math.max(0, Math.round(positionMs * 1000))
    await this.send('seek', String(micros))
  }

  async shuffle(state: boolean): Promise<void> {
    await this.send('shuffle', state ? '3' : '1')
  }

  async repeat(state: RepeatMode): Promise<void> {
    await this.send('repeat', String(REPEAT_TO_MR[state]))
  }

  async setVolume(volume: number): Promise<void> {
    const value = Math.max(0, Math.min(100, Math.round(volume)))
    await execFileAsync('osascript', [
      '-e',
      `set volume output volume ${value}`
    ]).catch(() => {})
    this.volume = value
    this.emitPlayback()
  }

  async getImage(): Promise<Buffer | null> {
    const info = this.info
    if (!info) return null
    const key =
      info.contentItemIdentifier ?? `${info.title}\u0000${info.artist}`
    if (key === this.imageKey && this.image) return this.image

    try {
      const out = await runAdapter('get')
      const full = JSON.parse(out) as NowPlayingInfo | null
      this.image = full?.artworkData
        ? Buffer.from(full.artworkData, 'base64')
        : null
    } catch {
      this.image = null
    }
    if (this.image) this.imageKey = key
    return this.image
  }
}

export default new MacNowPlayingHandler()
