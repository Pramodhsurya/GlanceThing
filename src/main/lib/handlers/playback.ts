import { RepeatMode } from '../../types/Playback.js'
import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'
import { AuthenticatedWebSocket } from '../../types/WebSocketServer.js'
import { playbackManager } from '../playback/playback.js'
import { setStorageValue } from '../storage.js'
import { log } from '../utils.js'

export const name = 'playback'

export const hasActions = true

export const actions: HandlerAction[] = [
  {
    action: 'pause',
    handle: async () => {
      await playbackManager.pause()
    }
  },
  {
    action: 'play',
    handle: async () => {
      await playbackManager.play()
    }
  },
  {
    action: 'volume',
    handle: async (_ws, data) => {
      await playbackManager.setVolume((data as { volume: number }).volume)
    }
  },
  {
    action: 'image',
    handle: async ws => {
      const image = await playbackManager.getImage()
      ws.send(
        JSON.stringify({
          type: 'playback',
          action: 'image',
          data: image ? image.toString('base64') : null
        })
      )
    }
  },
  {
    action: 'previous',
    handle: async () => {
      await playbackManager.previous()
    }
  },
  {
    action: 'next',
    handle: async () => {
      await playbackManager.next()
    }
  },
  {
    action: 'shuffle',
    handle: async (_, data) => {
      await playbackManager.shuffle((data as { state: boolean }).state)
    }
  },
  {
    action: 'repeat',
    handle: async (_, data) => {
      await playbackManager.repeat((data as { state: RepeatMode }).state)
    }
  },
  {
    action: 'seek',
    handle: async (_, data) => {
      const { position } = data as { position: number }
      if (typeof position !== 'number' || !isFinite(position)) return
      await playbackManager.seek(position).catch(err => {
        log(`Seek failed: ${err}`, 'Playback')
      })
    }
  },
  {
    action: 'sources',
    handle: async ws => {
      await sendSources(ws)
    }
  },
  {
    action: 'source',
    handle: async (ws, data) => {
      const { name } = data as { name: string }
      const sources = await playbackManager.listSources()
      const target = sources.find(s => s.name === name)
      if (!target?.ready) return sendSources(ws)

      setStorageValue('playbackHandler', name)
      await playbackManager.setup(name)
      await sendSources(ws)
    }
  }
]

async function sendSources(ws: AuthenticatedWebSocket) {
  ws.send(
    JSON.stringify({
      type: 'playback',
      action: 'sources',
      data: {
        current: playbackManager.getCurrentHandlerName(),
        sources: await playbackManager.listSources()
      }
    })
  )
}

export const handle: HandlerFunction = async ws => {
  const res = await playbackManager.getPlayback()
  ws.send(
    JSON.stringify({
      type: 'playback',
      data: res
    })
  )
}
