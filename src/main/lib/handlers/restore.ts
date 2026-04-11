import { setStorageValue } from '../storage.js'
import { restore } from '../adb.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'restore'

export const hasActions = false

export const handle: HandlerFunction = async () => {
  setStorageValue('installAutomatically', false)
  await restore(null)
}
