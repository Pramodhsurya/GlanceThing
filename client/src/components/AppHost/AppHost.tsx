import { useEffect } from 'react'

import { useApps } from '@/contexts/AppsContext.tsx'
import CommunityApp from './apps/CommunityApp.tsx'
import GitHubApp from './apps/GitHubApp.tsx'
import LinkApp from './apps/LinkApp.tsx'
import LogsApp from './apps/LogsApp.tsx'
import MusicApp from './apps/MusicApp.tsx'
import PomodoroApp from './apps/PomodoroApp.tsx'
import RecorderApp from './apps/RecorderApp.tsx'
import SystemApp from './apps/SystemApp.tsx'

import styles from './AppHost.module.css'

const AppHost: React.FC = () => {
  const { currentApp, closeApp, handleBack } = useApps()
  const shown = currentApp !== null

  useEffect(() => {
    if (!shown) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        handleBack()
      }
    }
    document.addEventListener('keydown', onKey, true)
    return () => document.removeEventListener('keydown', onKey, true)
  }, [shown, handleBack])

  let content: React.ReactNode = null
  if (currentApp === 'music') {
    content = <MusicApp />
  } else if (currentApp === 'pomodoro') {
    content = <PomodoroApp />
  } else if (currentApp === 'system') {
    content = <SystemApp />
  } else if (currentApp === 'logs') {
    content = <LogsApp />
  } else if (currentApp === 'link') {
    content = <LinkApp />
  } else if (currentApp === 'recorder') {
    content = <RecorderApp />
  } else if (currentApp === 'github') {
    content = <GitHubApp />
  } else if (currentApp) {
    content = <CommunityApp id={currentApp} />
  }

  return (
    <div
      className={styles.host}
      data-app-host="true"
      data-shown={shown}
      onClick={e => e.stopPropagation()}
    >
      {content}
      {!content && shown ? (
        <button type="button" onClick={closeApp}>
          Close
        </button>
      ) : null}
    </div>
  )
}

export default AppHost
