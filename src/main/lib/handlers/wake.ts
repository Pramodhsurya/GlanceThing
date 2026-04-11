import { setAutoBrightness } from '../adb.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'
import { getStorageValue } from '../storage.js'

export const name = 'wake'

export const hasActions = false

export const handle: HandlerFunction = async () => {
  if (getStorageValue('autoBrightness') === true) {
    await setAutoBrightness(null, true)
  }
}
