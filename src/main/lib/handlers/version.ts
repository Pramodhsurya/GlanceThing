import { app } from 'electron'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'version'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  ws.send(
    JSON.stringify({
      type: 'version',
      data: app.getVersion()
    })
  )
}
