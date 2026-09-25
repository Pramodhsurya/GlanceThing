import {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type TouchEvent
} from 'react'

import { SocketContext } from '@/contexts/SocketContext.tsx'
import { SleepContext } from '@/contexts/SleepContext.tsx'
import { useApps } from '@/contexts/AppsContext.tsx'
import { macNow, syncMacClock } from '@/lib/macClock.ts'

import MeetingReminder from '@/components/MeetingReminder/MeetingReminder.tsx'
import Player from './widgets/Player/Player.tsx'
import {
  ActionsFace,
  CalendarFace,
  LayoutFace,
  PhotosFace,
  UsageFace,
  WeatherFace
} from './Screen.tsx'
import {
  fitTiles,
  type ActionItem,
  type AiUsageInfo,
  type AppShortcut,
  type CalendarEvent,
  type CalendarInfo,
  type PhotosInfo,
  type ScreenConfig,
  type Tile,
  type WeatherInfo
} from './screenModel.ts'

import styles from './Widgets.module.css'

const LayoutTile: React.FC<{
  shortcutIds: string[]
  tileId: string
  selectedKey: string
}> = ({ shortcutIds, tileId, selectedKey }) => {
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
      tileId={tileId}
      selectedKey={selectedKey}
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
  tileId: string
  selectedKey: string
}> = ({ actions, tileId, selectedKey }) => {
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

  return (
    <ActionsFace
      actions={actions}
      tileId={tileId}
      selectedKey={selectedKey}
      onRun={run}
    />
  )
}

const CalendarTile: React.FC<{ calendar?: CalendarInfo; now: number }> = ({
  calendar,
  now
}) => {
  const { socket } = useContext(SocketContext)
  return (
    <CalendarFace
      calendar={calendar}
      now={now}
      onJoin={(event: CalendarEvent) =>
        socket?.send(
          JSON.stringify({
            type: 'calendar',
            action: 'join',
            data: { title: event.title, start: event.start }
          })
        )
      }
    />
  )
}

const PhotosTile: React.FC = () => {
  const { ready, socket } = useContext(SocketContext)
  const [photos, setPhotos] = useState<PhotosInfo>({
    message: 'Add photos in Settings'
  })
  const idsRef = useRef<string[]>([])
  const indexRef = useRef(0)
  const imagesRef = useRef<Record<string, string>>({})
  const fitsRef = useRef<Record<string, boolean>>({})
  const rotateRef = useRef(30000)
  const shuffleRef = useRef(false)

  const show = useCallback((index: number) => {
    const ids = idsRef.current
    if (!ids.length) {
      setPhotos({ message: 'Add photos in Settings' })
      return
    }
    const id = ids[index]
    setPhotos({
      image: imagesRef.current[id],
      fit: fitsRef.current[id] ? 'fit' : 'fill',
      count: ids.length,
      message: imagesRef.current[id] ? undefined : 'Loading photo…'
    })
  }, [])

  useEffect(() => {
    if (!ready || !socket) return

    const requestImage = (id: string) => {
      socket.send(
        JSON.stringify({
          type: 'screensaver',
          action: 'getImage',
          data: { id }
        })
      )
    }

    const listener = (e: MessageEvent) => {
      const message = JSON.parse(e.data)
      if (message.type !== 'screensaver') return
      if (message.action === 'album') {
        const list = (message.data && message.data.photos) || []
        const ids: string[] = []
        const fits: Record<string, boolean> = {}
        for (let i = 0; i < list.length; i += 1) {
          if (list[i] && list[i].id) {
            const id = String(list[i].id)
            ids.push(id)
            fits[id] = list[i].fit === 'fit'
          }
        }
        idsRef.current = ids
        fitsRef.current = fits
        indexRef.current = 0
        const rotate = Number(message.data && message.data.rotateMs)
        rotateRef.current =
          rotate === 30000 || rotate === 60000 || rotate === 300000
            ? rotate
            : 30000
        shuffleRef.current = Boolean(message.data && message.data.shuffle)
        if (ids.length === 0) {
          imagesRef.current = {}
          setPhotos({ message: 'Add photos in Settings' })
        } else {
          for (let i = 0; i < ids.length; i += 1) requestImage(ids[i])
          show(0)
        }
        return
      }
      if (message.action === 'image' && message.data && message.data.id) {
        imagesRef.current[message.data.id] = message.data.image
        if (idsRef.current[indexRef.current] === message.data.id) {
          show(indexRef.current)
        }
        return
      }
      if (message.action === 'update') {
        socket.send(
          JSON.stringify({ type: 'screensaver', action: 'getAlbum' })
        )
      }
      if (message.action === 'removed') {
        idsRef.current = []
        imagesRef.current = {}
        setPhotos({ message: 'Add photos in Settings' })
      }
    }

    socket.addEventListener('message', listener)
    socket.send(
      JSON.stringify({ type: 'screensaver', action: 'getAlbum' })
    )
    return () => socket.removeEventListener('message', listener)
  }, [ready, socket, show])

  useEffect(() => {
    if (idsRef.current.length < 2) return
    const timer = setInterval(() => {
      const ids = idsRef.current
      if (ids.length < 2) return
      let next = (indexRef.current + 1) % ids.length
      if (shuffleRef.current) {
        next = Math.floor(Math.random() * ids.length)
      }
      indexRef.current = next
      show(next)
    }, rotateRef.current)
    return () => clearInterval(timer)
  }, [photos.count, show])

  return <PhotosFace photos={photos} />
}

function OpenAppWrap({
  appId,
  children
}: {
  appId: string
  children: ReactNode
}) {
  const { openApp, installedApps, hiddenApps } = useApps()
  const canOpen =
    installedApps.indexOf(appId) !== -1 && hiddenApps.indexOf(appId) === -1
  return (
    <div
      className={styles.openApp}
      data-open-app={appId}
      style={{
        display: 'block',
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0
      }}
      onClick={canOpen ? () => openApp(appId) : undefined}
    >
      {children}
    </div>
  )
}

function isConfig(value: unknown): value is ScreenConfig {
  if (!value || typeof value !== 'object' || Array.isArray(value))
    return false
  return Array.isArray((value as ScreenConfig).tiles)
}

function TileView({
  tile,
  actions,
  calendar,
  weather,
  aiUsage,
  selectedKey,
  now
}: {
  tile: Tile
  actions: ActionItem[]
  calendar?: CalendarInfo
  weather?: WeatherInfo
  aiUsage?: AiUsageInfo
  selectedKey: string
  now: number
}) {
  if (tile.kind === 'playback') return <Player />
  if (tile.kind === 'usage') {
    return (
      <OpenAppWrap appId="usage">
        <UsageFace
          usage={aiUsage}
          target={tile.provider}
          usageStyle={tile.usageStyle}
          now={now}
        />
      </OpenAppWrap>
    )
  }
  if (tile.kind === 'calendar') {
    return (
      <OpenAppWrap appId="calendar">
        <CalendarTile calendar={calendar} now={now} />
      </OpenAppWrap>
    )
  }
  if (tile.kind === 'weather') {
    return (
      <OpenAppWrap appId="weather">
        <WeatherFace weather={weather} />
      </OpenAppWrap>
    )
  }
  if (tile.kind === 'photos') {
    return (
      <OpenAppWrap appId="photos">
        <PhotosTile />
      </OpenAppWrap>
    )
  }
  if (tile.kind === 'actions') {
    const ids = tile.actionIds
    const visible = Array.isArray(ids)
      ? (ids
          .map(id => actions.find(action => action.id === id))
          .filter(Boolean) as ActionItem[])
      : actions
    return (
      <ActionsTile
        actions={visible}
        tileId={tile.id}
        selectedKey={selectedKey}
      />
    )
  }
  return (
    <LayoutTile
      shortcutIds={tile.shortcutIds || []}
      tileId={tile.id}
      selectedKey={selectedKey}
    />
  )
}

const Widgets: React.FC = () => {
  const widgetsRef = useRef<HTMLDivElement>(null)
  const { ready, socket } = useContext(SocketContext)
  const { trayOrAppOpen, currentApp } = useApps()
  const [config, setConfig] = useState<ScreenConfig | null>(null)
  const [apps, setApps] = useState<AppShortcut[] | null>(null)
  const [pageIndex, setPageIndex] = useState(0)
  const [dialIndex, setDialIndex] = useState(0)
  const touchStart = useRef({ x: 0, y: 0, scrolling: false })
  const dialRef = useRef({ index: 0, count: 0, pages: 1, mode: 'both' })
  const dialEdge = useRef<'start' | 'end' | null>(null)
  const dialStepAt = useRef(0)
  const { sleepState } = useContext(SleepContext)
  const sleepRef = useRef(sleepState)
  sleepRef.current = sleepState
  const trayBusyRef = useRef(trayOrAppOpen)
  trayBusyRef.current = trayOrAppOpen
  const [now, setNow] = useState(macNow)

  useEffect(() => {
    const timer = setInterval(() => setNow(macNow()), 20 * 1000)
    return () => clearInterval(timer)
  }, [])

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
      if (message.type === 'time' && message.data) {
        syncMacClock(message.data)
        setNow(macNow())
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
    socket.send(JSON.stringify({ type: 'time' }))

    return () => socket.removeEventListener('message', listener)
  }, [ready, socket])

  const pages =
    config?.pages && config.pages.length > 0
      ? config.pages
      : [{ tiles: config?.tiles }]
  const safeIndex = Math.min(pageIndex, Math.max(pages.length - 1, 0))
  const rawTiles = pages[safeIndex]?.tiles
  const tiles = rawTiles ? fitTiles(rawTiles) : rawTiles
  const actions = config?.actions || []
  const dialOn = config?.dialNavigation === true
  const dialMode = config?.dialMode || 'both'
  const dialItems: string[] = []
  if (tiles && dialMode !== 'pages') {
    for (let tileIndex = 0; tileIndex < tiles.length; tileIndex += 1) {
      const tile = tiles[tileIndex]
      if (tile.kind === 'layout') {
        const ids = tile.shortcutIds || []
        for (let i = 0; i < ids.length; i += 1) {
          dialItems.push(tile.id + ':' + ids[i])
        }
      }
      if (tile.kind === 'actions') {
        const wanted = tile.actionIds
        for (let i = 0; i < actions.length; i += 1) {
          const id = actions[i].id
          if (Array.isArray(wanted) && wanted.indexOf(id) < 0) continue
          dialItems.push(tile.id + ':' + id)
        }
      }
    }
  }
  const selectedKey =
    dialOn && dialItems.length > 0
      ? dialItems[Math.min(dialIndex, dialItems.length - 1)]
      : ''
  dialRef.current = {
    index: Math.min(dialIndex, Math.max(dialItems.length - 1, 0)),
    count: dialItems.length,
    pages: pages.length,
    mode: dialMode
  }

  useEffect(() => {
    if (!dialOn || !dialEdge.current) return
    setDialIndex(
      dialEdge.current === 'end' ? Math.max(dialItems.length - 1, 0) : 0
    )
    dialEdge.current = null
  }, [pageIndex, dialOn, dialItems.length])

  useEffect(() => {
    if (!dialOn) return
    const active = document.activeElement as HTMLElement | null
    if (active && active.blur) active.blur()

    function move(direction: number) {
      const now = Date.now()
      if (now - dialStepAt.current < 40) return
      dialStepAt.current = now
      const state = dialRef.current
      if (state.count === 0) {
        if (state.pages < 2 || state.mode === 'items') return
        dialEdge.current = direction > 0 ? 'start' : 'end'
        setPageIndex(current =>
          direction > 0
            ? (current + 1) % state.pages
            : (current - 1 + state.pages) % state.pages
        )
        return
      }
      const next = state.index + direction
      if (next >= 0 && next < state.count) {
        setDialIndex(next)
        return
      }
      if (state.pages < 2 || state.mode === 'items') {
        setDialIndex(direction > 0 ? 0 : state.count - 1)
        return
      }
      dialEdge.current = direction > 0 ? 'start' : 'end'
      setPageIndex(current =>
        direction > 0
          ? (current + 1) % state.pages
          : (current - 1 + state.pages) % state.pages
      )
    }

    function blocked() {
      return (
        !!document.querySelector('[class*="menu"][data-shown="true"]') ||
        !!document.querySelector('[data-app-tray][data-state="peek"]') ||
        !!document.querySelector('[data-app-tray][data-state="full"]') ||
        !!document.querySelector('[data-app-host][data-shown="true"]') ||
        trayBusyRef.current
      )
    }

    function onKey(event: KeyboardEvent) {
      if (sleepRef.current !== 'off' || blocked()) return
      if (event.key === 'ArrowLeft' || event.key === 'ArrowUp') {
        event.preventDefault()
        event.stopPropagation()
        move(-1)
      } else if (event.key === 'ArrowRight' || event.key === 'ArrowDown') {
        event.preventDefault()
        event.stopPropagation()
        move(1)
      } else if (event.key === 'Enter') {
        event.preventDefault()
        event.stopPropagation()
        const selected = document.querySelector(
          '[data-dial-selected="true"]'
        ) as HTMLElement | null
        if (selected) selected.click()
      }
    }

    function onWheel(event: WheelEvent) {
      if (sleepRef.current !== 'off' || blocked()) return
      const delta =
        Math.abs(event.deltaX) >= Math.abs(event.deltaY)
          ? event.deltaX
          : event.deltaY
      if (!delta) return
      event.preventDefault()
      event.stopPropagation()
      move(delta > 0 ? 1 : -1)
    }

    document.addEventListener('keydown', onKey, true)
    document.addEventListener('wheel', onWheel, {
      capture: true,
      passive: false
    })
    return () => {
      document.removeEventListener('keydown', onKey, true)
      document.removeEventListener('wheel', onWheel, true)
    }
  }, [dialOn])

  function onTouchStart(event: TouchEvent) {
    const touch = event.changedTouches[0]
    const target = event.target as HTMLElement | null
    touchStart.current = {
      x: touch.clientX,
      y: touch.clientY,
      scrolling: !!(
        target &&
        target.closest &&
        target.closest('[data-scroll]')
      )
    }
  }

  function onTouchEnd(event: TouchEvent) {
    if (currentApp) return
    const touch = event.changedTouches[0]
    const dx = touch.clientX - touchStart.current.x
    const dy = touch.clientY - touchStart.current.y
    const absX = Math.abs(dx)
    const absY = Math.abs(dy)

    // Vertical swipes open the apps tray (handled in AppsContext).
    if (absY >= 50 && absY > absX) return

    const sideways = touchStart.current.scrolling
      ? absX >= absY * 2
      : absX >= absY
    if (absX < 50 || !sideways || trayOrAppOpen) return
    if (dx < 0)
      setPageIndex(current => Math.min(pages.length - 1, current + 1))
    else setPageIndex(current => Math.max(0, current - 1))
  }

  return (
    <div
      className={styles.widgets}
      ref={widgetsRef}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
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
              <TileView
                tile={tile}
                actions={actions}
                calendar={config?.calendar}
                weather={config?.weather}
                aiUsage={config?.aiUsage}
                selectedKey={selectedKey}
                now={now}
              />
            </div>
          ))}
        </div>
      ) : (
        <>
          <Player />
          <div className={styles.column}>
            <LayoutTile
              shortcutIds={(apps || []).map(app => app.id)}
              tileId="default-layout"
              selectedKey=""
            />
            <ActionsTile
              tileId="default-actions"
              selectedKey=""
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
      {pages.length > 1 ? (
        <div className={styles.pager}>
          {pages.map((page, index) => (
            <span
              key={page.id || index}
              className={styles.dot}
              data-on={index === safeIndex}
            />
          ))}
        </div>
      ) : null}
      <MeetingReminder events={config?.calendar?.events || []} now={now} />
    </div>
  )
}

export default Widgets
