import fs from 'fs'
import path from 'path'
import { app } from 'electron'
import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'
import { getStorageValue } from '../storage.js'

export const name = 'screensaver'

export const hasActions = true

function getScreensaverImagePath() {
  const userData = app.getPath('userData')
  const imageFolder = path.join(userData, 'screensaver')
  const target = path.join(imageFolder, 'image.png')

  if (!fs.existsSync(target)) return null

  return target
}

function getScreensaverImage() {
  const imagePath = getScreensaverImagePath()

  if (!imagePath) return null

  return fs.readFileSync(imagePath)
}

export const actions: HandlerAction[] = [
  {
    action: 'getImage',
    handle: async ws => {
      const res = getScreensaverImage()
      if (!res || !res.length) return

      ws.send(
        JSON.stringify({
          type: 'screensaver',
          action: 'image',
          data: {
            image: `data:image/png;base64,${Buffer.from(res).toString('base64')}`
          }
        })
      )
    }
  }
]

export const handle: HandlerFunction = async ws => {
  const sleepMethod = getStorageValue('sleepMethod') || 'sleep'
  ws.send(
    JSON.stringify({
      type: 'screensaver',
      data: { sleepMethod }
    })
  )
}
