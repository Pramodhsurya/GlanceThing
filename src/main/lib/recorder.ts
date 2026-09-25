import { ChildProcess, execSync, spawn } from 'child_process'
import { app, shell } from 'electron'
import os from 'os'
import path from 'path'
import fs from 'fs'

import { adbCommand } from './adb.js'
import { execAsync, log, LogLevel } from './utils.js'

const SAMPLE_RATE = 16000
const CHANNELS = 2
const MAX_SECONDS = 15 * 60
const FILE_RE = /^recording-[\w-]+\.wav$/
const REMOTE_RAW = '/tmp/gt-recording.raw'

// The stock `superbird` service keeps the microphone open, so it is paused
// for the length of a recording.
const PAUSE_MIC_OWNER = 'supervisorctl stop superbird'
const RESUME_MIC_OWNER = 'pkill arecord; supervisorctl start superbird'

export interface RecordingInfo {
  name: string
  createdAt: number
  durationMs: number
}

type Listener = (event: RecorderEvent) => void

export type RecorderEvent =
  | { kind: 'state'; recording: boolean; startedAt: number | null }
  | { kind: 'level'; level: number; elapsedMs: number }
  | { kind: 'saved'; recording: RecordingInfo | null }
  | { kind: 'error'; message: string }

let proc: ChildProcess | null = null
let prefix: string | null = null
let startedAt: number | null = null
let stopping = false
let quitHookInstalled = false
let levelTimer: ReturnType<typeof setInterval> | null = null
const listeners = new Set<Listener>()

export function recordingsDir() {
  const dir = path.join(app.getPath('userData'), 'recordings')
  fs.mkdirSync(dir, { recursive: true })
  return dir
}

export function onRecorderEvent(listener: Listener) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

function emit(event: RecorderEvent) {
  listeners.forEach(l => l(event))
}

export function recorderState() {
  return { recording: proc !== null, startedAt }
}

function installQuitHook() {
  if (quitHookInstalled) return
  quitHookInstalled = true
  app.on('before-quit', () => {
    if (!proc || !prefix) return
    proc.kill()
    try {
      execSync(`${prefix} shell "${RESUME_MIC_OWNER}"`, { timeout: 5000 })
    } catch {
      // device may already be gone
    }
  })
}

function peakLevel(chunk: Buffer) {
  let peak = 0
  for (let i = 0; i + 1 < chunk.length; i += 8) {
    const v = Math.abs(chunk.readInt16LE(i))
    if (v > peak) peak = v
  }
  return peak / 32768
}

function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function spawnArecord(adb: string) {
  // Write to a file on the device. `adb exec-out` always returns
  // "error: closed" on the Car Thing, even for `echo`, so we cannot stream
  // PCM over that channel.
  const command = `${adb} shell "rm -f ${REMOTE_RAW}; arecord -q -D hw:0,0 -f S16_LE -r ${SAMPLE_RATE} -c ${CHANNELS} -t raw -d ${MAX_SECONDS} ${REMOTE_RAW}"`
  return spawn(process.platform === 'win32' ? command : `exec ${command}`, {
    shell: true
  })
}

async function remoteBytes(adb: string) {
  const out = await execAsync(
    `${adb} shell "if test -f ${REMOTE_RAW}; then wc -c < ${REMOTE_RAW}; else echo 0; fi"`,
    3000
  )
  return parseInt(out.replace(/\r/g, '').trim(), 10) || 0
}

async function pullRecording(adb: string) {
  const dest = path.join(os.tmpdir(), `gt-recording-${process.pid}.raw`)
  try {
    await execAsync(`${adb} pull ${REMOTE_RAW} "${dest}"`, 20000)
    return fs.existsSync(dest) ? fs.readFileSync(dest) : Buffer.alloc(0)
  } finally {
    fs.rmSync(dest, { force: true })
    await execAsync(`${adb} shell "rm -f ${REMOTE_RAW}"`, 3000).catch(
      () => undefined
    )
  }
}

function stopLevelTimer() {
  if (!levelTimer) return
  clearInterval(levelTimer)
  levelTimer = null
}

function startLevelTimer(adb: string) {
  stopLevelTimer()
  levelTimer = setInterval(() => {
    void (async () => {
      if (!startedAt) return
      try {
        const b64 = await execAsync(
          `${adb} shell "tail -c 2048 ${REMOTE_RAW} | base64"`,
          2000
        )
        const chunk = Buffer.from(b64.replace(/\s/g, ''), 'base64')
        if (chunk.length < 2) return
        emit({
          kind: 'level',
          level: peakLevel(chunk),
          elapsedMs: Date.now() - startedAt
        })
      } catch {
        // ignore a missed poll
      }
    })()
  }, 150)
}

async function releaseMicrophone(adb: string) {
  await execAsync(`${adb} shell "${PAUSE_MIC_OWNER}"`, 10000)
  // superbird can keep hw:0,0 busy for a moment after the stop returns.
  for (let attempt = 0; attempt < 12; attempt++) {
    await sleep(attempt === 0 ? 400 : 250)
    try {
      await execAsync(
        `${adb} shell "arecord -q -D hw:0,0 -f S16_LE -r ${SAMPLE_RATE} -c ${CHANNELS} -t raw -d 1 /dev/null"`,
        4000
      )
      return
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (!/busy|Device or resource/i.test(message) && attempt > 2) {
        throw new Error(message.trim() || 'Could not open the Car Thing microphone.')
      }
    }
  }
  throw new Error(
    'Microphone is still busy. The original Car Thing app may still be holding it.'
  )
}

export async function startRecording() {
  if (proc) return
  installQuitHook()

  prefix = await adbCommand(null)
  await releaseMicrophone(prefix)

  stopping = false
  startedAt = Date.now()

  let stderr = ''
  const child = spawnArecord(prefix)
  child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))

  let ready = false
  for (let attempt = 0; attempt < 20; attempt++) {
    await sleep(200)
    if (child.exitCode !== null) break
    if ((await remoteBytes(prefix).catch(() => 0)) > 0) {
      ready = true
      break
    }
  }

  if (!ready) {
    child.kill()
    await execAsync(`${prefix} shell "${RESUME_MIC_OWNER}"`, 10000).catch(
      () => undefined
    )
    throw new Error(
      stderr.trim() || 'Could not open the Car Thing microphone.'
    )
  }

  proc = child
  startLevelTimer(prefix)
  child.on('exit', () => {
    if (proc !== child) return
    if (!stopping) {
      log(
        `Recording ended unexpectedly: ${stderr.trim()}`,
        'Recorder',
        LogLevel.WARN
      )
      void finish(stderr.trim() || 'Recording stopped unexpectedly')
    }
  })

  log('Recording started', 'Recorder')
  emit({ kind: 'state', recording: true, startedAt })
}

export async function stopRecording() {
  if (!proc || stopping) return
  stopping = true
  if (prefix)
    await execAsync(`${prefix} shell "pkill arecord"`, 5000).catch(
      () => undefined
    )
  proc.kill()
  await finish(null)
}

async function finish(error: string | null) {
  stopLevelTimer()
  const adb = prefix
  proc = null
  startedAt = null

  let pcm = Buffer.alloc(0)
  if (adb) {
    pcm = await pullRecording(adb).catch(() => Buffer.alloc(0))
    await execAsync(`${adb} shell "${RESUME_MIC_OWNER}"`, 10000).catch(err =>
      log(`Failed to resume superbird: ${err}`, 'Recorder', LogLevel.WARN)
    )
  }

  emit({ kind: 'state', recording: false, startedAt: null })
  if (error) emit({ kind: 'error', message: error })

  const saved = pcm.length >= SAMPLE_RATE * CHANNELS * 2 * 0.5 ? save(pcm) : null
  if (saved) log(`Saved ${saved.name}`, 'Recorder')
  emit({ kind: 'saved', recording: saved })
}

function save(stereo: Buffer): RecordingInfo {
  const frames = Math.floor(stereo.length / (CHANNELS * 2))
  const mono = new Int16Array(frames)
  let peak = 1
  for (let i = 0; i < frames; i++) {
    const l = stereo.readInt16LE(i * 4)
    const r = stereo.readInt16LE(i * 4 + 2)
    const v = (l + r) >> 1
    mono[i] = v
    if (Math.abs(v) > peak) peak = Math.abs(v)
  }

  const gain = Math.min(24, 29000 / peak)
  const data = Buffer.alloc(frames * 2)
  for (let i = 0; i < frames; i++) {
    const v = Math.max(-32768, Math.min(32767, Math.round(mono[i] * gain)))
    data.writeInt16LE(v, i * 2)
  }

  const stamp = new Date()
    .toISOString()
    .replace(/\..+$/, '')
    .replace(/[:T]/g, '-')
  const name = `recording-${stamp}.wav`
  fs.writeFileSync(path.join(recordingsDir(), name), Buffer.concat([wavHeader(data.length), data]))

  return { name, createdAt: Date.now(), durationMs: (frames / SAMPLE_RATE) * 1000 }
}

function wavHeader(dataLength: number) {
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataLength, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16)
  header.writeUInt16LE(1, 20)
  header.writeUInt16LE(1, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * 2, 28)
  header.writeUInt16LE(2, 32)
  header.writeUInt16LE(16, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataLength, 40)
  return header
}

export function listRecordings(): RecordingInfo[] {
  const dir = recordingsDir()
  return fs
    .readdirSync(dir)
    .filter(name => FILE_RE.test(name))
    .map(name => {
      const stat = fs.statSync(path.join(dir, name))
      return {
        name,
        createdAt: stat.mtimeMs,
        durationMs: (Math.max(0, stat.size - 44) / 2 / SAMPLE_RATE) * 1000
      }
    })
    .sort((a, b) => b.createdAt - a.createdAt)
}

function resolveRecording(name: string) {
  if (!FILE_RE.test(name)) return null
  const file = path.join(recordingsDir(), name)
  return fs.existsSync(file) ? file : null
}

export function deleteRecording(name: string) {
  const file = resolveRecording(name)
  if (file) fs.unlinkSync(file)
}

export async function playRecording(name: string) {
  const file = resolveRecording(name)
  if (file) await shell.openPath(file)
}

export function revealRecordings() {
  shell.openPath(recordingsDir())
}
