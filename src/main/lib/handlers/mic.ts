import { AuthenticatedWebSocket } from '../../types/WebSocketServer.js'
import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'
import {
  micState,
  onMicChange,
  refreshMic,
  selectMics,
  setMicMuted,
  toggleMic
} from '../mic.js'
import { log, LogLevel } from '../utils.js'

export const name = 'mic'

export const hasActions = true

const watchers = new Set<AuthenticatedWebSocket>()

function sendState(ws: AuthenticatedWebSocket, state = micState()) {
  if (ws.readyState !== ws.OPEN) return
  ws.send(JSON.stringify({ type: 'mic', action: 'state', data: state }))
}

onMicChange(state => {
  for (const ws of watchers) {
    if (ws.readyState !== ws.OPEN) {
      watchers.delete(ws)
      continue
    }
    sendState(ws, state)
  }
})

function fail(ws: AuthenticatedWebSocket, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  log(`Mic error: ${message}`, 'Mic', LogLevel.WARN)
  ws.send(
    JSON.stringify({
      type: 'mic',
      action: 'error',
      data: { message }
    })
  )
}

export const actions: HandlerAction[] = [
  {
    action: 'watch',
    handle: async ws => {
      if (!watchers.has(ws)) {
        watchers.add(ws)
        ws.once('close', () => watchers.delete(ws))
      }
      await refreshMic().catch(err => fail(ws, err))
      sendState(ws)
    }
  },
  {
    action: 'unwatch',
    handle: async ws => {
      watchers.delete(ws)
    }
  },
  {
    action: 'toggle',
    handle: async ws => {
      await toggleMic().catch(err => fail(ws, err))
    }
  },
  {
    action: 'mute',
    handle: async ws => {
      await setMicMuted(true).catch(err => fail(ws, err))
    }
  },
  {
    action: 'unmute',
    handle: async ws => {
      await setMicMuted(false).catch(err => fail(ws, err))
    }
  },
  {
    action: 'select',
    handle: async (ws, data) => {
      const names = (data as { names?: unknown })?.names
      if (!Array.isArray(names)) return
      await selectMics(names.map(n => String(n))).catch(err => fail(ws, err))
    }
  }
]

export const handle: HandlerFunction = async ws => {
  await refreshMic().catch(err => fail(ws, err))
  sendState(ws)
}
