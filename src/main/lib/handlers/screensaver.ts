import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'
import { getStorageValue } from '../storage.js'
import {
  getScreensaverPhotoDataUrl,
  listScreensaverPhotos
} from '../screensaver.js'

export const name = 'screensaver'

export const hasActions = true

const ALLOWED_ROTATE_MS = [30000, 60000, 300000]

function getRotateMs() {
  const value = Number(getStorageValue('screensaverRotateMs'))
  if (ALLOWED_ROTATE_MS.indexOf(value) !== -1) return value
  return 30000
}

export const actions: HandlerAction[] = [
  {
    action: 'getAlbum',
    handle: async ws => {
      const photos = listScreensaverPhotos().map(p => ({ id: p.id }))
      ws.send(
        JSON.stringify({
          type: 'screensaver',
          action: 'album',
          data: {
            photos,
            rotateMs: getRotateMs(),
            shuffle: getStorageValue('screensaverShuffle') === true
          }
        })
      )
    }
  },
  {
    action: 'getImage',
    handle: async (ws, data) => {
      const photos = listScreensaverPhotos()
      if (photos.length === 0) return

      const id =
        data && typeof data === 'object' && 'id' in data
          ? String((data as { id: string }).id)
          : photos[0].id

      const image = getScreensaverPhotoDataUrl(id)
      if (!image) return

      ws.send(
        JSON.stringify({
          type: 'screensaver',
          action: 'image',
          data: { id, image }
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
