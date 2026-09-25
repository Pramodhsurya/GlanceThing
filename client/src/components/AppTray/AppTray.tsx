import { useContext, useEffect, useRef, useState } from 'react'

import { AppBlurContext } from '@/contexts/AppBlurContext.tsx'
import { useApps } from '@/contexts/AppsContext.tsx'
import { BUILTIN_APPS } from '@/components/AppHost/apps/registry.ts'

import styles from './AppTray.module.css'

const AppTray: React.FC = () => {
  const { setBlurred } = useContext(AppBlurContext)
  const {
    trayState,
    currentApp,
    stepTrayUp,
    stepTrayDown,
    closeTray,
    openApp,
    hiddenApps,
    communityApps
  } = useApps()
  const apps = BUILTIN_APPS.filter(a => hiddenApps.indexOf(a.id) === -1).concat(
    communityApps
  )
  const [selected, setSelected] = useState(0)
  const touchStart = useRef({ x: 0, y: 0 })

  const open = trayState !== 'hidden' && !currentApp

  useEffect(() => {
    setBlurred(open)
  }, [open, setBlurred])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!open || !apps.length) return
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        stepTrayDown()
      } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
        e.preventDefault()
        setSelected(s => (s - 1 + apps.length) % apps.length)
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
        e.preventDefault()
        setSelected(s => (s + 1) % apps.length)
      } else if (e.key === 'Enter') {
        e.preventDefault()
        openApp(apps[selected].id)
      }
    }

    function onWheel(e: WheelEvent) {
      if (!open || !apps.length) return
      const delta =
        Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      if (!delta) return
      e.preventDefault()
      setSelected(s =>
        delta > 0
          ? (s + 1) % apps.length
          : (s - 1 + apps.length) % apps.length
      )
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
  }, [open, selected, apps, openApp, stepTrayDown])

  useEffect(() => {
    if (selected >= apps.length) setSelected(0)
  }, [apps.length, selected])

  function onTouchStart(e: React.TouchEvent) {
    const touch = e.changedTouches[0]
    touchStart.current = { x: touch.clientX, y: touch.clientY }
  }

  function onTouchEnd(e: React.TouchEvent) {
    const touch = e.changedTouches[0]
    const dx = touch.clientX - touchStart.current.x
    const dy = touch.clientY - touchStart.current.y
    if (Math.abs(dy) < 50 || Math.abs(dy) <= Math.abs(dx)) return
    e.preventDefault()
    if (dy > 0) stepTrayUp()
    else stepTrayDown()
  }

  return (
    <div
      className={styles.tray}
      data-app-tray="true"
      data-state={currentApp ? 'hidden' : trayState}
      onTouchStart={onTouchStart}
      onTouchEnd={onTouchEnd}
    >
      <div className={styles.scrim} onClick={() => closeTray()} />
      <div className={styles.panel} onClick={e => e.stopPropagation()}>
        {trayState === 'peek' ? (
          <button
            type="button"
            className={styles.peekBar}
            onClick={() => stepTrayUp()}
          >
            <span className="material-icons">apps</span>
            Swipe or tap for apps
          </button>
        ) : null}
        {trayState === 'full' ? (
          <>
            <div className={styles.handle} />
            <div className={styles.grid}>
              {apps.map((app, i) => (
                <button
                  key={app.id}
                  type="button"
                  className={styles.appButton}
                  data-selected={selected === i}
                  onClick={() => openApp(app.id)}
                  onMouseDown={() => setSelected(i)}
                >
                  <div
                    className={styles.icon}
                    style={{ background: app.color }}
                  >
                    <span className="material-icons">{app.icon}</span>
                  </div>
                  <span className={styles.label}>{app.name}</span>
                </button>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}

export default AppTray
