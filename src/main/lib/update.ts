import { app, BrowserWindow } from 'electron'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'
import axios from 'axios'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { getStorageValue } from './storage.js'
import { log, LogLevel } from './utils.js'

export const GITHUB_REPO = 'Pramodhsurya/GlanceThing'

const execFileAsync = promisify(execFile)

interface ReleaseAsset {
  name: string
  browser_download_url: string
}

export interface UpdateStatus {
  state: 'idle' | 'downloading' | 'installing' | 'restarting' | 'error'
  version?: string
  progress?: number
  error?: string
}

let status: UpdateStatus = { state: 'idle' }
let running = false

function setStatus(next: UpdateStatus) {
  status = next
  BrowserWindow.getAllWindows().forEach(w =>
    w.webContents.send('updateStatus', status)
  )
}

export function getUpdateStatus() {
  return status
}

export function isAutoUpdateEnabled() {
  return getStorageValue('autoUpdate') !== false
}

function parseVersion(v: string) {
  return v
    .replace(/^v/, '')
    .split('-')[0]
    .split('.')
    .map(n => parseInt(n, 10) || 0)
}

export function isNewerVersion(latest: string, current: string) {
  const a = parseVersion(latest)
  const b = parseVersion(current)
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const diff = (a[i] ?? 0) - (b[i] ?? 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

export async function getLatestVersion() {
  const res = await axios.get(
    `https://api.github.com/repos/${GITHUB_REPO}/releases/latest`,
    {
      validateStatus: () => true
    }
  )

  if (res.status !== 200) return null

  return {
    version: res.data.tag_name as string,
    downloadUrl: res.data.html_url as string,
    assets: (res.data.assets ?? []) as ReleaseAsset[]
  }
}

export async function checkForUpdate() {
  const latest = await getLatestVersion()
  if (!latest) return null
  const currentVersion = 'v' + app.getVersion()
  return {
    currentVersion,
    latestVersion: latest.version,
    downloadUrl: latest.downloadUrl,
    updateAvailable: isNewerVersion(latest.version, currentVersion),
    canInstall: !!pickAsset(latest.assets) && app.isPackaged,
    assets: latest.assets
  }
}

function pickAsset(assets: ReleaseAsset[]) {
  const ext =
    process.platform === 'darwin'
      ? '.dmg'
      : process.platform === 'win32'
        ? '-setup.exe'
        : '.AppImage'
  if (process.platform === 'linux' && !process.env.APPIMAGE) return null
  return assets.find(a => a.name.endsWith(ext)) ?? null
}

async function download(url: string, dest: string, version: string) {
  const res = await axios.get(url, { responseType: 'stream' })
  const total = Number(res.headers['content-length']) || 0
  let received = 0
  let lastSent = 0
  await new Promise<void>((resolve, reject) => {
    const out = fs.createWriteStream(dest)
    res.data.on('data', (chunk: Buffer) => {
      received += chunk.length
      const progress = total ? received / total : 0
      if (progress - lastSent >= 0.02) {
        lastSent = progress
        setStatus({ state: 'downloading', version, progress })
      }
    })
    res.data.on('error', reject)
    out.on('error', reject)
    out.on('finish', () => resolve())
    res.data.pipe(out)
  })
}

function runAfterExit(script: string) {
  const file = path.join(
    os.tmpdir(),
    `glancething-update-${Date.now()}.sh`
  )
  fs.writeFileSync(
    file,
    `#!/bin/sh\nwhile kill -0 ${process.pid} 2>/dev/null; do sleep 0.5; done\n${script}\nrm -f "$0"\n`,
    { mode: 0o755 }
  )
  spawn('/bin/sh', [file], { detached: true, stdio: 'ignore' }).unref()
}

async function installMac(dmg: string) {
  const bundle = path.resolve(app.getPath('exe'), '../../..')
  if (!bundle.endsWith('.app'))
    throw new Error(`Unexpected app location: ${bundle}`)

  const mount = fs.mkdtempSync(path.join(os.tmpdir(), 'glancething-mnt-'))
  const staged = `${bundle}.update`
  await execFileAsync('hdiutil', [
    'attach',
    '-nobrowse',
    '-noautoopen',
    '-mountpoint',
    mount,
    dmg
  ])
  try {
    const appName = fs.readdirSync(mount).find(f => f.endsWith('.app'))
    if (!appName) throw new Error('No app found in the update')
    fs.rmSync(staged, { recursive: true, force: true })
    await execFileAsync('ditto', [path.join(mount, appName), staged])
  } finally {
    await execFileAsync('hdiutil', ['detach', mount, '-force']).catch(
      () => {}
    )
  }
  await execFileAsync('xattr', ['-cr', staged]).catch(() => {})

  runAfterExit(
    `rm -rf "${bundle}" && mv "${staged}" "${bundle}" && open "${bundle}"`
  )
}

function installWindows(installer: string) {
  spawn(installer, ['/S', '--force-run'], {
    detached: true,
    stdio: 'ignore'
  }).unref()
}

async function installLinux(file: string) {
  const target = process.env.APPIMAGE!
  fs.chmodSync(file, 0o755)
  runAfterExit(`mv "${file}" "${target}" && "${target}" &`)
}

export async function installUpdate() {
  if (running) return
  running = true
  try {
    const info = await checkForUpdate()
    if (!info || !info.updateAvailable) return
    if (!app.isPackaged)
      throw new Error('Updates only install in built apps')
    const asset = pickAsset(info.assets)
    if (!asset) throw new Error('No update file for this platform')

    log(`Downloading ${info.latestVersion}`, 'Update')
    setStatus({
      state: 'downloading',
      version: info.latestVersion,
      progress: 0
    })
    const dest = path.join(os.tmpdir(), asset.name)
    await download(asset.browser_download_url, dest, info.latestVersion)

    setStatus({ state: 'installing', version: info.latestVersion })
    if (process.platform === 'darwin') await installMac(dest)
    else if (process.platform === 'win32') installWindows(dest)
    else await installLinux(dest)

    log(`Restarting into ${info.latestVersion}`, 'Update')
    setStatus({ state: 'restarting', version: info.latestVersion })
    setTimeout(() => app.exit(0), 800)
  } catch (err) {
    const message = (err as Error).message
    log(`Update failed: ${message}`, 'Update', LogLevel.ERROR)
    setStatus({ state: 'error', error: message })
  } finally {
    running = false
  }
}

export function startAutoUpdater() {
  const tick = () => {
    if (isAutoUpdateEnabled()) installUpdate()
  }
  setTimeout(tick, 15 * 1000)
  setInterval(tick, 60 * 60 * 1000)
}
