import React, { useCallback, useEffect, useMemo, useState } from 'react'

import styles from './Apps.module.css'

const BUILTIN: {
  id: string
  name: string
  icon: string
  color: string
  description: string
  author: string
  version: string
  credit?: string
}[] = [
  {
    id: 'music',
    name: 'Music',
    icon: 'music_note',
    color: '#a855f7',
    description:
      'Now playing with seek, skip 10 seconds, shuffle, repeat and volume.',
    author: 'GlanceThing',
    version: '1.0.0'
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    icon: 'timer',
    color: '#ef4444',
    description:
      'Focus timer with short and long breaks. The timer is from grahamplace/pomodoro-thing.',
    author: 'grahamplace',
    version: '1.0.0',
    credit:
      'Timer taken from https://github.com/grahamplace/pomodoro-thing by grahamplace.'
  },
  {
    id: 'system',
    name: 'Resource Usage',
    icon: 'memory',
    color: '#10b981',
    description: 'CPU, memory and uptime of this computer.',
    author: 'GlanceThing',
    version: '1.0.0'
  },
  {
    id: 'recorder',
    name: 'Recording Notes',
    icon: 'mic',
    color: '#f43f5e',
    description: "Record voice notes with the Car Thing's microphone.",
    author: 'GlanceThing',
    version: '1.0.0'
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'code',
    color: '#238636',
    description: 'Your repos, stars, pull requests and issues.',
    author: 'GlanceThing',
    version: '1.0.0'
  },
  {
    id: 'logs',
    name: 'Console Logs',
    icon: 'list_alt',
    color: '#0ea5e9',
    description: 'Live GlanceThing logs.',
    author: 'GlanceThing',
    version: '1.0.0'
  },
  {
    id: 'link',
    name: 'Link',
    icon: 'link',
    color: '#6366f1',
    description: 'Shared tap board between connected Car Things.',
    author: 'GlanceThing',
    version: '1.0.0'
  },
  {
    id: 'mic',
    name: 'Mic',
    icon: 'mic',
    color: '#22c55e',
    description:
      'Pick which mics to control. Tap to mute or unmute. Opens when a mic is in use.',
    author: 'GlanceThing',
    version: '1.0.0'
  }
]

function ipcError(err: unknown) {
  const raw =
    err && typeof err === 'object' && 'message' in err
      ? String((err as { message: string }).message)
      : String(err)
  return raw.replace(
    /^Error invoking remote method '[^']+': Error:\s*/,
    ''
  )
}

function parseRepoUrl(value: string) {
  let processed = value.trim()
  if (!processed) return { processed: '', valid: false }
  processed = processed.replace(/^git@github\.com:/, 'https://github.com/')
  if (/^[^/]+\/[^/]+$/.test(processed)) {
    processed = `https://api.github.com/repos/${processed}`
  }
  if (processed.includes('github.com')) {
    processed = processed.replace('github.com', 'api.github.com/repos')
    processed = processed.replace(/\.git$/, '')
    processed = processed.replace(/\/$/, '')
  }
  const valid = /^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+$/.test(
    processed
  )
  return { processed, valid }
}

const Apps: React.FC = () => {
  const [hidden, setHidden] = useState<string[] | null>(null)
  const [catalog, setCatalog] = useState<CommunityCatalogItem[]>([])
  const [community, setCommunity] = useState<CommunityInstalledApp[]>([])
  const [page, setPage] = useState<'installed' | 'downloads'>('installed')
  const [addOpen, setAddOpen] = useState(false)
  const [details, setDetails] = useState<
    | { kind: 'builtin'; id: string }
    | { kind: 'community'; id: string }
    | null
  >(null)
  const [staged, setStaged] = useState<StagedCommunityApp | null>(null)
  const [error, setError] = useState<string | null>(null)

  const refresh = useCallback(async () => {
    const [hiddenValue, catalogValue, communityValue] = await Promise.all([
      window.api.getStorageValue('hiddenApps'),
      window.api.communityCatalog(),
      window.api.communityList()
    ])
    setHidden(Array.isArray(hiddenValue) ? (hiddenValue as string[]) : [])
    setCatalog(catalogValue)
    setCommunity(communityValue)
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  function setBuiltinRunning(id: string, running: boolean) {
    if (!hidden) return
    const next = running ? hidden.filter(h => h !== id) : [...hidden, id]
    setHidden(next)
    window.api.setStorageValue('hiddenApps', next)
  }

  const runningCount =
    (hidden ? BUILTIN.filter(a => !hidden.includes(a.id)).length : 0) +
    community.filter(a => a.enabled).length

  return (
    <div className={styles.page}>
      <aside className={styles.sidebar}>
        <button
          type="button"
          className={styles.sideBtn}
          data-active={page === 'installed'}
          onClick={() => setPage('installed')}
        >
          <span className="material-icons">apps</span>
          Installed
        </button>
        <button
          type="button"
          className={styles.sideBtn}
          data-active={page === 'downloads'}
          onClick={() => setPage('downloads')}
        >
          <span className="material-icons">download</span>
          Download
        </button>
        <button
          type="button"
          className={styles.sideBtn}
          onClick={() => setAddOpen(true)}
        >
          <span className="material-icons">add</span>
          Add App
        </button>
      </aside>

      <main className={styles.main}>
        {page === 'installed' ? (
          hidden ? (
            <div className={styles.list}>
              {community.map(app => (
                <div key={app.id} className={styles.row}>
                  <div className={styles.rowLeft}>
                    <span className={styles.grip} aria-hidden>
                      ⋮⋮
                    </span>
                    <div
                      className={styles.rowIcon}
                      style={{ background: app.color }}
                    >
                      <span className="material-icons">
                        {app.icon || 'extension'}
                      </span>
                    </div>
                    <div>
                      <div className={styles.rowTitle}>
                        <h2>{app.label}</h2>
                        <span className={styles.version}>
                          {app.version}
                        </span>
                      </div>
                      <p className={styles.author}>By {app.author}</p>
                    </div>
                  </div>
                  <div className={styles.rowActions}>
                    <button
                      type="button"
                      className={styles.pill}
                      data-kind="settings"
                      onClick={() =>
                        setDetails({ kind: 'community', id: app.id })
                      }
                    >
                      <span className="material-icons">build</span>
                      Settings
                    </button>
                    {app.enabled ? (
                      <button
                        type="button"
                        className={styles.pill}
                        data-kind="pause"
                        onClick={() =>
                          window.api
                            .communitySetEnabled(app.id, false)
                            .then(refresh)
                        }
                      >
                        Pause
                        <span className="material-icons">pause</span>
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.pill}
                        data-kind="run"
                        onClick={() =>
                          window.api
                            .communitySetEnabled(app.id, true)
                            .then(refresh)
                        }
                      >
                        Run
                        <span className="material-icons">play_arrow</span>
                      </button>
                    )}
                  </div>
                </div>
              ))}
              {BUILTIN.map(app => {
                const running = !hidden.includes(app.id)
                return (
                  <div key={app.id} className={styles.row}>
                    <div className={styles.rowLeft}>
                      <span className={styles.grip} aria-hidden>
                        ⋮⋮
                      </span>
                      <div
                        className={styles.rowIcon}
                        style={{ background: app.color }}
                      >
                        <span className="material-icons">{app.icon}</span>
                      </div>
                      <div>
                        <div className={styles.rowTitle}>
                          <h2>{app.name}</h2>
                          <span className={styles.version}>
                            {app.version}
                          </span>
                        </div>
                        <p className={styles.author}>By {app.author}</p>
                      </div>
                    </div>
                    <div className={styles.rowActions}>
                      <button
                        type="button"
                        className={styles.pill}
                        data-kind="settings"
                        onClick={() =>
                          setDetails({ kind: 'builtin', id: app.id })
                        }
                      >
                        <span className="material-icons">build</span>
                        Settings
                      </button>
                      {running ? (
                        <button
                          type="button"
                          className={styles.pill}
                          data-kind="pause"
                          onClick={() => setBuiltinRunning(app.id, false)}
                        >
                          Pause
                          <span className="material-icons">pause</span>
                        </button>
                      ) : (
                        <button
                          type="button"
                          className={styles.pill}
                          data-kind="run"
                          onClick={() => setBuiltinRunning(app.id, true)}
                        >
                          Run
                          <span className="material-icons">
                            play_arrow
                          </span>
                        </button>
                      )}
                    </div>
                  </div>
                )
              })}
              <p className={styles.count}>
                {runningCount} running on the Car Thing
              </p>
            </div>
          ) : (
            <p className={styles.empty}>Loading…</p>
          )
        ) : (
          <div className={styles.grid}>
            {catalog.map(item => (
              <div key={item.id} className={styles.releaseCard}>
                <div className={styles.releaseIcon}>
                  <span className="material-icons">extension</span>
                </div>
                <h3>{item.label}</h3>
                <p>Version {item.version}</p>
                <p>{item.downloads.toLocaleString()} downloads</p>
                <p>Made By {item.author}</p>
                <button
                  type="button"
                  className={styles.downloadBtn}
                  onClick={async () => {
                    setError(null)
                    try {
                      setStaged(
                        await window.api.communityDownload(item.id)
                      )
                    } catch (err) {
                      setError(ipcError(err))
                    }
                  }}
                >
                  Download Latest
                  <span className="material-icons">download</span>
                </button>
                <button
                  type="button"
                  className={styles.ghost}
                  onClick={() =>
                    window.api.communityRemoveRepo(item.id).then(refresh)
                  }
                >
                  Remove
                </button>
              </div>
            ))}
            <button
              type="button"
              className={styles.addCard}
              onClick={() => setAddOpen(true)}
            >
              <span className="material-icons">add</span>
              <span className={styles.addLabel}>Add</span>
            </button>
          </div>
        )}
      </main>

      {addOpen ? (
        <AddRepoOverlay
          onClose={() => setAddOpen(false)}
          onAdded={async () => {
            await refresh()
            setPage('downloads')
          }}
          onStaged={value => {
            setStaged(value)
            setAddOpen(false)
          }}
          onError={setError}
        />
      ) : null}
      {staged ? (
        <SuccessNotification
          staged={staged}
          onClose={() => setStaged(null)}
          onError={setError}
          onInstalled={async () => {
            setStaged(null)
            await refresh()
            setPage('installed')
          }}
        />
      ) : null}
      {error ? (
        <div className={styles.scrim} onClick={() => setError(null)}>
          <div
            className={styles.overlay}
            onClick={e => e.stopPropagation()}
          >
            <h2>There was an error</h2>
            <p className={styles.detailsBody}>{error}</p>
            <div className={styles.overlayActions}>
              <span />
              <button
                type="button"
                className={styles.primary}
                onClick={() => setError(null)}
              >
                Acknowledge
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {details?.kind === 'builtin' ? (
        <AppDetails
          app={BUILTIN.find(a => a.id === details.id)!}
          running={hidden ? !hidden.includes(details.id) : true}
          onClose={() => setDetails(null)}
          onToggle={running => setBuiltinRunning(details.id, running)}
        />
      ) : null}
      {details?.kind === 'community' ? (
        <CommunityDetails
          app={community.find(a => a.id === details.id)!}
          onClose={() => setDetails(null)}
          onChanged={refresh}
        />
      ) : null}
    </div>
  )
}

const AddRepoOverlay: React.FC<{
  onClose: () => void
  onAdded: () => Promise<void>
  onStaged: (value: StagedCommunityApp) => void
  onError: (message: string) => void
}> = ({ onClose, onAdded, onStaged, onError }) => {
  const [repoUrl, setRepoUrl] = useState('')
  const [busy, setBusy] = useState(false)
  const [feedback, setFeedback] = useState<{
    message: string
    success: boolean
  } | null>(null)

  const { processed, valid } = useMemo(
    () => parseRepoUrl(repoUrl),
    [repoUrl]
  )

  async function submit() {
    if (!valid) {
      setFeedback({
        message: `URL ${processed || repoUrl} is not valid!`,
        success: false
      })
      return
    }
    setBusy(true)
    try {
      const added = await window.api.communityAddRepo(repoUrl)
      const first = added[0]
      setFeedback({
        message:
          added.length > 1
            ? `Added ${added.length} apps from ${first.owner}/${first.repo}`
            : `Added ${first.id} successfully`,
        success: true
      })
      await onAdded()
    } catch (err) {
      setFeedback({
        message: ipcError(err),
        success: false
      })
    } finally {
      setBusy(false)
    }
  }

  async function upload() {
    setBusy(true)
    try {
      const result = await window.api.communityPickZip()
      if (result) onStaged(result)
    } catch (err) {
      onError(ipcError(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.overlay} onClick={e => e.stopPropagation()}>
        <h2>Add Repository</h2>
        <label>GitHub Repository</label>
        <p className={styles.hint}>
          Official apps:{' '}
          <button
            type="button"
            className={styles.linkish}
            onClick={() => setRepoUrl('Pramodhsurya/GlanceThing-Apps')}
          >
            Pramodhsurya/GlanceThing-Apps
          </button>
        </p>
        <input
          type="text"
          placeholder="username/repo or repository URL"
          value={repoUrl}
          onChange={e => {
            setRepoUrl(e.target.value)
            setFeedback(null)
          }}
        />
        {repoUrl ? (
          <div className={styles.processed}>
            {processed}
            {!valid ? (
              <div className={styles.invalid}>
                Invalid repository URL format
              </div>
            ) : null}
          </div>
        ) : null}
        {feedback ? (
          <div className={styles.feedback} data-success={feedback.success}>
            {feedback.message}
            {!feedback.success && repoUrl ? (
              <a href={repoUrl} target="_blank" rel="noreferrer">
                Try Downloading Manually
              </a>
            ) : null}
          </div>
        ) : null}
        <div className={styles.overlayActions}>
          <button
            type="button"
            className={styles.ghost}
            disabled={busy}
            onClick={upload}
          >
            <span className="material-icons">upload</span>
            Upload Local File
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!valid || busy}
            onClick={submit}
          >
            {busy ? 'Adding…' : 'Add Repository'}
            <span className="material-icons">arrow_forward</span>
          </button>
        </div>
      </div>
    </div>
  )
}

const SuccessNotification: React.FC<{
  staged: StagedCommunityApp
  onClose: () => void
  onError: (message: string) => void
  onInstalled: () => Promise<void>
}> = ({ staged, onClose, onError, onInstalled }) => {
  const [acked, setAcked] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const ready = staged.issues.every(issue => acked.includes(issue.id))

  async function initialize() {
    if (!ready) return
    setBusy(true)
    try {
      await window.api.communityConfirm()
      await onInstalled()
    } catch (err) {
      setBusy(false)
      onError(ipcError(err))
    }
  }

  return (
    <div className={styles.scrim} onClick={onClose}>
      <div
        className={`${styles.overlay} ${styles.wide}`}
        onClick={e => e.stopPropagation()}
      >
        <h2>
          Successfully Downloaded {staged.manifest.label} v
          {staged.manifest.version}
        </h2>
        <p className={styles.author}>By {staged.manifest.author}</p>
        {staged.issues.length ? (
          <>
            <p className={styles.issuesTitle}>Potential Issues Found</p>
            <div className={styles.issues}>
              {staged.issues.map(issue => {
                const on = acked.includes(issue.id)
                return (
                  <label key={issue.id} className={styles.issue}>
                    <input
                      type="checkbox"
                      checked={on}
                      onChange={() =>
                        setAcked(list =>
                          on
                            ? list.filter(id => id !== issue.id)
                            : [...list, issue.id]
                        )
                      }
                    />
                    <div>
                      <strong>{issue.title}</strong>
                      <p>{issue.message}</p>
                      <span>{on ? 'Acknowledged' : 'Acknowledge?'}</span>
                    </div>
                  </label>
                )
              })}
            </div>
          </>
        ) : null}
        <div className={styles.overlayActions}>
          <button type="button" className={styles.ghost} onClick={onClose}>
            Cancel
          </button>
          <button
            type="button"
            className={styles.primary}
            disabled={!ready || busy}
            onClick={initialize}
          >
            {busy ? 'Installing…' : 'Initialize App'}
          </button>
        </div>
      </div>
    </div>
  )
}

const AppDetails: React.FC<{
  app: (typeof BUILTIN)[number]
  running: boolean
  onClose: () => void
  onToggle: (running: boolean) => void
}> = ({ app, running, onClose, onToggle }) => {
  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.overlay} onClick={e => e.stopPropagation()}>
        <div className={styles.detailsHead}>
          <div
            className={styles.rowIcon}
            style={{ background: app.color }}
          >
            <span className="material-icons">{app.icon}</span>
          </div>
          <div>
            <h2>{app.name}</h2>
            <p className={styles.author}>
              v{app.version} · By {app.author}
            </p>
          </div>
        </div>
        <p className={styles.detailsBody}>{app.description}</p>
        {app.credit ? <p className={styles.hint}>{app.credit}</p> : null}
        <p className={styles.hint}>
          Built-in GlanceThing app. Pause hides it from the Car Thing tray.
        </p>
        <div className={styles.overlayActions}>
          <button type="button" className={styles.ghost} onClick={onClose}>
            Close
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={() => onToggle(!running)}
          >
            {running ? 'Pause' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  )
}

const CommunityDetails: React.FC<{
  app: CommunityInstalledApp
  onClose: () => void
  onChanged: () => Promise<void>
}> = ({ app, onClose, onChanged }) => {
  return (
    <div className={styles.scrim} onClick={onClose}>
      <div className={styles.overlay} onClick={e => e.stopPropagation()}>
        <div className={styles.detailsHead}>
          <div
            className={styles.rowIcon}
            style={{ background: app.color }}
          >
            <span className="material-icons">
              {app.icon || 'extension'}
            </span>
          </div>
          <div>
            <h2>{app.label}</h2>
            <p className={styles.author}>
              v{app.version} · By {app.author}
            </p>
          </div>
        </div>
        <p className={styles.detailsBody}>
          {app.description || 'Community app from GitHub.'}
        </p>
        <p className={styles.hint}>
          {app.hasClient
            ? 'Web UI will open on the Car Thing from this computer.'
            : 'No web UI was found. Pause or purge it if it is not useful.'}
        </p>
        <div className={styles.overlayActions}>
          <button
            type="button"
            className={styles.ghost}
            data-danger="true"
            onClick={async () => {
              await window.api.communityRemove(app.id)
              await onChanged()
              onClose()
            }}
          >
            Purge
          </button>
          <button
            type="button"
            className={styles.primary}
            onClick={async () => {
              await window.api.communitySetEnabled(app.id, !app.enabled)
              await onChanged()
              onClose()
            }}
          >
            {app.enabled ? 'Pause' : 'Run'}
          </button>
        </div>
      </div>
    </div>
  )
}

export default Apps
