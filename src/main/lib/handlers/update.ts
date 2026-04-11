import { installApp } from '../adb.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'update'

export const hasActions = false

export const handle: HandlerFunction = async () => {
  await installApp(null)
}
