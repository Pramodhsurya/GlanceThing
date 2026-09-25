import React, { useState } from 'react'

import { OFFICIAL_APP_IDS } from '@/lib/officialApps.js'

import styles from './ChooseApps.module.css'

const APPS: {
  id: (typeof OFFICIAL_APP_IDS)[number]
  name: string
  icon: string
  color: string
  description: string
}[] = [
  {
    id: 'music',
    name: 'Music',
    icon: 'music_note',
    color: '#a855f7',
    description: 'Now playing, seek, skip and volume.'
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    icon: 'timer',
    color: '#ef4444',
    description: 'Focus timer with short and long breaks.'
  },
  {
    id: 'system',
    name: 'Resource Usage',
    icon: 'memory',
    color: '#10b981',
    description: 'CPU, memory and uptime of this computer.'
  },
  {
    id: 'recorder',
    name: 'Recording Notes',
    icon: 'mic',
    color: '#f43f5e',
    description: "Voice notes with the Car Thing's microphone."
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'code',
    color: '#238636',
    description: 'Repos, stars, pull requests and issues.'
  },
  {
    id: 'logs',
    name: 'Console Logs',
    icon: 'list_alt',
    color: '#0ea5e9',
    description: 'Live GlanceThing logs.'
  },
  {
    id: 'link',
    name: 'Link',
    icon: 'link',
    color: '#6366f1',
    description: 'Shared tap board between Car Things.'
  },
  {
    id: 'mic',
    name: 'Mic',
    icon: 'mic',
    color: '#22c55e',
    description: 'Mute or unmute the microphones on this computer.'
  }
]

export async function saveInstalledApps(ids: string[]) {
  await window.api.setStorageValue('installedApps', ids)
  const hidden = await window.api.getStorageValue('hiddenApps')
  const nextHidden = (Array.isArray(hidden) ? hidden : []).filter(
    (id: string) => !ids.includes(id)
  )
  await window.api.setStorageValue('hiddenApps', nextHidden)
}

const ChooseApps: React.FC<{
  onDone: () => void
  overlay?: boolean
}> = ({ onDone, overlay }) => {
  const [selected, setSelected] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  function toggle(id: string) {
    setSelected(list =>
      list.includes(id) ? list.filter(item => item !== id) : [...list, id]
    )
  }

  async function confirm() {
    setBusy(true)
    try {
      await saveInstalledApps(selected)
      onDone()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.wrap} data-overlay={overlay ? 'true' : 'false'}>
      <div className={styles.panel}>
        <h1>Choose apps</h1>
        <p className={styles.lead}>
          Nothing is installed until you pick it. Select what you want on
          the Car Thing. You can install or uninstall more later from the
          Store.
        </p>
        <div className={styles.grid}>
          {APPS.map(app => {
            const on = selected.includes(app.id)
            return (
              <button
                key={app.id}
                type="button"
                className={styles.card}
                data-on={on}
                onClick={() => toggle(app.id)}
              >
                <div
                  className={styles.icon}
                  style={{ background: app.color }}
                >
                  <span className="material-icons">{app.icon}</span>
                </div>
                <div className={styles.copy}>
                  <strong>{app.name}</strong>
                  <span>{app.description}</span>
                </div>
                <span className={`material-icons ${styles.mark}`}>
                  {on ? 'check_circle' : 'circle'}
                </span>
              </button>
            )
          })}
        </div>
        <div className={styles.actions}>
          <button
            type="button"
            className={styles.ghost}
            disabled={busy}
            onClick={async () => {
              setBusy(true)
              try {
                await saveInstalledApps([])
                onDone()
              } finally {
                setBusy(false)
              }
            }}
          >
            Continue without apps
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={busy || !selected.length}
            onClick={confirm}
          >
            {busy
              ? 'Saving…'
              : selected.length
                ? `Install ${selected.length} app${selected.length === 1 ? '' : 's'}`
                : 'Install selected'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ChooseApps
