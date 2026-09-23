import { getStorageValue } from '../storage.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'layout'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  ws.send(
    JSON.stringify({
      type: 'layout',
      data: getStorageValue('screenLayout')
    })
  )
}
