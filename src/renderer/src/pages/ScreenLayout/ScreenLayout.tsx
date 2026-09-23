import { useEffect, useRef, useState } from 'react'
import moment from 'moment'

import {
  ActionsFace,
  LayoutFace,
  PlayerFace,
  StatusFace,
  type ItemProps
} from '../../../../../client/src/components/Widgets/Screen'
import { screenStyles } from '../../../../../client/src/components/Widgets/screenModel'

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
  actionIds: string[]
}

interface ActionItem {
  id: string
  label: string
  icon: string
  command: string
}

const KIND_LABELS: Record<TileKind, string> = {
  layout: 'Layout',
  playback: 'Playback',
  actions: 'Actions'
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

const PRESET_ACTIONS: Omit<ActionItem, 'id'>[] = [
  { label: 'Lock', icon: 'lock', command: '__builtin:lock' },
  { label: 'Sleep', icon: 'brightness_3', command: '__builtin:sleep' },
  { label: 'Wake', icon: 'wb_sunny', command: '__builtin:unlock' }
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
      shortcutIds: [],
      actionIds: []
    },
    {
      id: 'layout-main',
      kind: 'layout',
      x: 50,
      y: 0,
      w: 50,
      h: 55,
      shortcutIds: [],
      actionIds: []
    },
    {
      id: 'actions',
      kind: 'actions',
      x: 50,
      y: 55,
      w: 50,
      h: 45,
      shortcutIds: [],
      actionIds: ['lock']
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

function fitTiles(tiles: Tile[]) {
  if (tiles.length === 0) return tiles
  const tolerance = 6

  function stops(points: number[]) {
    const sorted = points.slice().sort((a, b) => a - b)
    const groups: number[][] = []
    for (const value of sorted) {
      const group = groups[groups.length - 1]
      if (!group || value - group[group.length - 1] > tolerance)
        groups.push([value])
      else group.push(value)
    }
    return groups.map(group => {
      const mean =
        group.reduce((total, value) => total + value, 0) / group.length
      if (mean <= tolerance) return 0
      if (mean >= 100 - tolerance) return 100
      return mean
    })
  }

  function nearest(lines: number[], value: number) {
    return lines.reduce((best, line) =>
      Math.abs(value - line) < Math.abs(value - best) ? line : best
    )
  }

  const vertical = stops(tiles.flatMap(tile => [tile.x, tile.x + tile.w]))
  const horizontal = stops(
    tiles.flatMap(tile => [tile.y, tile.y + tile.h])
  )
  return tiles.map(tile => {
    const x = nearest(vertical, tile.x)
    const right = nearest(vertical, tile.x + tile.w)
    const y = nearest(horizontal, tile.y)
    const bottom = nearest(horizontal, tile.y + tile.h)
    const keepX = right - x < 16
    const keepY = bottom - y < 16
    return {
      ...tile,
      x: keepX ? tile.x : x,
      y: keepY ? tile.y : y,
      w: keepX ? tile.w : right - x,
      h: keepY ? tile.h : bottom - y
    }
  })
}

function freeArea(others: Tile[]) {
  if (others.length === 0) return { x: 0, y: 0, w: 100, h: 100 }
  const left = Math.min(...others.map(tile => tile.x))
  const top = Math.min(...others.map(tile => tile.y))
  const right = Math.max(...others.map(tile => tile.x + tile.w))
  const bottom = Math.max(...others.map(tile => tile.y + tile.h))
  const bands = [
    { x: 0, y: 0, w: left, h: 100 },
    { x: right, y: 0, w: 100 - right, h: 100 },
    { x: 0, y: 0, w: 100, h: top },
    { x: 0, y: bottom, w: 100, h: 100 - bottom }
  ].filter(band => band.w >= 16 && band.h >= 16)
  if (bands.length === 0) return { x: 0, y: 0, w: 100, h: 100 }
  return bands.reduce((best, band) =>
    band.w * band.h > best.w * best.h ? band : best
  )
}

function repairTiles(tiles: Tile[], list: Shortcut[]) {
  const broken = (tile: Tile) => tile.w < 5 || tile.h < 5
  if (!tiles.some(broken)) return tiles
  const others = tiles.filter(
    tile => tile.kind !== 'layout' && !broken(tile)
  )
  const fixed = tiles.map(tile => {
    if (!broken(tile) || tile.kind === 'layout') return tile
    const w = Math.max(tile.w, 46)
    const h = Math.max(tile.h, 50)
    return {
      ...tile,
      w,
      h,
      x: clamp(tile.x, 0, 100 - w),
      y: clamp(tile.y, 0, 100 - h)
    }
  })
  if (!tiles.some(tile => tile.kind === 'layout' && broken(tile)))
    return fixed
  return arrangeLayouts(fixed, list, freeArea(others))
}

function layoutArea(tiles: Tile[]) {
  const layouts = tiles.filter(tile => tile.kind === 'layout')
  if (layouts.length === 0) return { x: 0, y: 0, w: 50, h: 100 }
  const x = Math.min(...layouts.map(tile => tile.x))
  const y = Math.min(...layouts.map(tile => tile.y))
  const right = Math.max(...layouts.map(tile => tile.x + tile.w))
  const bottom = Math.max(...layouts.map(tile => tile.y + tile.h))
  return { x, y, w: right - x, h: bottom - y }
}

function shortcutOrder(tiles: Tile[], list: Shortcut[]) {
  const seen = new Set<string>()
  const ordered: string[] = []
  for (const tile of tiles) {
    if (tile.kind !== 'layout') continue
    for (const id of tile.shortcutIds) {
      if (seen.has(id)) continue
      seen.add(id)
      ordered.push(id)
    }
  }
  for (const shortcut of list) {
    if (seen.has(shortcut.id)) continue
    ordered.push(shortcut.id)
  }
  return ordered
}

function spreadShortcuts(tiles: Tile[], ids: string[]) {
  const layouts = tiles.filter(tile => tile.kind === 'layout')
  if (layouts.length === 0) return tiles
  const buckets = layouts.map(() => [] as string[])
  ids.forEach((id, index) => buckets[index % layouts.length].push(id))
  let cursor = 0
  return tiles.map(tile => {
    if (tile.kind !== 'layout') return tile
    const shortcutIds = buckets[cursor]
    cursor += 1
    return { ...tile, shortcutIds }
  })
}

function reflowLayouts(
  tiles: Tile[],
  area: { x: number; y: number; w: number; h: number }
) {
  const count = tiles.filter(tile => tile.kind === 'layout').length
  if (count === 0) return tiles
  const cols = Math.ceil(Math.sqrt(count))
  const rows = Math.ceil(count / cols)
  const cellW = area.w / cols
  const cellH = area.h / rows
  let index = 0
  return tiles.map(tile => {
    if (tile.kind !== 'layout') return tile
    const col = index % cols
    const row = Math.floor(index / cols)
    index += 1
    const w = cellW
    const h = cellH
    return {
      ...tile,
      x: clamp(area.x + col * cellW, 0, Math.max(0, 100 - w)),
      y: clamp(area.y + row * cellH, 0, Math.max(0, 100 - h)),
      w: clamp(w, 16, 100),
      h: clamp(h, 16, 100)
    }
  })
}

function arrangeLayouts(
  tiles: Tile[],
  list: Shortcut[],
  area: { x: number; y: number; w: number; h: number }
) {
  return reflowLayouts(
    spreadShortcuts(tiles, shortcutOrder(tiles, list)),
    area
  )
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
    const actions =
      Array.isArray(stored.actions) && stored.actions.length > 0
        ? stored.actions
        : DEFAULT_ACTIONS
    const tiles = stored.tiles.filter(isTile).map(tile => ({
      ...tile,
      shortcutIds: Array.isArray(tile.shortcutIds) ? tile.shortcutIds : [],
      actionIds: Array.isArray(tile.actionIds) ? tile.actionIds : []
    }))
    const legacyActions = !tiles.some(
      tile => tile.kind === 'actions' && tile.actionIds.length > 0
    )
    const readyTiles = legacyActions
      ? tiles.map(tile =>
          tile.kind === 'actions'
            ? { ...tile, actionIds: actions.map(action => action.id) }
            : tile
        )
      : tiles
    return {
      tiles: readyTiles,
      actions
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
          shortcutIds: [],
          actionIds: []
        })
      } else if (old.kind === 'actions') {
        tiles.push({
          id: old.id || crypto.randomUUID(),
          kind: 'actions',
          ...box,
          shortcutIds: [],
          actionIds: DEFAULT_ACTIONS.map(action => action.id)
        })
      } else if (old.kind === 'shortcut' && old.shortcutId) {
        tiles.push({
          id: old.id || crypto.randomUUID(),
          kind: 'layout',
          ...box,
          shortcutIds: [old.shortcutId],
          actionIds: []
        })
      }
    }
    if (tiles.length > 0) return { tiles, actions: DEFAULT_ACTIONS }
  }

  const tiles = DEFAULT_CONFIG.tiles.map(tile => ({
    ...tile,
    shortcutIds: [...tile.shortcutIds],
    actionIds: [...tile.actionIds]
  }))
  return {
    tiles,
    actions: DEFAULT_ACTIONS.map(action => ({ ...action }))
  }
}

const FRAME_CARDS: {
  kind: TileKind
  icon: string
  label: string
  hint: string
}[] = [
  {
    kind: 'layout',
    icon: 'grid_view',
    label: 'Layout',
    hint: 'App shortcuts'
  },
  {
    kind: 'actions',
    icon: 'touch_app',
    label: 'Actions',
    hint: 'Lock, sleep…'
  },
  {
    kind: 'playback',
    icon: 'music_note',
    label: 'Playback',
    hint: 'Now playing'
  }
]

const CHIP_DRAG_TYPE = 'application/glancething-chip'

type ChipField = 'shortcutIds' | 'actionIds'

type SectionId = 'add' | 'shortcuts' | 'actions'

const SECTION_DEFAULTS: Record<SectionId, boolean> = {
  add: true,
  shortcuts: true,
  actions: true
}

function loadOpenSections(): Record<SectionId, boolean> {
  try {
    const saved = JSON.parse(
      localStorage.getItem('layoutSections') || '{}'
    )
    return { ...SECTION_DEFAULTS, ...saved }
  } catch {
    return { ...SECTION_DEFAULTS }
  }
}

function Section({
  icon,
  title,
  summary,
  warning,
  open,
  onToggle,
  children
}: {
  icon: string
  title: string
  summary?: string
  warning?: boolean
  open: boolean
  onToggle: () => void
  children: React.ReactNode
}) {
  return (
    <section className={styles.section} data-open={open}>
      <button
        type="button"
        className={styles.sectionHead}
        onClick={onToggle}
        aria-expanded={open}
      >
        <span className={`material-icons ${styles.sectionIcon}`}>
          {icon}
        </span>
        <span className={styles.sectionTitle}>
          <strong>{title}</strong>
          {summary ? (
            <small data-warning={warning ? 'true' : 'false'}>
              {summary}
            </small>
          ) : null}
        </span>
        <span className={`material-icons ${styles.chevron}`}>
          expand_more
        </span>
      </button>
      {open ? <div className={styles.sectionBody}>{children}</div> : null}
    </section>
  )
}

const ScreenLayout: React.FC = () => {
  const canvasRef = useRef<HTMLDivElement>(null)
  const skipSave = useRef(true)
  const dragPayload = useRef('')
  const [chipDrag, setChipDrag] = useState<{
    tileId: string
    id: string
  } | null>(null)
  const [chipDrop, setChipDrop] = useState<string | null>(null)
  const [shortcuts, setShortcuts] = useState<Shortcut[]>([])
  const [config, setConfig] = useState<ScreenConfig>(DEFAULT_CONFIG)
  const stageRef = useRef<HTMLDivElement>(null)
  const [screenScale, setScreenScale] = useState(0.7)

  useEffect(() => {
    const node = stageRef.current
    if (!node) return
    const measure = () => {
      const byWidth = (node.clientWidth - 36) / 800
      const byHeight = (node.clientHeight - 150) / 480
      setScreenScale(Math.max(0.35, Math.min(1, byWidth, byHeight)))
    }
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])
  const [clock, setClock] = useState(Date.now())
  const [timeFormat, setTimeFormat] = useState('HH:mm')
  const [dateFormat, setDateFormat] = useState('ddd, D MMM')

  useEffect(() => {
    window.api.getStorageValue('timeFormat').then(value => {
      if (typeof value === 'string' && value) setTimeFormat(value)
    })
    window.api.getStorageValue('dateFormat').then(value => {
      if (typeof value === 'string' && value) setDateFormat(value)
    })
    const timer = setInterval(() => setClock(Date.now()), 20 * 1000)
    return () => clearInterval(timer)
  }, [])
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
  const [openSections, setOpenSections] = useState(loadOpenSections)

  function toggleSection(id: SectionId) {
    setOpenSections(current => {
      const next = { ...current, [id]: !current[id] }
      localStorage.setItem('layoutSections', JSON.stringify(next))
      return next
    })
  }

  useEffect(() => {
    Promise.all([
      window.api.getStorageValue('screenLayout'),
      window.api.getShortcuts()
    ]).then(([layout, loadedShortcuts]) => {
      const loaded = loadConfig(layout)
      const tiles = repairTiles(loaded.tiles, loadedShortcuts || [])
      if (tiles !== loaded.tiles) skipSave.current = false
      setConfig({ ...loaded, tiles: fitTiles(tiles) })
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
      shortcutIds: [],
      actionIds: []
    }
    if (kind !== 'layout') {
      updateTiles(current => fitTiles([...current, tile]))
      return
    }
    skipSave.current = false
    setConfig(current => {
      const existing = current.tiles
      const area = existing.some(item => item.kind === 'layout')
        ? layoutArea(existing)
        : { x: tile.x, y: tile.y, w: tile.w, h: tile.h }
      return {
        ...current,
        tiles: fitTiles(
          arrangeLayouts([...existing, tile], shortcuts, area)
        )
      }
    })
  }

  function addActionsLayout() {
    const index = config.tiles.filter(
      tile => tile.kind === 'actions'
    ).length
    addFrame('actions', 72, 28 + (index % 4) * 16)
  }

  function addFrameCard(kind: TileKind) {
    if (kind === 'actions') addActionsLayout()
    else if (kind === 'playback') {
      if (!hasTile('playback')) addFrame('playback', 25, 50)
    } else addFrame('layout', 25, 50)
  }

  function placeAction(layoutId: string, actionId: string) {
    updateTiles(current =>
      current.map(tile => {
        if (tile.kind !== 'actions') return tile
        const without = tile.actionIds.filter(id => id !== actionId)
        if (tile.id !== layoutId) return { ...tile, actionIds: without }
        return { ...tile, actionIds: [...without, actionId] }
      })
    )
  }

  function moveChip(
    tileId: string,
    field: ChipField,
    fromId: string,
    toId: string
  ) {
    if (fromId === toId) return
    updateTiles(current =>
      current.map(tile => {
        if (tile.id !== tileId) return tile
        const ids = [...tile[field]]
        const from = ids.indexOf(fromId)
        const to = ids.indexOf(toId)
        if (from < 0 || to < 0) return tile
        ids.splice(from, 1)
        ids.splice(to, 0, fromId)
        return { ...tile, [field]: ids }
      })
    )
  }

  function chipProps(tile: Tile, id: string, field: ChipField) {
    const dragging = chipDrag?.id === id && chipDrag.tileId === tile.id
    let drop: 'before' | 'after' | undefined
    if (
      chipDrag &&
      chipDrop === id &&
      chipDrag.tileId === tile.id &&
      !dragging
    ) {
      const ids = tile[field]
      drop =
        ids.indexOf(chipDrag.id) < ids.indexOf(id) ? 'after' : 'before'
    }
    return {
      'data-role': 'chip',
      'data-dragging': dragging,
      'data-drop': drop,
      draggable: true,
      title: 'Drag to reorder, or onto another frame to move',
      onDragStart: (e: React.DragEvent<HTMLElement>) => {
        e.stopPropagation()
        e.dataTransfer.effectAllowed = 'move'
        e.dataTransfer.setData(CHIP_DRAG_TYPE, id)
        if (field === 'shortcutIds') {
          e.dataTransfer.setData('application/glancething-shortcut', id)
        } else {
          dragPayload.current = `action:${id}`
        }
        setChipDrag({ tileId: tile.id, id })
      },
      onDragOver: (e: React.DragEvent<HTMLElement>) => {
        if (!chipDrag || chipDrag.tileId !== tile.id) return
        e.preventDefault()
        e.stopPropagation()
        e.dataTransfer.dropEffect = 'move'
        if (chipDrop !== id) setChipDrop(id)
      },
      onDrop: (e: React.DragEvent<HTMLElement>) => {
        if (!chipDrag || chipDrag.tileId !== tile.id) return
        e.preventDefault()
        e.stopPropagation()
        moveChip(tile.id, field, chipDrag.id, id)
        endChipDrag()
      },
      onDragEnd: endChipDrag
    }
  }

  function removeChip(tileId: string, field: ChipField, id: string) {
    updateTiles(current =>
      current.map(item =>
        item.id === tileId
          ? { ...item, [field]: item[field].filter(value => value !== id) }
          : item
      )
    )
  }

  function faceItem(tile: Tile, field: ChipField) {
    return {
      itemProps: (id: string): ItemProps => ({
        ...chipProps(tile, id, field),
        className: styles.faceItem
      }),
      itemExtra: (id: string) => (
        <button
          type="button"
          data-role="chip-remove"
          className={styles.itemRemove}
          title="Remove from this frame"
          draggable={false}
          onPointerDown={e => e.stopPropagation()}
          onClick={e => {
            e.stopPropagation()
            removeChip(tile.id, field, id)
          }}
        >
          <span className="material-icons">close</span>
        </button>
      )
    }
  }

  function renderFace(tile: Tile) {
    if (tile.kind === 'layout') {
      const images: Record<string, string> = {}
      tile.shortcutIds.forEach(id => {
        images[id] = `shortcut://${id}`
      })
      return (
        <LayoutFace
          shortcutIds={tile.shortcutIds}
          images={images}
          {...faceItem(tile, 'shortcutIds')}
        />
      )
    }
    if (tile.kind === 'actions') {
      const visible = tile.actionIds
        .map(id => config.actions.find(action => action.id === id))
        .filter((action): action is ActionItem => !!action)
      return (
        <ActionsFace actions={visible} {...faceItem(tile, 'actionIds')} />
      )
    }
    return <PlayerFace />
  }

  function endChipDrag() {
    setChipDrag(null)
    setChipDrop(null)
    setDropTarget(null)
    dragPayload.current = ''
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
    if (role === 'remove' || role === 'chip-remove' || role === 'chip')
      return
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
            let w = Math.max(origin.w + dx, 18)
            let h = Math.max(origin.h + dy, 18)
            let x = origin.x
            let y = origin.y
            if (x + w > 100) x = Math.max(0, 100 - w)
            if (y + h > 100) y = Math.max(0, 100 - h)
            if (w > 100) w = 100
            if (h > 100) h = 100
            return { ...item, x, y, w, h }
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
      updateTiles(current => fitTiles(current))
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
    skipSave.current = false
    setConfig(current => {
      const existing = current.tiles
      const layouts = existing.filter(tile => tile.kind === 'layout')
      if (layouts.length === 0) {
        return {
          ...current,
          tiles: [
            ...existing,
            {
              id: crypto.randomUUID(),
              kind: 'layout' as const,
              x: 0,
              y: 0,
              w: 50,
              h: 100,
              shortcutIds: [shortcut.id],
              actionIds: []
            }
          ]
        }
      }
      const target = layouts.reduce((best, tile) =>
        tile.shortcutIds.length < best.shortcutIds.length ? tile : best
      )
      return {
        ...current,
        tiles: existing.map(tile =>
          tile.id === target.id
            ? { ...tile, shortcutIds: [...tile.shortcutIds, shortcut.id] }
            : tile
        )
      }
    })
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

  function addAction(preset?: Omit<ActionItem, 'id'>) {
    skipSave.current = false
    setConfig(current => ({
      ...current,
      actions: [
        ...current.actions,
        {
          id: crypto.randomUUID(),
          label: preset?.label || 'New action',
          icon: preset?.icon || 'bolt',
          command: preset?.command || ''
        }
      ]
    }))
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

  const unplacedActions = config.actions.filter(
    action =>
      !config.tiles.some(
        tile =>
          tile.kind === 'actions' && tile.actionIds.includes(action.id)
      )
  ).length
  return (
    <div className={styles.page}>
      <aside className={styles.palette}>
        <div className={styles.paletteBody}>
          <div className={styles.intro}>
            <h1>Layout</h1>
            <p>
              Build what the Car Thing shows. Changes save automatically.
            </p>
          </div>

          <Section
            icon="add_box"
            title="Add to screen"
            summary={`${config.tiles.length} ${config.tiles.length === 1 ? 'frame' : 'frames'}`}
            open={openSections.add}
            onToggle={() => toggleSection('add')}
          >
            <p className={styles.hint}>
              Click to add to the screen, or drag onto the preview.
            </p>
            <div className={styles.frameGrid}>
              {FRAME_CARDS.map(card => {
                const used =
                  card.kind === 'playback' && hasTile('playback')
                return (
                  <div
                    key={card.kind}
                    role="button"
                    tabIndex={used ? -1 : 0}
                    aria-disabled={used}
                    className={styles.frameCard}
                    data-used={used}
                    title={used ? 'Already on the screen' : card.hint}
                    draggable={!used}
                    onDragStart={e =>
                      e.dataTransfer.setData(
                        'application/glancething-frame',
                        JSON.stringify({ kind: card.kind })
                      )
                    }
                    onClick={() => {
                      if (!used) addFrameCard(card.kind)
                    }}
                    onKeyDown={e => {
                      if (used || (e.key !== 'Enter' && e.key !== ' '))
                        return
                      e.preventDefault()
                      addFrameCard(card.kind)
                    }}
                  >
                    <span className="material-icons">{card.icon}</span>
                    <strong>{card.label}</strong>
                    <small>{used ? 'Added' : card.hint}</small>
                  </div>
                )
              })}
            </div>
          </Section>

          <Section
            icon="apps"
            title="Shortcuts"
            summary={`${shortcuts.length} ${shortcuts.length === 1 ? 'shortcut' : 'shortcuts'}`}
            open={openSections.shortcuts}
            onToggle={() => toggleSection('shortcuts')}
          >
            <p className={styles.hint}>
              Drag one onto a Layout frame in the preview.
            </p>
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
          </Section>

          <Section
            icon="touch_app"
            title="Actions"
            summary={
              unplacedActions > 0
                ? `${config.actions.length} actions · ${unplacedActions} not placed`
                : `${config.actions.length} ${config.actions.length === 1 ? 'action' : 'actions'}`
            }
            warning={unplacedActions > 0}
            open={openSections.actions}
            onToggle={() => toggleSection('actions')}
          >
            <p className={styles.hint}>
              Drag the handle onto an Actions frame. Icon names come from
              Material Icons.
            </p>
            <div className={styles.actions}>
              {config.actions.map(action => (
                <div key={action.id} className={styles.action}>
                  <span
                    className={`${styles.drag} material-icons`}
                    draggable
                    onDragStart={e => {
                      e.stopPropagation()
                      dragPayload.current = `action:${action.id}`
                      e.dataTransfer.effectAllowed = 'copy'
                      e.dataTransfer.setData(
                        'text/plain',
                        dragPayload.current
                      )
                    }}
                    onDragEnd={() => {
                      dragPayload.current = ''
                      setDropTarget(null)
                    }}
                  >
                    drag_indicator
                  </span>
                  {!config.tiles.some(
                    tile =>
                      tile.kind === 'actions' &&
                      tile.actionIds.includes(action.id)
                  ) ? (
                    <em className={styles.unplaced}>
                      Not on a layout yet
                    </em>
                  ) : null}
                  <input
                    className={styles.iconField}
                    type="text"
                    value={action.icon}
                    aria-label="Icon"
                    placeholder="icon"
                    title="Icon"
                    onChange={e =>
                      updateAction(action.id, { icon: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    className={styles.labelField}
                    value={action.label}
                    aria-label="Label"
                    placeholder="Label"
                    title="Label"
                    onChange={e =>
                      updateAction(action.id, { label: e.target.value })
                    }
                  />
                  <input
                    type="text"
                    className={styles.commandField}
                    value={action.command}
                    aria-label="Command"
                    placeholder="Command to run on the Mac"
                    title="Command"
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
                        tiles: current.tiles.map(tile => ({
                          ...tile,
                          actionIds: tile.actionIds.filter(
                            value => value !== action.id
                          )
                        })),
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
            </div>
            <div className={styles.row}>
              <select
                className={styles.preset}
                aria-label="Ready-made actions"
                value=""
                onChange={e => {
                  const preset = PRESET_ACTIONS[Number(e.target.value)]
                  if (preset) addAction(preset)
                }}
              >
                <option value="">Add a ready-made action</option>
                {PRESET_ACTIONS.map((preset, index) => (
                  <option key={preset.label} value={index}>
                    {preset.label}
                  </option>
                ))}
              </select>
              <button className={styles.add} onClick={() => addAction()}>
                Custom
              </button>
            </div>
          </Section>
        </div>
        <div className={styles.footer}>
          <p className={styles.status}>
            {saved && !refreshing ? 'Saved to the Car Thing' : status}
          </p>
          <div className={styles.row}>
            <button
              className={styles.refresh}
              onClick={refreshDevice}
              disabled={refreshing}
            >
              <span className="material-icons">refresh</span>
              {refreshing ? 'Refreshing…' : 'Refresh Car Thing'}
            </button>
            <button
              className={styles.reset}
              title="Reset the layout"
              onClick={() => {
                if (
                  !window.confirm('Reset the whole layout to the default?')
                ) {
                  return
                }
                skipSave.current = false
                setConfig(loadConfig(null))
              }}
            >
              Reset
            </button>
          </div>
        </div>
      </aside>

      <div className={styles.stage} ref={stageRef}>
        <div className={styles.device}>
          <div
            className={styles.viewport}
            style={{ width: 800 * screenScale, height: 480 * screenScale }}
          >
            <div
              className={styles.screen}
              style={{ transform: `scale(${screenScale})` }}
            >
              <StatusFace
                time={moment(clock).format(timeFormat)}
                date={moment(clock).format(dateFormat)}
              />
              <div className={screenStyles.widgets}>
                <div
                  className={screenStyles.board}
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
                      className={`${screenStyles.placed} ${styles.frame}`}
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
                        const payload = dragPayload.current
                        const acceptsAction =
                          tile.kind === 'actions' &&
                          payload.startsWith('action:')
                        const acceptsShortcut =
                          tile.kind === 'layout' &&
                          e.dataTransfer.types.includes(
                            'application/glancething-shortcut'
                          )
                        if (acceptsAction || acceptsShortcut) {
                          e.preventDefault()
                          e.stopPropagation()
                          e.dataTransfer.dropEffect = 'copy'
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
                        const actionId = dragPayload.current.startsWith(
                          'action:'
                        )
                          ? dragPayload.current.slice('action:'.length)
                          : ''
                        if (shortcutId && tile.kind === 'layout') {
                          e.preventDefault()
                          e.stopPropagation()
                          setDropTarget(null)
                          placeShortcut(tile.id, shortcutId)
                        }
                        if (actionId && tile.kind === 'actions') {
                          e.preventDefault()
                          e.stopPropagation()
                          dragPayload.current = ''
                          setDropTarget(null)
                          placeAction(tile.id, actionId)
                        }
                      }}
                    >
                      {renderFace(tile)}
                      <span className={styles.frameOutline} />
                      <span className={styles.frameBadge}>
                        {KIND_LABELS[tile.kind]}
                      </span>
                      {tile.kind === 'layout' &&
                      tile.shortcutIds.length === 0 ? (
                        <em className={styles.frameHint}>
                          Drop shortcuts here
                        </em>
                      ) : null}
                      {tile.kind === 'actions' &&
                      tile.actionIds.length === 0 ? (
                        <em className={styles.frameHint}>
                          Drop actions here
                        </em>
                      ) : null}
                      <button
                        data-role="remove"
                        className={styles.remove}
                        onPointerDown={e => e.stopPropagation()}
                        onClick={() => {
                          if (tile.kind !== 'layout') {
                            updateTiles(current =>
                              current.filter(item => item.id !== tile.id)
                            )
                            return
                          }
                          skipSave.current = false
                          setConfig(current => ({
                            ...current,
                            tiles: arrangeLayouts(
                              current.tiles.filter(
                                item => item.id !== tile.id
                              ),
                              shortcuts,
                              layoutArea(current.tiles)
                            )
                          }))
                        }}
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
        </div>
      </div>
    </div>
  )
}

export default ScreenLayout
