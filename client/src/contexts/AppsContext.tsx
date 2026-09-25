import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState
} from 'react'

import { SocketContext } from './SocketContext.tsx'

export type AppTrayState = 'hidden' | 'peek' | 'full'
export type BuiltInAppId =
  | 'music'
  | 'pomodoro'
  | 'system'
  | 'logs'
  | 'link'
  | 'recorder'
  | 'github'
  | 'mic'

export type AppId = BuiltInAppId | string

export interface CommunityTrayApp {
  id: string
  name: string
  icon: string
  color: string
}

interface AppsContextProps {
  trayState: AppTrayState
  currentApp: AppId | null
  openTray: () => void
  stepTrayUp: () => void
  stepTrayDown: () => void
  closeTray: () => void
  openApp: (id: AppId) => void
  closeApp: () => void
  handleBack: () => boolean
  trayOrAppOpen: boolean
  hiddenApps: string[]
  communityApps: CommunityTrayApp[]
}

const AppsContext = createContext<AppsContextProps>({
  communityApps: [],
  hiddenApps: [],
  trayState: 'hidden',
  currentApp: null,
  openTray: () => {},
  stepTrayUp: () => {},
  stepTrayDown: () => {},
  closeTray: () => {},
  openApp: () => {},
  closeApp: () => {},
  handleBack: () => false,
  trayOrAppOpen: false
})

const NEXT_UP: Record<AppTrayState, AppTrayState> = {
  hidden: 'peek',
  peek: 'full',
  full: 'full'
}

const NEXT_DOWN: Record<AppTrayState, AppTrayState> = {
  full: 'peek',
  peek: 'hidden',
  hidden: 'hidden'
}

const SWIPE_MIN = 50
const SWIPE_FULL = 160
const TOP_EDGE = 60

interface AppsContextProviderProps {
  children: React.ReactNode
}

const AppsContextProvider = ({ children }: AppsContextProviderProps) => {
  const [trayState, setTrayState] = useState<AppTrayState>('hidden')
  const [currentApp, setCurrentApp] = useState<AppId | null>(null)
  const [hiddenApps, setHiddenApps] = useState<string[]>([])
  const [communityApps, setCommunityApps] = useState<CommunityTrayApp[]>([])
  const hiddenRef = useRef(hiddenApps)
  hiddenRef.current = hiddenApps
  const { ready, socket } = useContext(SocketContext)

  useEffect(() => {
    if (ready !== true || !socket) return
    function listener(e: MessageEvent) {
      const message = JSON.parse(e.data)
      if (message.type === 'mic' && message.action === 'open') {
        if (hiddenRef.current.indexOf('mic') !== -1) return
        setCurrentApp(id => (id === 'mic' ? id : 'mic'))
        setTrayState('hidden')
        return
      }
      if (message.type !== 'layout' || !message.data) return
      const hidden = message.data.hiddenApps
      setHiddenApps(Array.isArray(hidden) ? hidden : [])
      const extra = message.data.communityApps
      setCommunityApps(Array.isArray(extra) ? extra : [])
    }
    socket.addEventListener('message', listener)
    return () => socket.removeEventListener('message', listener)
  }, [ready, socket])

  useEffect(() => {
    if (currentApp && hiddenApps.indexOf(currentApp) !== -1) {
      setCurrentApp(null)
    }
  }, [currentApp, hiddenApps])

  useEffect(() => {
    if (!currentApp) return
    const builtin = [
      'music',
      'pomodoro',
      'system',
      'logs',
      'link',
      'recorder',
      'github',
      'mic'
    ]
    if (builtin.indexOf(currentApp) !== -1) return
    if (!communityApps.some(app => app.id === currentApp)) {
      setCurrentApp(null)
    }
  }, [currentApp, communityApps])

  const openTray = useCallback(() => {
    setTrayState(s => NEXT_UP[s])
  }, [])

  const stepTrayUp = useCallback(() => {
    setTrayState(s => NEXT_UP[s])
  }, [])

  const stepTrayDown = useCallback(() => {
    setTrayState(s => NEXT_DOWN[s])
  }, [])

  const closeTray = useCallback(() => {
    setTrayState('hidden')
  }, [])

  const openApp = useCallback((id: AppId) => {
    setCurrentApp(id)
    setTrayState('hidden')
  }, [])

  const closeApp = useCallback(() => {
    setCurrentApp(null)
  }, [])

  const blockedRef = useRef(false)
  blockedRef.current = trayState !== 'hidden' || currentApp !== null

  useEffect(() => {
    let start: { x: number; y: number; scroll: boolean } | null = null

    function onStart(e: TouchEvent) {
      const t = e.changedTouches[0]
      let el = e.target as HTMLElement | null
      let scrolled = false
      while (el && el !== document.body) {
        if (el.scrollTop > 0) scrolled = true
        el = el.parentElement
      }
      start = { x: t.clientX, y: t.clientY, scroll: scrolled }
    }

    function onEnd(e: TouchEvent) {
      if (!start) return
      const t = e.changedTouches[0]
      const dx = t.clientX - start.x
      const dy = t.clientY - start.y
      const fromTop = start.y <= TOP_EDGE
      const scroll = start.scroll
      start = null

      if (blockedRef.current || dy < SWIPE_MIN || dy <= Math.abs(dx)) return
      if (scroll && !fromTop) return
      if (document.querySelector('[class*="menu"][data-shown="true"]')) return
      setTrayState(dy >= SWIPE_FULL ? 'full' : 'peek')
    }

    document.addEventListener('touchstart', onStart, true)
    document.addEventListener('touchend', onEnd, true)
    return () => {
      document.removeEventListener('touchstart', onStart, true)
      document.removeEventListener('touchend', onEnd, true)
    }
  }, [])

  const handleBack = useCallback(() => {
    if (currentApp) {
      setCurrentApp(null)
      return true
    }
    if (trayState !== 'hidden') {
      setTrayState(s => NEXT_DOWN[s])
      return true
    }
    return false
  }, [currentApp, trayState])

  const value = useMemo(
    () => ({
      trayState,
      currentApp,
      openTray,
      stepTrayUp,
      stepTrayDown,
      closeTray,
      openApp,
      closeApp,
      handleBack,
      trayOrAppOpen: trayState !== 'hidden' || currentApp !== null,
      hiddenApps,
      communityApps
    }),
    [
      hiddenApps,
      communityApps,
      trayState,
      currentApp,
      openTray,
      stepTrayUp,
      stepTrayDown,
      closeTray,
      openApp,
      closeApp,
      handleBack
    ]
  )

  return (
    <AppsContext.Provider value={value}>{children}</AppsContext.Provider>
  )
}

function useApps() {
  return useContext(AppsContext)
}

export { AppsContext, AppsContextProvider, useApps }
