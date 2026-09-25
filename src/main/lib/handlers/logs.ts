import { AuthenticatedWebSocket } from '../../types/WebSocketServer.js'
import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'
import { getLogs, onLog } from '../utils.js'

export const name = 'logs'

export const hasActions = true

const HISTORY = 300

const subscriptions = new Map<AuthenticatedWebSocket, () => void>()

function unsubscribe(ws: AuthenticatedWebSocket) {
  subscriptions.get(ws)?.()
  subscriptions.delete(ws)
}

export const actions: HandlerAction[] = [
  {
    action: 'subscribe',
    handle: async ws => {
      unsubscribe(ws)
      ws.send(
        JSON.stringify({
          type: 'logs',
          action: 'history',
          data: getLogs().slice(-HISTORY)
        })
      )

      const stop = onLog(line => {
        if (ws.readyState !== ws.OPEN) return unsubscribe(ws)
        ws.send(
          JSON.stringify({ type: 'logs', action: 'line', data: line })
        )
      })
      subscriptions.set(ws, stop)
      ws.once('close', () => unsubscribe(ws))
    }
  },
  {
    action: 'unsubscribe',
    handle: async ws => {
      unsubscribe(ws)
    }
  }
]

export const handle: HandlerFunction = async ws => {
  ws.send(
    JSON.stringify({
      type: 'logs',
      action: 'history',
      data: getLogs().slice(-HISTORY)
    })
  )
}
