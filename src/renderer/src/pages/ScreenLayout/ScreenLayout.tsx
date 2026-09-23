import { useEffect, useRef, useState } from 'react'

import styles from './ScreenLayout.module.css'

type TileKind = 'layout' | 'playback' | 'actions'

interface Tile {
  id: string
  kind: TileKind
  x: number
  y: number
  w: number
  h: number
  shortcutIds: string[]
}

interface ActionItem {
  id: string
  label: string
  icon: string
  command: string
}

interface ScreenConfig {
  tiles: Tile[]
  actions: ActionItem[]
}

interface Shortcut {
  id: string
  command: string
}

const DEFAULT_ACTIONS: ActionItem[] = [
  { id: 'lock', label: 'Lock', icon: 'lock', command: '__builtin:lock' }
]

const DEFAULT_CONFIG: ScreenConfig = {
  tiles: [
    {
      id: 'playback',
      kind: 'playback',
      x: 0,
      y: 0,
      w: 50,
      h: 100,
      shortcutIds: []
    },
    {
      id: 'layout-main',
      kind: 'layout',
      x: 50,
      y: 0,
      w: 50,
      h: 55,
      shortcutIds: []
    },
    {
      id: 'actions',
      kind: 'actions',
      x: 50,
      y: 55,
      w: 50,
      h: 45,
      shortcutIds: []
    }
  ],
  actions: DEFAULT_ACTIONS
}

function shortcutLabel(command: string) {
  const cleaned = command.replace(/^open\s+-a\s+/i, '').replace(/"/g, '')
  return cleaned.length > 18 ? `${cleaned.slice(0, 18)}…` : cleaned
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function isTile(value: unknown): value is Tile {
  if (!value || typeof value !== 'object') return false
  const tile = value as Tile
  return (
    typeof tile.id === 'string' &&
    typeof tile.x === 'number' &&
    (tile.kind === 'layout' ||
      tile.kind === 'playback' ||
      tile.kind === 'actions')
  )
}

function loadConfig(value: unknown): ScreenConfig {
  if (
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Array.isArray((value as ScreenConfig).tiles)
  ) {
    const stored = value as ScreenConfig
    return {
      tiles: stored.tiles.filter(isTile).map(tile => ({
        ...tile,
        shortcutIds: Array.isArray(tile.shortcutIds)
          ? tile.shortcutIds
          : []
      })),
      actions:
        Array.isArray(stored.actions) && stored.actions.length > 0
          ? stored.actions
          : DEFAULT_ACTIONS
    }
  }

  if (Array.isArray(value)) {
    const tiles: Tile[] = []
    for (const item of value) {
      if (!item || typeof item !== 'object') continue
      const old = item as {
        id?: string
        kind?: string
        shortcutId?: string
        x?: number
        y?: number
        w?: number
        h?: number
      }
      const box = {
        x: old.x ?? 0,
        y: old.y ?? 0,
        w: old.w ?? 40,
        h: old.h ?? 40
      }
      if (old.kind === 'player') {
        tiles.push({
          id: old.id || crypto.randomUUID(),
          kind: 'playback',
          ...box,
          shortcutIds: []
        })
      } else if (old.kind === 'actions') {
        tiles.push({
          id: old.id || crypto.randomUUID(),
          kind: 'actions',
          ...box,
          shortcutIds: []
        })
      } else if (old.kind === 'shortcut' && old.shortcutId) {
        tiles.push({
          id: old.id || crypto.randomUUID(),
          kind: 'layout',
          ...box,
          shortcutIds: [old.shortcutId]
        })
      }
    }
    if (tiles.length > 0) return { tiles, actions: DEFAULT_ACTIONS }
  }

  return {
    tiles: DEFAULT_CONFIG.tiles.map(tile => ({
      ...tile,
      shortcutIds: []
    })),
    actions: DEFAULT_ACTIONS.map(action => ({ ...action }))
  }
}

const ScreenLayout: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null)
  const skipSave = useRef(true)
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([])
  const [config, setConfig] = useState<ScreenConfig>(DEFAULT_CONFIG)
  const [saved, setSaved] = useState(false)
  const [dropTarget, setDropTarget] = useState<string | null>(null)
  const [addingShortcut, setAddingShortcut] = useState(false)
  const [newCommand, setNewCommand] = useState('')
  const [hasImage, setHasImage] = useState(false)
  const [imageVersion, setImageVersion] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [status, setStatus] = useState(
    'Drag the corner of a frame to resize'
  )

  useEffect(() => {
    Promise.all([
      window.api.getStorageValue('screenLayout'),
      window.api.getShortcuts()
    ]).then(([layout, loadedShortcuts]) => {
      setConfig(loadConfig(layout))
      setShortcuts(loadedShortcuts || [])
      setTimeout(() => {
        skipSave.current = false
      }, 0)
    })
  }, [])

  useEffect(() => {
    if (skipSave.current) return
    const timer = setTimeout(() => {
      window.api.setStorageValue('screenLayout', config).then(() => {
        setSaved(true)
        setStatus('Saved to the Car Thing')
        setTimeout(() => setSaved(false), 1200)
      })
    }, 250)
    return () => clearTimeout(timer)
  }, [config])

  function updateTiles(next: Tile[] | ((current: Tile[]) => Tile[])) {
    skipSave.current = false
    setConfig(current => ({
      ...current,
      tiles: typeof next === 'function' ? next(current.tiles) : next
    }))
  }

  function hasTile(kind: 'playback' | 'actions') {
    return config.tiles.some(tile => tile.kind === kind)
  }

  function addFrame(kind: TileKind, x: number, y: number) {
    const w = kind === 'layout' ? 42 : 46
    const h = kind === 'layout' ? 48 : 50
    const tile: Tile = {
      id: crypto.randomUUID(),
      kind,
      x: clamp(x - w / 2, 0, 100 - w),
      y: clamp(y - h / 2, 0, 100 - h),
      w,
      h,
      shortcutIds: []
    }
    updateTiles(current => [...current, tile])
  }

  function onCanvasDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    const raw = e.dataTransfer.getData('application/glancething-frame')
    if (!raw || !canvasRef.current) return
    const spec = JSON.parse(raw) as { kind: TileKind }
    const rect = canvasRef.current.getBoundingClientRect()
    addFrame(
      spec.kind,
      ((e.clientX - rect.left) / rect.width) * 100,
      ((e.clientY - rect.top) / rect.height) * 100
    )
  }

  function placeShortcut(layoutId: string, shortcutId: string) {
    updateTiles(current =>
      current.map(tile => {
        if (tile.kind !== 'layout') return tile
        const without = tile.shortcutIds.filter(id => id !== shortcutId)
        if (tile.id !== layoutId) return { ...tile, shortcutIds: without }
        return { ...tile, shortcutIds: [...without, shortcutId] }
      })
    )
  }

  function onFramePointerDown(
    e: React.PointerEvent<HTMLDivElement>,
    tile: Tile
  ) {
    const role = (e.target as HTMLElement)
      .closest('[data-role]')
      ?.getAttribute('data-role')
    if (role === 'remove' || role === 'chip-remove') return
    if (!canvasRef.current) return
    e.preventDefault()
    e.stopPropagation()
    const rect = canvasRef.current.getBoundingClientRect()
    const startX = e.clientX
    const startY = e.clientY
    const origin = { ...tile }
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)

    function onMove(ev: Event) {
      const point = ev as PointerEvent
      const dx = ((point.clientX - startX) / rect.width) * 100
      const dy = ((point.clientY - startY) / rect.height) * 100
      updateTiles(current =>
        current.map(item => {
          if (item.id !== tile.id) return item
          if (role === 'resize') {
            return {
              ...item,
              w: clamp(origin.w + dx, 18, 100 - origin.x),
              h: clamp(origin.h + dy, 18, 100 - origin.y)
            }
          }
          return {
            ...item,
            x: clamp(origin.x + dx, 0, 100 - item.w),
            y: clamp(origin.y + dy, 0, 100 - item.h)
          }
        })
      )
    }

    function onUp(ev: Event) {
      const point = ev as PointerEvent
      handle.removeEventListener('pointermove', onMove)
      handle.removeEventListener('pointerup', onUp)
      if (handle.hasPointerCapture(point.pointerId))
        handle.releasePointerCapture(point.pointerId)
    }

    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('pointerup', onUp)
  }

  async function refreshDevice() {
    setRefreshing(true)
    setStatus('Refreshing the Car Thing…')
    try {
      const loaded = await window.api.getShortcuts()
      setShortcuts(loaded || [])
      await window.api.refreshCarThing()
      setStatus('Car Thing refreshed')
    } catch {
      setStatus('Refresh failed')
    } finally {
      setRefreshing(false)
    }
  }

  async function addShortcut() {
    if (!newCommand || !hasImage) return
    const shortcut = { id: crypto.randomUUID(), command: newCommand }
    await window.api.addShortcut(shortcut)
    setShortcuts(current => [...current, shortcut])
    setAddingShortcut(false)
    setNewCommand('')
    setHasImage(false)
    await refreshDevice()
  }

  async function cancelAddShortcut() {
    await window.api.removeNewShortcutImage()
    setAddingShortcut(false)
    setNewCommand('')
    setHasImage(false)
  }

  function updateAction(id: string, patch: Partial<ActionItem>) {
    skipSave.current = false
    setConfig(current => ({
      ...current,
      actions: current.actions.map(action =>
        action.id === id ? { ...action, ...patch } : action
      )
    }))
  }

  return (
    <div className={styles.page}>
      <aside className={styles.palette}>
        <div className={styles.paletteBody}>
          <h1>Layout</h1>
          <p>
            Layouts are empty frames. Drop shortcuts inside a frame.
            Playback and Actions are separate tiles you can resize.
          </p>

          <h2>Frames</h2>
          <div
            className={styles.item}
            draggable
            onDragStart={e =>
              e.dataTransfer.setData(
                'application/glancething-frame',
                JSON.stringify({ kind: 'layout' })
              )
            }
          >
            <span className="material-icons">crop_square</span>
            Empty layout
          </div>
          <div
            className={styles.item}
            draggable={!hasTile('playback')}
            data-used={hasTile('playback')}
            onDragStart={e =>
              e.dataTransfer.setData(
                'application/glancething-frame',
                JSON.stringify({ kind: 'playback' })
              )
            }
          >
            <span className="material-icons">music_note</span>
            Playback
          </div>
          <div
            className={styles.item}
            draggable={!hasTile('actions')}
            data-used={hasTile('actions')}
            onDragStart={e =>
              e.dataTransfer.setData(
                'application/glancething-frame',
                JSON.stringify({ kind: 'actions' })
              )
            }
          >
            <span className="material-icons">touch_app</span>
            Actions
          </div>

          <h2>Shortcuts</h2>
          <p>Drag one onto an empty layout.</p>
          <div className={styles.list}>
            {shortcuts.map(shortcut => (
              <div
                key={shortcut.id}
                className={styles.item}
                draggable
                onDragStart={e =>
                  e.dataTransfer.setData(
                    'application/glancething-shortcut',
                    shortcut.id
                  )
                }
              >
                <img src={`shortcut://${shortcut.id}`} alt="" />
                {shortcutLabel(shortcut.command)}
              </div>
            ))}
          </div>
          {addingShortcut ? (
            <div className={styles.addForm}>
              <button
                className={styles.upload}
                onClick={async () => {
                  const res = await window.api.uploadShortcutImage('new')
                  if (!res) return
                  setHasImage(true)
                  setImageVersion(Date.now())
                }}
              >
                {hasImage ? (
                  <img src={`shortcut://new?${imageVersion}`} alt="" />
                ) : (
                  <span className="material-icons">upload</span>
                )}
                Image
              </button>
              <input
                type="text"
                placeholder="Command"
                value={newCommand}
                aria-label="Shortcut command"
                onChange={e => setNewCommand(e.target.value)}
              />
              <div className={styles.formButtons}>
                <button onClick={cancelAddShortcut}>Cancel</button>
                <button
                  onClick={addShortcut}
                  disabled={!newCommand || !hasImage || refreshing}
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <button
              className={styles.add}
              onClick={() => setAddingShortcut(true)}
            >
              Add shortcut
            </button>
          )}

          <h2>Actions</h2>
          <div className={styles.actions}>
            {config.actions.map(action => (
              <div key={action.id} className={styles.action}>
                <input
                  type="text"
                  value={action.icon}
                  aria-label="Icon"
                  onChange={e =>
                    updateAction(action.id, { icon: e.target.value })
                  }
                />
                <input
                  type="text"
                  value={action.label}
                  aria-label="Label"
                  onChange={e =>
                    updateAction(action.id, { label: e.target.value })
                  }
                />
                <input
                  type="text"
                  value={action.command}
                  aria-label="Command"
                  onChange={e =>
                    updateAction(action.id, { command: e.target.value })
                  }
                />
                <button
                  className={styles.iconButton}
                  onClick={() => {
                    skipSave.current = false
                    setConfig(current => ({
                      ...current,
                      actions: current.actions.filter(
                        item => item.id !== action.id
                      )
                    }))
                  }}
                >
                  <span className="material-icons">close</span>
                </button>
              </div>
            ))}
            <button
              className={styles.add}
              onClick={() => {
                skipSave.current = false
                setConfig(current => ({
                  ...current,
                  actions: [
                    ...current.actions,
                    {
                      id: crypto.randomUUID(),
                      label: 'New action',
                      icon: 'bolt',
                      command: ''
                    }
                  ]
                }))
              }}
            >
              Add action
            </button>
          </div>

          <button
            className={styles.reset}
            onClick={() => {
              skipSave.current = false
              setConfig(loadConfig(null))
            }}
          >
            Reset
          </button>
        </div>
        <div className={styles.footer}>
          <button
            className={styles.refresh}
            onClick={refreshDevice}
            disabled={refreshing}
          >
            <span className="material-icons">refresh</span>
            {refreshing ? 'Refreshing…' : 'Refresh'}
          </button>
          <p className={styles.status}>
            {saved && !refreshing ? 'Saved to the Car Thing' : status}
          </p>
        </div>
      </aside>

      <div className={styles.stage}>
        <div className={styles.device}>
          <div className={styles.statusBar}>GlanceThing</div>
          <div
            className={styles.canvas}
            ref={canvasRef}
            onDragOver={e => {
              if (
                e.dataTransfer.types.includes(
                  'application/glancething-frame'
                )
              ) {
                e.preventDefault()
              }
            }}
            onDrop={onCanvasDrop}
          >
            {config.tiles.map(tile => (
              <div
                key={tile.id}
                className={styles.tile}
                data-kind={tile.kind}
                data-hot={dropTarget === tile.id}
                style={{
                  left: `${tile.x}%`,
                  top: `${tile.y}%`,
                  width: `${tile.w}%`,
                  height: `${tile.h}%`
                }}
                onPointerDown={e => onFramePointerDown(e, tile)}
                onDragOver={e => {
                  if (
                    tile.kind === 'layout' &&
                    e.dataTransfer.types.includes(
                      'application/glancething-shortcut'
                    )
                  ) {
                    e.preventDefault()
                    e.stopPropagation()
                    setDropTarget(tile.id)
                  }
                }}
                onDragLeave={() =>
                  setDropTarget(current =>
                    current === tile.id ? null : current
                  )
                }
                onDrop={e => {
                  const shortcutId = e.dataTransfer.getData(
                    'application/glancething-shortcut'
                  )
                  if (!shortcutId || tile.kind !== 'layout') return
                  e.preventDefault()
                  e.stopPropagation()
                  setDropTarget(null)
                  placeShortcut(tile.id, shortcutId)
                }}
              >
                <strong>
                  {tile.kind === 'layout'
                    ? 'Layout'
                    : tile.kind === 'playback'
                      ? 'Playback'
                      : 'Actions'}
                </strong>
                {tile.kind === 'layout' ? (
                  <div className={styles.chips}>
                    {tile.shortcutIds.length === 0 ? (
                      <em>Drop shortcuts here</em>
                    ) : (
                      tile.shortcutIds.map(id => {
                        const shortcut = shortcuts.find(
                          item => item.id === id
                        )
                        return (
                          <span key={id} className={styles.chip}>
                            {shortcut
                              ? shortcutLabel(shortcut.command)
                              : 'Shortcut'}
                            <button
                              data-role="chip-remove"
                              onPointerDown={e => e.stopPropagation()}
                              onClick={() =>
                                updateTiles(current =>
                                  current.map(item =>
                                    item.id === tile.id
                                      ? {
                                          ...item,
                                          shortcutIds:
                                            item.shortcutIds.filter(
                                              value => value !== id
                                            )
                                        }
                                      : item
                                  )
                                )
                              }
                            >
                              ×
                            </button>
                          </span>
                        )
                      })
                    )}
                  </div>
                ) : null}
                <button
                  data-role="remove"
                  className={styles.remove}
                  onPointerDown={e => e.stopPropagation()}
                  onClick={() =>
                    updateTiles(current =>
                      current.filter(item => item.id !== tile.id)
                    )
                  }
                >
                  <span className="material-icons">close</span>
                </button>
                <div data-role="resize" className={styles.resize} />
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export default ScreenLayout
