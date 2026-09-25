import { execFile } from 'child_process'
import { promisify } from 'util'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { BasePlaybackHandler } from './BasePlaybackHandler.js'
import { log, LogLevel } from '../utils.js'

import { PlaybackData, RepeatMode } from '../../types/Playback.js'

const execFileAsync = promisify(execFile)

const SEP = '\u001f'
const POLL_MS = 1000

const STATUS_SCRIPT = `
if application "Music" is not running then return "closed"
tell application "Music"
  set playerStatus to player state as string
  if playerStatus is "stopped" then return "stopped"
  set trk to current track
  set delim to (ASCII character 31)
  return playerStatus & delim & (name of trk) & delim & (artist of trk) & delim & (album of trk) & delim & (duration of trk as string) & delim & (player position as string) & delim & (sound volume as string) & delim & (shuffle enabled as string) & delim & (song repeat as string) & delim & (persistent ID of trk)
end tell`

const REPEAT_FROM_MUSIC: Record<string, RepeatMode> = {
  off: 'off',
  all: 'on',
  one: 'one'
}

const REPEAT_TO_MUSIC: Record<RepeatMode, string> = {
  off: 'off',
  on: 'all',
  one: 'one'
}

function toNumber(value: string) {
  return parseFloat(value.replace(',', '.')) || 0
}

async function osascript(script: string) {
  const { stdout } = await execFileAsync('osascript', ['-e', script], {
    timeout: 5000
  })
  return stdout.trim()
}

async function tell(command: string) {
  await osascript(
    `if application "Music" is running then tell application "Music" to ${command}`
  )
}

class AppleMusicHandler extends BasePlaybackHandler {
  name: string = 'applemusic'
  requiresInternet: boolean = false

  private timer: NodeJS.Timeout | null = null
  private current: PlaybackData = null
  private trackId: string | null = null
  private image: Buffer | null = null
  private imageTrackId: string | null = null
  private lastJson = ''
  private warned = false

  async setup(): Promise<void> {
    log('Setting up', 'Apple Music')
    await this.poll()
    this.timer = setInterval(() => this.poll(), POLL_MS)
  }

  async cleanup(): Promise<void> {
    log('Cleaning up', 'Apple Music')
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.current = null
    this.lastJson = ''
    this.removeAllListeners()
  }

  async validateConfig(): Promise<boolean> {
    return (
      process.platform === 'darwin' &&
      fs.existsSync('/System/Applications/Music.app')
    )
  }

  private async poll() {
    let out: string
    try {
      out = await osascript(STATUS_SCRIPT)
      this.warned = false
    } catch (err) {
      if (!this.warned) {
        log(
          `Could not read Music: ${(err as Error).message}`,
          'Apple Music',
          LogLevel.WARN
        )
        this.warned = true
      }
      return
    }

    let data: PlaybackData = null
    if (out !== 'closed' && out !== 'stopped') {
      const [
        state,
        name,
        artist,
        album,
        duration,
        position,
        volume,
        shuffle,
        repeat,
        id
      ] = out.split(SEP)
      this.trackId = id ?? null
      data = {
        isPlaying: state === 'playing',
        volume: Math.round(toNumber(volume)),
        shuffle: shuffle === 'true',
        repeat: REPEAT_FROM_MUSIC[repeat] ?? 'off',
        track: {
          name,
          artists: artist ? [artist] : [],
          album: album ?? '',
          duration: {
            current: Math.round(toNumber(position) * 1000),
            total: Math.round(toNumber(duration) * 1000)
          }
        },
        supportedActions: [
          'play',
          'pause',
          'next',
          'previous',
          'seek',
          'volume',
          'shuffle',
          'repeat',
          'image'
        ]
      }
    }

    this.current = data
    const json = JSON.stringify(data)
    if (json !== this.lastJson) {
      this.lastJson = json
      this.emit('playback', data)
    }
  }

  async getPlayback(): Promise<PlaybackData> {
    return this.current
  }

  async play(): Promise<void> {
    await tell('play')
    await this.poll()
  }

  async pause(): Promise<void> {
    await tell('pause')
    await this.poll()
  }

  async setVolume(volume: number): Promise<void> {
    await tell(`set sound volume to ${Math.round(volume)}`)
    await this.poll()
  }

  async next(): Promise<void> {
    await tell('next track')
    await this.poll()
  }

  async previous(): Promise<void> {
    await tell('previous track')
    await this.poll()
  }

  async seek(positionMs: number): Promise<void> {
    const seconds = Math.max(0, positionMs / 1000).toFixed(2)
    await tell(`set player position to ${seconds}`)
    await this.poll()
  }

  async shuffle(state: boolean): Promise<void> {
    await tell(`set shuffle enabled to ${state}`)
    await this.poll()
  }

  async repeat(state: RepeatMode): Promise<void> {
    await tell(`set song repeat to ${REPEAT_TO_MUSIC[state]}`)
    await this.poll()
  }

  async getImage(): Promise<Buffer | null> {
    if (!this.trackId) return null
    if (this.imageTrackId === this.trackId) return this.image

    const file = path.join(os.tmpdir(), 'glancething-applemusic-art')
    try {
      await osascript(`
if application "Music" is not running then return
tell application "Music"
  if (count of artworks of current track) is 0 then return
  set d to raw data of artwork 1 of current track
end tell
set f to open for access (POSIX file "${file}") with write permission
set eof f to 0
write d to f
close access f`)
      this.image = fs.existsSync(file) ? fs.readFileSync(file) : null
      fs.rmSync(file, { force: true })
    } catch {
      this.image = null
    }
    this.imageTrackId = this.trackId
    return this.image
  }
}

export default new AppleMusicHandler()
