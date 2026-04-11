import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'ping'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  ws.send(
    JSON.stringify({
      type: 'pong',
      data: 'pong'
    })
  )
}
