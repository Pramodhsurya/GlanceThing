import { AuthenticatedWebSocket } from '../../types/WebSocketServer.js'
import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'

export const name = 'link'

export const hasActions = true

interface LinkClient {
  id: string
  name: string
  color: string
  score: number
}

const COLORS = [
  '#38bdf8',
  '#f472b6',
  '#facc15',
  '#34d399',
  '#a78bfa',
  '#fb923c'
]

const members = new Map<AuthenticatedWebSocket, LinkClient>()
let joined = 0

function snapshot() {
  return [...members.values()]
}

function broadcast() {
  const clients = snapshot()
  for (const [ws, me] of members) {
    if (ws.readyState !== ws.OPEN) continue
    ws.send(
      JSON.stringify({
        type: 'link',
        action: 'state',
        data: { you: me.id, clients }
      })
    )
  }
}

function leave(ws: AuthenticatedWebSocket) {
  if (members.delete(ws)) broadcast()
}

function member(ws: AuthenticatedWebSocket) {
  return members.get(ws)
}

export const actions: HandlerAction[] = [
  {
    action: 'join',
    handle: async ws => {
      if (!members.has(ws)) {
        joined++
        members.set(ws, {
          id: `c${joined}-${Date.now().toString(36)}`,
          name: `Car Thing ${joined}`,
          color: COLORS[(joined - 1) % COLORS.length],
          score: 0
        })
        ws.once('close', () => leave(ws))
      }
      broadcast()
    }
  },
  {
    action: 'leave',
    handle: async ws => leave(ws)
  },
  {
    action: 'tap',
    handle: async (ws, data) => {
      const me = member(ws)
      if (!me) return
      const inc = Number((data as { inc?: number })?.inc ?? 1)
      me.score = Math.max(
        0,
        me.score + (isFinite(inc) ? Math.round(inc) : 1)
      )
      broadcast()
    }
  },
  {
    action: 'color',
    handle: async (ws, data) => {
      const me = member(ws)
      const color = (data as { color?: string })?.color
      if (!me || !color || !/^#[0-9a-f]{6}$/i.test(color)) return
      me.color = color
      broadcast()
    }
  },
  {
    action: 'reset',
    handle: async () => {
      members.forEach(m => (m.score = 0))
      broadcast()
    }
  }
]

export const handle: HandlerFunction = async ws => {
  ws.send(
    JSON.stringify({
      type: 'link',
      action: 'state',
      data: { you: member(ws)?.id ?? null, clients: snapshot() }
    })
  )
}
