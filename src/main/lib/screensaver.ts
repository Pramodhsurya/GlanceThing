import { app, dialog } from 'electron'
import path from 'path'
import fs from 'fs'
import crypto from 'crypto'
import { serverManager } from './server.js'
import { AuthenticatedWebSocket } from '../types/WebSocketServer.js'

export const MAX_SCREENSAVER_PHOTOS = 10
const MAX_SIZE_MB = 5
const ALLOWED_EXT = new Set(['.png', '.jpg', '.jpeg', '.webp'])

export type ScreensaverPhoto = {
  id: string
  name: string
}

function albumDir() {
  return path.join(app.getPath('userData'), 'screensaver', 'album')
}

function legacyImagePath() {
  return path.join(app.getPath('userData'), 'screensaver', 'image.png')
}

function ensureAlbumDir() {
  const dir = albumDir()
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
  return dir
}

function migrateLegacy() {
  const legacy = legacyImagePath()
  if (!fs.existsSync(legacy)) return
  const dir = ensureAlbumDir()
  const hasPhotos = fs
    .readdirSync(dir)
    .some(name => ALLOWED_EXT.has(path.extname(name).toLowerCase()))
  if (hasPhotos) {
    fs.unlinkSync(legacy)
    return
  }
  const id = crypto.randomBytes(8).toString('hex')
  fs.renameSync(legacy, path.join(dir, `${id}.png`))
}

function listPhotoFiles(): {
  id: string
  filePath: string
  name: string
}[] {
  migrateLegacy()
  const dir = ensureAlbumDir()
  return fs
    .readdirSync(dir)
    .filter(name => ALLOWED_EXT.has(path.extname(name).toLowerCase()))
    .map(name => {
      const id = path.basename(name, path.extname(name))
      return {
        id,
        filePath: path.join(dir, name),
        name
      }
    })
    .sort((a, b) => {
      const aTime = fs.statSync(a.filePath).mtimeMs
      const bTime = fs.statSync(b.filePath).mtimeMs
      return aTime - bTime
    })
}

export function listScreensaverPhotos(): ScreensaverPhoto[] {
  return listPhotoFiles().map(({ id, name }) => ({ id, name }))
}

export function getScreensaverPhotoPath(id: string): string | null {
  const photo = listPhotoFiles().find(p => p.id === id)
  return photo ? photo.filePath : null
}

export function getScreensaverPhotoDataUrl(id: string): string | null {
  const filePath = getScreensaverPhotoPath(id)
  if (!filePath) return null
  const ext = path.extname(filePath).toLowerCase().replace('.', '')
  const mime =
    ext === 'jpg' || ext === 'jpeg'
      ? 'image/jpeg'
      : ext === 'webp'
        ? 'image/webp'
        : 'image/png'
  const buf = fs.readFileSync(filePath)
  return `data:${mime};base64,${buf.toString('base64')}`
}

export function hasCustomScreensaverImage() {
  return listPhotoFiles().length > 0
}

function broadcast(action: string, data?: unknown) {
  const wss = serverManager.getServer()
  if (!wss) return
  wss.clients.forEach((ws: AuthenticatedWebSocket) => {
    if (!ws.authenticated && ws.readyState !== WebSocket.OPEN) return
    ws.send(
      JSON.stringify({
        type: 'screensaver',
        action,
        ...(data !== undefined ? { data } : {})
      })
    )
  })
}

export function updateScreensaverImage() {
  broadcast('update')
}

export async function uploadScreensaverImage() {
  const current = listPhotoFiles()
  const remaining = MAX_SCREENSAVER_PHOTOS - current.length
  if (remaining <= 0) {
    return {
      success: false,
      error: 'album_full',
      message: `Album is full. Remove a photo first (max ${MAX_SCREENSAVER_PHOTOS}).`
    }
  }

  const res = await dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Image Files', extensions: ['png', 'jpg', 'jpeg', 'webp'] }
    ]
  })

  if (res.canceled || res.filePaths.length === 0) {
    return { success: false }
  }

  const selected = res.filePaths.slice(0, remaining)
  const dir = ensureAlbumDir()
  let added = 0
  let lastError: string | null = null

  for (const imagePath of selected) {
    try {
      const stats = fs.statSync(imagePath)
      if (stats.size / (1024 * 1024) > MAX_SIZE_MB) {
        lastError = `Skipped ${path.basename(imagePath)}: exceeds the 5MB limit.`
        continue
      }
      const ext = path.extname(imagePath).toLowerCase()
      if (!ALLOWED_EXT.has(ext)) {
        lastError = `Skipped ${path.basename(imagePath)}: unsupported format.`
        continue
      }
      const id = crypto.randomBytes(8).toString('hex')
      fs.copyFileSync(imagePath, path.join(dir, `${id}${ext}`))
      added++
    } catch {
      lastError = `Could not save ${path.basename(imagePath)}.`
    }
  }

  if (added === 0) {
    return {
      success: false,
      error: 'save_error',
      message: lastError || 'Could not save the selected photos.'
    }
  }

  updateScreensaverImage()

  const skipped = selected.length - added
  const full =
    current.length + added >= MAX_SCREENSAVER_PHOTOS &&
    res.filePaths.length > remaining
  let message = added === 1 ? 'Photo added.' : `${added} photos added.`
  if (skipped > 0 && lastError) message += ` ${lastError}`
  if (full) {
    message += ` Album is full (${MAX_SCREENSAVER_PHOTOS} max).`
  }

  return {
    success: true,
    added,
    count: current.length + added,
    message
  }
}

export function removeScreensaverPhoto(id: string) {
  const photo = listPhotoFiles().find(p => p.id === id)
  if (!photo) return false
  fs.unlinkSync(photo.filePath)
  if (listPhotoFiles().length === 0) {
    broadcast('removed')
  } else {
    updateScreensaverImage()
  }
  return true
}

export function removeScreensaverImage() {
  const photos = listPhotoFiles()
  for (const photo of photos) {
    try {
      fs.unlinkSync(photo.filePath)
    } catch {
      /* ignore */
    }
  }
  const legacy = legacyImagePath()
  if (fs.existsSync(legacy)) fs.unlinkSync(legacy)
  broadcast('removed')
  return true
}

/** @deprecated use getScreensaverPhotoPath; kept for older callers */
export function getScreensaverImagePath() {
  const photos = listPhotoFiles()
  return photos[0]?.filePath ?? null
}
