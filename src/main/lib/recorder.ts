import { ChildProcess, execSync, spawn } from 'child_process'
import { app, shell } from 'electron'
import path from 'path'
import fs from 'fs'

import { adbCommand } from './adb.js'
import { execAsync, log, LogLevel } from './utils.js'

const SAMPLE_RATE = 16000
const CHANNELS = 2
const MAX_SECONDS = 15 * 60
const FILE_RE = /^recording-[\w-]+\.wav$/

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
let chunks: Buffer[] = []
let startedAt: number | null = null
let lastLevelAt = 0
let stopping = false
let quitHookInstalled = false
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

export async function startRecording() {
  if (proc) return
  installQuitHook()

  prefix = await adbCommand(null)
  await execAsync(`${prefix} shell "${PAUSE_MIC_OWNER}"`, 10000)

  const command = `${prefix} exec-out "arecord -q -D hw:0,0 -f S16_LE -r ${SAMPLE_RATE} -c ${CHANNELS} -t raw -d ${MAX_SECONDS}"`
  const child = spawn(
    process.platform === 'win32' ? command : `exec ${command}`,
    { shell: true }
  )

  chunks = []
  stopping = false
  startedAt = Date.now()
  proc = child
  let stderr = ''

  child.stdout?.on('data', (chunk: Buffer) => {
    chunks.push(chunk)
    const now = Date.now()
    if (now - lastLevelAt < 100) return
    lastLevelAt = now
    emit({ kind: 'level', level: peakLevel(chunk), elapsedMs: now - startedAt! })
  })
  child.stderr?.on('data', (d: Buffer) => (stderr += d.toString()))
  child.on('exit', () => {
    if (proc !== child) return
    if (!stopping) {
      log(`Recording ended unexpectedly: ${stderr.trim()}`, 'Recorder', LogLevel.WARN)
      void finish(stderr.trim() || 'Recording stopped unexpectedly')
    }
  })

  log('Recording started', 'Recorder')
  emit({ kind: 'state', recording: true, startedAt })
}

export async function stopRecording() {
  if (!proc || stopping) return
  stopping = true
  proc.kill()
  await finish(null)
}

async function finish(error: string | null) {
  const pcm = Buffer.concat(chunks)
  chunks = []
  proc = null
  startedAt = null

  if (prefix)
    await execAsync(`${prefix} shell "${RESUME_MIC_OWNER}"`, 10000).catch(err =>
      log(`Failed to resume superbird: ${err}`, 'Recorder', LogLevel.WARN)
    )

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
