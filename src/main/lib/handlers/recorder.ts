import { AuthenticatedWebSocket } from '../../types/WebSocketServer.js'
import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'
import {
  deleteRecording,
  listRecordings,
  onRecorderEvent,
  playRecording,
  recorderState,
  revealRecordings,
  startRecording,
  stopRecording
} from '../recorder.js'
import { log, LogLevel } from '../utils.js'

export const name = 'recorder'

export const hasActions = true

const watchers = new Set<AuthenticatedWebSocket>()

onRecorderEvent(event => {
  const message = JSON.stringify({
    type: 'recorder',
    action: event.kind,
    data: event
  })
  const list =
    event.kind === 'saved'
      ? JSON.stringify({
          type: 'recorder',
          action: 'list',
          data: listRecordings()
        })
      : null
  for (const ws of watchers) {
    if (ws.readyState !== ws.OPEN) {
      watchers.delete(ws)
      continue
    }
    ws.send(message)
    if (list) ws.send(list)
  }
})

function sendStatus(ws: AuthenticatedWebSocket) {
  ws.send(
    JSON.stringify({
      type: 'recorder',
      action: 'state',
      data: { kind: 'state', ...recorderState() }
    })
  )
  ws.send(
    JSON.stringify({
      type: 'recorder',
      action: 'list',
      data: listRecordings()
    })
  )
}

function fail(ws: AuthenticatedWebSocket, err: unknown) {
  const message = err instanceof Error ? err.message : String(err)
  log(`Recorder error: ${message}`, 'Recorder', LogLevel.WARN)
  ws.send(
    JSON.stringify({
      type: 'recorder',
      action: 'error',
      data: { kind: 'error', message }
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
      sendStatus(ws)
    }
  },
  {
    action: 'unwatch',
    handle: async ws => {
      watchers.delete(ws)
    }
  },
  {
    action: 'start',
    handle: async ws => {
      await startRecording().catch(err => fail(ws, err))
    }
  },
  {
    action: 'stop',
    handle: async ws => {
      await stopRecording().catch(err => fail(ws, err))
    }
  },
  {
    action: 'delete',
    handle: async (ws, data) => {
      deleteRecording(String((data as { name?: string })?.name ?? ''))
      sendStatus(ws)
    }
  },
  {
    action: 'play',
    handle: async (ws, data) => {
      await playRecording(
        String((data as { name?: string })?.name ?? '')
      ).catch(err => fail(ws, err))
    }
  },
  {
    action: 'reveal',
    handle: async () => {
      revealRecordings()
    }
  }
]

export const handle: HandlerFunction = async ws => {
  sendStatus(ws)
}
