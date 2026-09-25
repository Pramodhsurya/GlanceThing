import { AuthenticatedWebSocket } from '../../types/WebSocketServer.js'
import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'
import { getOverview, getRepoDetail } from '../github.js'
import { log, LogLevel } from '../utils.js'

export const name = 'github'

export const hasActions = true

function describe(err: unknown) {
  const e = err as { message?: string; response?: { status?: number; data?: { message?: string } } }
  if (e.message === 'no_token') return 'no_token'
  if (e.response?.status === 401) return 'bad_token'
  return e.response?.data?.message ?? e.message ?? 'Request failed'
}

function reply(ws: AuthenticatedWebSocket, action: string, data: unknown) {
  ws.send(JSON.stringify({ type: 'github', action, data }))
}

async function sendOverview(ws: AuthenticatedWebSocket, refresh: boolean) {
  try {
    reply(ws, 'overview', await getOverview(refresh))
  } catch (err) {
    const error = describe(err)
    if (error !== 'no_token') log(`GitHub overview failed: ${error}`, 'GitHub', LogLevel.WARN)
    reply(ws, 'error', { scope: 'overview', error })
  }
}

export const actions: HandlerAction[] = [
  {
    action: 'overview',
    handle: async (ws, data) => {
      await sendOverview(ws, !!(data as { refresh?: boolean })?.refresh)
    }
  },
  {
    action: 'repo',
    handle: async (ws, data) => {
      const { fullName, state } = (data ?? {}) as { fullName?: string; state?: string }
      try {
        reply(
          ws,
          'repo',
          await getRepoDetail(String(fullName), state === 'closed' ? 'closed' : 'open')
        )
      } catch (err) {
        reply(ws, 'error', { scope: 'repo', error: describe(err) })
      }
    }
  }
]

export const handle: HandlerFunction = async ws => {
  await sendOverview(ws, false)
}
