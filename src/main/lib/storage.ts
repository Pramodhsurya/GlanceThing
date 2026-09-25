import { app, safeStorage } from 'electron'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs'

import {
  findOpenPort,
  isPortOpen,
  log,
  LogLevel,
  random,
  safeParse,
  setLogLevel
} from './utils.js'

import { setAutoBrightness, setBrightnessSmooth } from './adb.js'
import { serverManager } from './server.js'
import { updateTime } from './time.js'

let storage = {}

const storageValueHandlers: Record<string, (value: unknown) => void> = {
  launchOnStartup: async value => {
    app.setLoginItemSettings({
      openAtLogin: value as boolean
    })
  },
  timeFormat: updateTime,
  dateFormat: updateTime,
  autoBrightness: async value => {
    await setAutoBrightness(null, value as boolean)
  },
  brightness: async value => {
    await setBrightnessSmooth(null, value as number)
  },
  screenLayout: () => {
    serverManager.broadcast({ type: 'layout', data: getLayoutPayload() })
  },
  dialNavigation: () => {
    serverManager.broadcast({ type: 'layout', data: getLayoutPayload() })
  },
  dialMode: () => {
    serverManager.broadcast({ type: 'layout', data: getLayoutPayload() })
  },
  aiUsage: () => {
    serverManager.broadcast({ type: 'layout', data: getLayoutPayload() })
  },
  hiddenApps: () => {
    serverManager.broadcast({ type: 'layout', data: getLayoutPayload() })
  },
  communityApps: () => {
    serverManager.broadcast({ type: 'layout', data: getLayoutPayload() })
  },
  screensaverRotateMs: () => {
    serverManager.broadcast({ type: 'screensaver', action: 'update' })
  },
  screensaverShuffle: () => {
    serverManager.broadcast({ type: 'screensaver', action: 'update' })
  },
  screensaverClock: () => {
    serverManager.broadcast({ type: 'screensaver', action: 'update' })
  },
  logLevel: async value => setLogLevel(value as LogLevel),
  port: async p => {
    const newPort = p as number | null
    const info = serverManager.getServerInfo()
    if (info.running && info.port !== newPort) {
      await serverManager.restart()
    }
  }
}

function getStoragePath() {
  const userDataPath = app.getPath('userData')
  const storagePath = path.join(userDataPath, 'storage.json')

  if (!fs.existsSync(storagePath))
    fs.writeFileSync(storagePath, '{}', 'utf8')

  return storagePath
}

export function loadStorage() {
  log('Loading storage file', 'Storage', LogLevel.DEBUG)
  const storagePath = getStoragePath()
  const content = fs.readFileSync(storagePath, 'utf8')
  const parsed = safeParse(content)

  if (parsed) {
    storage = parsed
  } else {
    log(
      'Failed to parse storage file, using empty object.',
      'Storage',
      LogLevel.ERROR
    )
    storage = {}
  }

  log('Loaded storage file', 'Storage')
}

function writeStorage(storage: Record<string, unknown>) {
  const storagePath = getStoragePath()
  fs.writeFileSync(storagePath, JSON.stringify(storage, null, 2), 'utf8')
}

export function getLayoutPayload() {
  const layout = getStorageValue('screenLayout')
  const dialNavigation = getStorageValue('dialNavigation') === true
  const savedMode = getStorageValue('dialMode')
  const dialMode =
    savedMode === 'pages' || savedMode === 'items' ? savedMode : 'both'
  const aiUsage = getStorageValue('aiUsage') || undefined
  const storedHidden = getStorageValue('hiddenApps')
  const hiddenApps = Array.isArray(storedHidden) ? storedHidden : []
  const storedCommunity = getStorageValue('communityApps')
  const communityApps = Array.isArray(storedCommunity)
    ? (storedCommunity as { id: string; label: string; icon?: string; color?: string; enabled?: boolean }[])
        .filter(a => a.enabled !== false)
        .map(a => ({
          id: a.id,
          name: a.label,
          icon: a.icon || 'extension',
          color: a.color || '#6366f1'
        }))
    : []
  if (!layout || typeof layout !== 'object' || Array.isArray(layout)) {
    return { tiles: [], dialNavigation, dialMode, aiUsage, hiddenApps, communityApps }
  }
  return {
    ...(layout as Record<string, unknown>),
    dialNavigation,
    dialMode,
    aiUsage,
    hiddenApps,
    communityApps
  }
}

let keychainChecked = false

// macOS asks again for Keychain access whenever the app's signature changes,
// and blocks the main thread until the user answers. The notice runs in a
// separate process: a modal dialog here breaks Chromium's network startup.
function prepareKeychainAccess() {
  if (keychainChecked) return
  keychainChecked = true
  if (process.platform !== 'darwin' || !app.isPackaged) return

  const buildId = `${app.getVersion()}-${fs.statSync(process.execPath).mtimeMs}`
  if (storage['keychainBuildId'] === buildId) return

  if (storage['socketPassword'] !== undefined) {
    log(
      'Waiting for macOS Keychain access. Click "Always Allow" if prompted.',
      'Storage'
    )
    spawn(
      'osascript',
      [
        '-e',
        'display dialog "GlanceThing was updated, so macOS is asking for permission to read its saved settings (GlanceThing Safe Storage). Enter your password and click Always Allow so it won’t ask again until the next update." with title "GlanceThing" buttons {"OK"} default button "OK" with icon note giving up after 120'
      ],
      { detached: true, stdio: 'ignore' }
    ).unref()
  }

  storage['keychainBuildId'] = buildId
  writeStorage(storage)
}

export function getStorageValue(key: string, secure = false) {
  log(`Getting value for key: ${key}`, 'Storage', LogLevel.DEBUG)
  const value = storage[key]

  if (value === undefined) return null

  if (secure) {
    prepareKeychainAccess()
    if (!safeStorage.isEncryptionAvailable()) {
      log(
        'Encryption is not available, returning value as is.',
        'Storage',
        LogLevel.WARN
      )
      return value
    }
    return safeStorage.decryptString(Buffer.from(value, 'hex')).toString()
  } else {
    return value
  }
}

export function setStorageValue(
  key: string,
  value: unknown,
  secure = false
) {
  log(`Setting value for key: ${key}`, 'Storage', LogLevel.DEBUG)
  if (secure) {
    prepareKeychainAccess()
    if (!safeStorage.isEncryptionAvailable()) {
      log(
        'WARNING: Encryption is not available, storing value as is.',
        'Storage',
        LogLevel.WARN
      )
    } else {
      value = safeStorage.encryptString(String(value)).toString('hex')
    }
  }

  storage[key] = value

  writeStorage(storage)

  const handler = storageValueHandlers[key]

  if (handler) {
    log(`Running handler for key: ${key}`, 'Storage', LogLevel.DEBUG)
    handler(value)
  }
}

export function getSocketPassword() {
  let socketPassword = getStorageValue('socketPassword', true)
  if (!socketPassword) {
    socketPassword = random(64)
    setStorageValue('socketPassword', socketPassword, true)
  }
  return socketPassword
}

export function getPlaybackHandlerConfig(handler: string) {
  const config = getStorageValue(`playbackConfig.${handler}`, true)
  if (config) return JSON.parse(Buffer.from(config, 'base64').toString())
  return null
}

export function setPlaybackHandlerConfig(
  handler: string,
  config: unknown
) {
  setStorageValue(
    `playbackConfig.${handler}`,
    Buffer.from(JSON.stringify(config)).toString('base64'),
    true
  )
}

export async function getServerPort() {
  const savedPort = getStorageValue('port')
  let port = savedPort

  if (savedPort) {
    const isOpen = await isPortOpen(savedPort)

    if (!isOpen) {
      log(
        `Port ${savedPort} is not open, finding a new one`,
        'Server',
        LogLevel.WARN
      )
      port = await findOpenPort()
      setStorageValue('port', null)
    }
  } else {
    port = await findOpenPort()
  }

  return port
}
