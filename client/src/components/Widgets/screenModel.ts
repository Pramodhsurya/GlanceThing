import styles from './Widgets.module.css'

export const screenStyles = styles

export type TileKind = 'layout' | 'playback' | 'actions' | 'weather'

export interface Tile {
  id: string
  kind: TileKind
  x: number
  y: number
  w: number
  h: number
  shortcutIds?: string[]
  actionIds?: string[]
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

export interface ScreenConfig {
  tiles: Tile[]
  pages?: ScreenPage[]
  actions: ActionItem[]
  weather?: WeatherInfo
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
