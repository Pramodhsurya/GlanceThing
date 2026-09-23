import { useContext, useEffect, useRef, useState } from 'react'

import { SocketContext } from '@/contexts/SocketContext.tsx'

import Player from './widgets/Player/Player.tsx'
import { ActionsFace, LayoutFace } from './Screen.tsx'
import {
  fitTiles,
  type ActionItem,
  type AppShortcut,
  type ScreenConfig,
  type Tile
} from './screenModel.ts'

import styles from './Widgets.module.css'

const LayoutTile: React.FC<{
  shortcutIds: string[]
}> = ({ shortcutIds }) => {
  const { ready, socket } = useContext(SocketContext)
  const [images, setImages] = useState<Record<string, string>>({})

  useEffect(() => {
    if (!ready || !socket || shortcutIds.length === 0) return

    const listener = (e: MessageEvent) => {
      const message = JSON.parse(e.data)
      if (
        message.type === 'apps' &&
        message.action === 'image' &&
        message.data?.id
      ) {
        setImages(current => ({
          ...current,
          [message.data.id]: message.data.image
        }))
      }
    }

    socket.addEventListener('message', listener)
    for (const id of shortcutIds) {
      socket.send(
        JSON.stringify({ type: 'apps', action: 'image', data: id })
      )
    }

    return () => socket.removeEventListener('message', listener)
  }, [ready, socket, shortcutIds])

  return (
    <LayoutFace
      shortcutIds={shortcutIds}
      images={images}
      onOpen={id =>
        socket?.send(
          JSON.stringify({ type: 'apps', action: 'open', data: id })
        )
      }
    />
  )
}

const ActionsTile: React.FC<{
  actions: ActionItem[]
}> = ({ actions }) => {
  const { socket } = useContext(SocketContext)

  function run(action: ActionItem) {
    if (action.command === '__builtin:lock') {
      socket?.send(JSON.stringify({ type: 'lock' }))
      return
    }
    socket?.send(
      JSON.stringify({ type: 'actions', action: 'run', data: action.id })
    )
  }

  return <ActionsFace actions={actions} onRun={run} />
}

function isConfig(value: unknown): value is ScreenConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  return Array.isArray((value as ScreenConfig).tiles)
}

function TileView({
  tile,
  actions
}: {
  tile: Tile
  actions: ActionItem[]
}) {
  if (tile.kind === 'playback') return <Player />
  if (tile.kind === 'actions') {
    const ids = tile.actionIds
    const visible = Array.isArray(ids)
      ? (ids
          .map(id => actions.find(action => action.id === id))
          .filter(Boolean) as ActionItem[])
      : actions
    return <ActionsTile actions={visible} />
  }
  return <LayoutTile shortcutIds={tile.shortcutIds || []} />
}

const Widgets: React.FC = () => {
  const widgetsRef = useRef<HTMLDivElement>(null)
  const { ready, socket } = useContext(SocketContext)
  const [config, setConfig] = useState<ScreenConfig | null>(null)
  const [apps, setApps] = useState<AppShortcut[] | null>(null)

  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (!widgetsRef.current) return
      const widgets = widgetsRef.current.querySelectorAll('#widget')
      if (e.key === '1') (widgets[0] as HTMLDivElement)?.focus()
      else if (e.key === '2') (widgets[1] as HTMLDivElement)?.focus()
      else if (e.key === '3') (widgets[2] as HTMLDivElement)?.focus()
    }

    document.addEventListener('keydown', listener)
    return () => document.removeEventListener('keydown', listener)
  })

  useEffect(() => {
    if (!ready || !socket) return

    const listener = (e: MessageEvent) => {
      const message = JSON.parse(e.data)
      if (message.type === 'layout' && isConfig(message.data)) {
        setConfig(message.data)
      }
      if (
        message.type === 'apps' &&
        !message.action &&
        Array.isArray(message.data)
      ) {
        setApps(message.data)
      }
    }

    socket.addEventListener('message', listener)
    socket.send(JSON.stringify({ type: 'layout' }))
    socket.send(JSON.stringify({ type: 'apps' }))

    return () => socket.removeEventListener('message', listener)
  }, [ready, socket])

  const tiles = config?.tiles ? fitTiles(config.tiles) : config?.tiles
  const actions = config?.actions || []

  return (
    <div className={styles.widgets} ref={widgetsRef}>
      {tiles ? (
        <div className={styles.board}>
          {tiles.map(tile => (
            <div
              key={tile.id}
              className={styles.placed}
              style={{
                left: `${tile.x}%`,
                top: `${tile.y}%`,
                width: `${tile.w}%`,
                height: `${tile.h}%`
              }}
            >
              <TileView tile={tile} actions={actions} />
            </div>
          ))}
        </div>
      ) : (
        <>
          <Player />
          <div className={styles.column}>
            <LayoutTile shortcutIds={(apps || []).map(app => app.id)} />
            <ActionsTile
              actions={[
                {
                  id: 'lock',
                  label: 'Lock',
                  icon: 'lock',
                  command: '__builtin:lock'
                }
              ]}
            />
          </div>
        </>
      )}
    </div>
  )
}

export default Widgets
