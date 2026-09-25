import axios, { AxiosInstance } from 'axios'

import { BasePlaybackHandler } from './BasePlaybackHandler.js'
import { log, LogLevel } from '../utils.js'
import { getStorageValue, setStorageValue } from '../storage.js'

import { PlaybackData, RepeatMode } from '../../types/Playback.js'

const DEFAULT_PORT = 26538
const CLIENT_ID = 'glancething'
const POLL_MS = 1000
const STATE_POLL_EVERY = 3

interface SongInfo {
  title: string
  artist: string
  album?: string | null
  imageSrc?: string | null
  isPaused?: boolean
  songDuration: number
  elapsedSeconds?: number
  videoId: string
}

const REPEAT_FROM_YTM: Record<string, RepeatMode> = {
  NONE: 'off',
  ALL: 'on',
  ONE: 'one'
}

const REPEAT_ORDER: RepeatMode[] = ['off', 'on', 'one']

function getPort() {
  const port = Number(getStorageValue('youtubeMusicPort'))
  return port > 0 ? port : DEFAULT_PORT
}

function baseUrl() {
  return `http://127.0.0.1:${getPort()}`
}

class YouTubeMusicHandler extends BasePlaybackHandler {
  name: string = 'youtubemusic'
  requiresInternet: boolean = false

  private api: AxiosInstance | null = null
  private timer: NodeJS.Timeout | null = null
  private ticks = 0
  private current: PlaybackData = null
  private song: SongInfo | null = null
  private volume = 100
  private shuffleOn = false
  private repeatMode: RepeatMode = 'off'
  private lastJson = ''
  private image: Buffer | null = null
  private imageVideoId: string | null = null
  private authorizing = false
  private warned = false

  async setup(): Promise<void> {
    log('Setting up', 'YouTube Music')
    this.makeClient(getStorageValue('youtubeMusicToken', true) as string)
    await this.poll()
    this.timer = setInterval(() => this.poll(), POLL_MS)
  }

  async cleanup(): Promise<void> {
    log('Cleaning up', 'YouTube Music')
    if (this.timer) clearInterval(this.timer)
    this.timer = null
    this.api = null
    this.current = null
    this.lastJson = ''
    this.removeAllListeners()
  }

  async validateConfig(): Promise<boolean> {
    try {
      await axios.get(`${baseUrl()}/api/v1/song`, {
        timeout: 800,
        validateStatus: () => true
      })
      return true
    } catch {
      return false
    }
  }

  private makeClient(token: string | null) {
    this.api = axios.create({
      baseURL: `${baseUrl()}/api/v1`,
      timeout: 3000,
      headers: token ? { Authorization: `Bearer ${token}` } : {}
    })
  }

  private async authorize() {
    if (this.authorizing) return
    this.authorizing = true
    try {
      log('Requesting access from YouTube Music', 'YouTube Music')
      const res = await axios.post(
        `${baseUrl()}/auth/${CLIENT_ID}`,
        null,
        { timeout: 120_000, validateStatus: () => true }
      )
      if (res.status === 200 && res.data?.accessToken) {
        setStorageValue('youtubeMusicToken', res.data.accessToken, true)
        this.makeClient(res.data.accessToken)
        log('YouTube Music allowed GlanceThing', 'YouTube Music')
      } else {
        log(
          `YouTube Music denied access (${res.status})`,
          'YouTube Music',
          LogLevel.WARN
        )
      }
    } catch (err) {
      log(
        `Authorization failed: ${(err as Error).message}`,
        'YouTube Music',
        LogLevel.WARN
      )
    } finally {
      this.authorizing = false
    }
  }

  private async request<T>(
    method: 'get' | 'post',
    url: string,
    data?: unknown
  ): Promise<{ status: number; data: T } | null> {
    if (!this.api) return null
    const res = await this.api.request<T>({
      method,
      url,
      data,
      validateStatus: () => true
    })
    if (res.status === 401 || res.status === 403) {
      this.authorize()
      return null
    }
    return { status: res.status, data: res.data }
  }

  private async poll() {
    try {
      const res = await this.request<SongInfo>('get', '/song')
      if (!res) return
      this.song = res.status === 200 && res.data?.title ? res.data : null

      if (this.song && this.ticks % STATE_POLL_EVERY === 0) {
        const [volume, shuffle, repeat] = await Promise.all([
          this.request<{ state: number }>('get', '/volume'),
          this.request<{ state: boolean | null }>('get', '/shuffle'),
          this.request<{ mode: string | null }>('get', '/repeat-mode')
        ])
        if (volume?.status === 200) this.volume = volume.data.state
        if (shuffle?.status === 200)
          this.shuffleOn = shuffle.data.state === true
        if (repeat?.status === 200)
          this.repeatMode = REPEAT_FROM_YTM[repeat.data.mode ?? ''] ?? 'off'
      }
      this.ticks++
      this.warned = false
    } catch (err) {
      if (!this.warned) {
        log(
          `YouTube Music is not reachable: ${(err as Error).message}`,
          'YouTube Music',
          LogLevel.WARN
        )
        this.warned = true
      }
      this.song = null
    }

    this.current = this.toPlayback()
    const json = JSON.stringify(this.current)
    if (json !== this.lastJson) {
      this.lastJson = json
      this.emit('playback', this.current)
    }
  }

  private toPlayback(): PlaybackData {
    const song = this.song
    if (!song) return null
    return {
      isPlaying: !song.isPaused,
      volume: Math.round(this.volume),
      shuffle: this.shuffleOn,
      repeat: this.repeatMode,
      track: {
        name: song.title,
        artists: song.artist ? [song.artist] : [],
        album: song.album ?? '',
        duration: {
          current: Math.round((song.elapsedSeconds ?? 0) * 1000),
          total: Math.round(song.songDuration * 1000)
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
        ...(song.imageSrc ? (['image'] as const) : [])
      ]
    }
  }

  private async command(url: string, data?: unknown) {
    await this.request('post', url, data)
    await this.poll()
  }

  async getPlayback(): Promise<PlaybackData> {
    return this.current
  }

  async play(): Promise<void> {
    await this.command('/play')
  }

  async pause(): Promise<void> {
    await this.command('/pause')
  }

  async setVolume(volume: number): Promise<void> {
    this.volume = volume
    await this.command('/volume', { volume: Math.round(volume) })
  }

  async next(): Promise<void> {
    await this.command('/next')
  }

  async previous(): Promise<void> {
    await this.command('/previous')
  }

  async seek(positionMs: number): Promise<void> {
    await this.command('/seek-to', {
      seconds: Math.max(0, Math.round(positionMs / 1000))
    })
  }

  async shuffle(state: boolean): Promise<void> {
    if (state === this.shuffleOn) return
    this.shuffleOn = state
    await this.command('/shuffle')
  }

  async repeat(state: RepeatMode): Promise<void> {
    const from = REPEAT_ORDER.indexOf(this.repeatMode)
    const to = REPEAT_ORDER.indexOf(state)
    const iteration = (to - from + REPEAT_ORDER.length) % REPEAT_ORDER.length
    if (!iteration) return
    this.repeatMode = state
    await this.command('/switch-repeat', { iteration })
  }

  async getImage(): Promise<Buffer | null> {
    const song = this.song
    if (!song?.imageSrc) return null
    if (this.imageVideoId === song.videoId) return this.image
    try {
      const res = await axios.get(song.imageSrc, {
        responseType: 'arraybuffer',
        timeout: 5000
      })
      this.image = Buffer.from(res.data)
    } catch {
      this.image = null
    }
    this.imageVideoId = song.videoId
    return this.image
  }
}

export default new YouTubeMusicHandler()
