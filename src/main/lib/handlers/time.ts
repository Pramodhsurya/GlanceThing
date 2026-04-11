import { HandlerFunction } from '../../types/WebSocketHandler.js'
import { formatDate } from '../time.js'

export const name = 'time'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  ws.send(
    JSON.stringify({
      type: 'time',
      data: formatDate()
    })
  )
}
