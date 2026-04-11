import { setAutoBrightness, setBrightnessSmooth } from '../adb.js'
import { getStorageValue } from '../storage.js'

import { HandlerFunction } from '../../types/WebSocketHandler.js'

export const name = 'sleep'

export const hasActions = false

export const handle: HandlerFunction = async ws => {
  const sleepMethod = getStorageValue('sleepMethod') ?? 'sleep'
  ws.send(
    JSON.stringify({
      type: 'sleep',
      data: sleepMethod
    })
  )

  await setAutoBrightness(null, false)
  if (sleepMethod === 'sleep') {
    await setBrightnessSmooth(null, 0, 10)
  } else if (sleepMethod === 'screensaver') {
    await setBrightnessSmooth(null, 0.1, 10)
  }
}
