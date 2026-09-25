import styles from './Widgets.module.css'

export const screenStyles = styles

export type TileKind =
  | 'layout'
  | 'playback'
  | 'actions'
  | 'calendar'
  | 'weather'
  | 'usage'
  | 'photos'

export type UsageTarget = 'all' | 'codex' | 'claude' | 'cursor'

/** Overview layouts from the redesign. `auto` picks by tile size. */
export type UsageStyle =
  | 'auto'
  | 'cards'
  | 'tinted'
  | 'list'
  | 'rings'
  | 'mini'

export const USAGE_NAMES: Record<UsageTarget, string> = {
  all: 'AI usage',
  codex: 'Codex',
  claude: 'Claude',
  cursor: 'Cursor'
}

export const USAGE_STYLES: {
  id: UsageStyle
  label: string
  detail: string
}[] = [
  {
    id: 'cards',
    label: 'Cards + dial',
    detail: 'Full screen — dial for the lowest limit'
  },
  {
    id: 'tinted',
    label: 'Tinted cards',
    detail: 'Full screen — brand-tinted panels'
  },
  {
    id: 'list',
    label: 'List rows',
    detail: 'Half screen — compact bars'
  },
  {
    id: 'rings',
    label: 'Rings',
    detail: 'Wide strip — one ring per subscription'
  },
  {
    id: 'mini',
    label: 'Compact',
    detail: 'Quarter — one bar per subscription'
  }
]

export interface Tile {
  id: string
  kind: TileKind
  x: number
  y: number
  w: number
  h: number
  shortcutIds?: string[]
  actionIds?: string[]
  provider?: UsageTarget
  usageStyle?: UsageStyle
}

export interface UsageWindow {
  label: string
  left: number
  resetsAt: string | null
}

export interface UsageProvider {
  id: string
  name: string
  plan?: string
  status?: 'ok' | 'stale' | 'off'
  message?: string
  windows?: UsageWindow[]
  notes?: string[]
  cost?: {
    today: number
    todayTokens: number
    month: number
    monthTokens: number
    days: number[]
  }
  updatedAt?: string
}

export interface AiUsageInfo {
  providers?: UsageProvider[]
  updatedAt?: string
}

export interface ActionItem {
  id: string
  label: string
  icon: string
  command: string
}

export interface ScreenPage {
  id?: string
  tiles?: Tile[]
}

export interface CalendarEvent {
  title: string
  start: string
  end: string
  where?: string
  when?: string
  day?: number
  startMin?: number
  endMin?: number
  online?: boolean
  organizer?: string
  canceled?: boolean
  canJoin?: boolean
}

export interface CalendarInfo {
  source?: string
  events?: CalendarEvent[]
  message?: string
}

export interface WeatherInfo {
  query?: string
  place?: string
  temp?: number | null
  unit?: string
  label?: string
  icon?: string
  high?: number | null
  low?: number | null
  feels?: number | null
  humidity?: number | null
  wind?: number | null
  windUnit?: string
  windDir?: string
  rain?: number | null
  tomorrowDay?: string
  tomorrowHigh?: number | null
  tomorrowLow?: number | null
  days?: WeatherDay[]
  isDay?: boolean
  hours?: WeatherHour[]
  message?: string
}

export interface WeatherHour {
  time: string
  temp: number | null
  icon: string
  kind?: 'hour' | 'sunrise' | 'sunset'
}

export interface WeatherDay {
  date?: string
  day?: string
  high?: number | null
  low?: number | null
  icon?: string
  label?: string
  rain?: number | null
}

export interface PhotosInfo {
  count?: number
  rotateMs?: number
  shuffle?: boolean
  image?: string
  fit?: 'fill' | 'fit'
  message?: string
}

export interface ScreenConfig {
  tiles: Tile[]
  pages?: ScreenPage[]
  actions: ActionItem[]
  calendar?: CalendarInfo
  weather?: WeatherInfo
  aiUsage?: AiUsageInfo
  photos?: PhotosInfo
  dialNavigation?: boolean
  dialMode?: 'pages' | 'items' | 'both'
}

export interface AppShortcut {
  id: string
  path?: string
}

export function fitTiles(tiles: Tile[]) {
  if (tiles.length === 0) return tiles
  const tolerance = 6

  function stops(points: number[]) {
    const sorted = points.slice().sort((a, b) => a - b)
    const groups: number[][] = []
    for (let i = 0; i < sorted.length; i += 1) {
      const value = sorted[i]
      const group = groups[groups.length - 1]
      if (!group || value - group[group.length - 1] > tolerance)
        groups.push([value])
      else group.push(value)
    }
    return groups.map(group => {
      let total = 0
      for (let i = 0; i < group.length; i += 1) total += group[i]
      const mean = total / group.length
      if (mean <= tolerance) return 0
      if (mean >= 100 - tolerance) return 100
      return mean
    })
  }

  function nearest(lines: number[], value: number) {
    let best = lines[0]
    let distance = Math.abs(value - best)
    for (let i = 1; i < lines.length; i += 1) {
      const next = Math.abs(value - lines[i])
      if (next < distance) {
        best = lines[i]
        distance = next
      }
    }
    return best
  }

  const vertical = stops(
    tiles.reduce((points: number[], tile) => {
      points.push(tile.x, tile.x + tile.w)
      return points
    }, [])
  )
  const horizontal = stops(
    tiles.reduce((points: number[], tile) => {
      points.push(tile.y, tile.y + tile.h)
      return points
    }, [])
  )

  return tiles
    .map(tile => {
      const x = nearest(vertical, tile.x)
      const right = nearest(vertical, tile.x + tile.w)
      const y = nearest(horizontal, tile.y)
      const bottom = nearest(horizontal, tile.y + tile.h)
      const keepX = right - x < 8
      const keepY = bottom - y < 8
      return {
        ...tile,
        x: keepX ? tile.x : x,
        y: keepY ? tile.y : y,
        w: keepX ? tile.w : right - x,
        h: keepY ? tile.h : bottom - y
      }
    })
    .filter(tile => tile.w >= 5 && tile.h >= 5)
}
