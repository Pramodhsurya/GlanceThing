import React, { useEffect, useRef, useState } from 'react'

import {
  macClockSynced,
  macDayFromToday,
  macMinuteOfDay,
  macWeekday
} from '../../lib/macClock'

import BaseWidget from './widgets/BaseWidget/BaseWidget'
import {
  USAGE_NAMES,
  type ActionItem,
  type AiUsageInfo,
  type CalendarEvent,
  type CalendarInfo,
  type UsageProvider,
  type UsageStyle,
  type UsageTarget,
  type UsageWindow,
  type WeatherInfo,
  type PhotosInfo
} from './screenModel'

import styles from './Widgets.module.css'
import playerStyles from './widgets/Player/Player.module.css'
import statusStyles from '../Statusbar/Statusbar.module.css'

// Drawn identically on the Car Thing and in the Mac app's layout preview,
// so imports stay relative and nothing here talks to the socket.

function columnsForShape(count: number, width: number, height: number) {
  if (count <= 1) return 1
  if (width <= 0 || height <= 0) return count
  const cell = width / count
  if (cell >= height * 0.85) return count
  if (count <= 4) return 2
  if (count <= 9) return 3
  return 4
}

export type ItemProps = React.HTMLAttributes<HTMLElement> & {
  [data: `data-${string}`]: string | boolean | undefined
}

interface ItemHooks {
  itemProps?: (id: string) => ItemProps
  itemExtra?: (id: string) => React.ReactNode
}

function mergeItem(
  base: string,
  extra: ItemProps | undefined
): ItemProps & { className: string } {
  return {
    ...(extra || {}),
    className:
      extra && extra.className ? base + ' ' + extra.className : base
  }
}

export const LayoutFace: React.FC<
  {
    shortcutIds: string[]
    images: Record<string, string>
    tileId: string
    selectedKey: string
    onOpen?: (id: string) => void
  } & ItemHooks
> = ({
  shortcutIds,
  images,
  tileId,
  selectedKey,
  onOpen,
  itemProps,
  itemExtra
}) => {
  const tileRef = useRef<HTMLDivElement>(null)
  const [columns, setColumns] = useState(Math.max(shortcutIds.length, 1))

  useEffect(() => {
    const node = tileRef.current
    if (!node) return

    const measure = () => {
      setColumns(
        columnsForShape(
          shortcutIds.length,
          node.clientWidth,
          node.clientHeight
        )
      )
    }

    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [shortcutIds.length])

  const rows = Math.max(1, Math.ceil(shortcutIds.length / columns))
  const Item = itemProps ? 'div' : 'button'

  return (
    <BaseWidget
      ref={tileRef}
      className={styles.layoutTile}
      style={{
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`
      }}
    >
      {shortcutIds.map(id => (
        <Item
          key={id}
          data-selected={selectedKey === tileId + ':' + id}
          data-dial-selected={
            selectedKey === tileId + ':' + id ? 'true' : 'false'
          }
          onClick={onOpen ? () => onOpen(id) : undefined}
          {...mergeItem(styles.app, itemProps ? itemProps(id) : undefined)}
        >
          {images[id] ? (
            <img src={images[id]} alt="" draggable={false} />
          ) : null}
          {itemExtra ? itemExtra(id) : null}
        </Item>
      ))}
    </BaseWidget>
  )
}

export const ActionsFace: React.FC<
  {
    actions: ActionItem[]
    tileId: string
    selectedKey: string
    onRun?: (action: ActionItem) => void
  } & ItemHooks
> = ({ actions, tileId, selectedKey, onRun, itemProps, itemExtra }) => {
  const Item = itemProps ? 'div' : 'button'
  return (
    <BaseWidget className={styles.actions}>
      {actions.map(action => (
        <Item
          key={action.id}
          data-type={
            action.command === '__builtin:lock' ? 'lock' : undefined
          }
          data-selected={selectedKey === tileId + ':' + action.id}
          data-dial-selected={
            selectedKey === tileId + ':' + action.id ? 'true' : 'false'
          }
          onClick={onRun ? () => onRun(action) : undefined}
          {...mergeItem(
            styles.action,
            itemProps ? itemProps(action.id) : undefined
          )}
        >
          <span className="material-icons">{action.icon || 'bolt'}</span>
          <p>{action.label}</p>
          {itemExtra ? itemExtra(action.id) : null}
        </Item>
      ))}
    </BaseWidget>
  )
}

export const PlayerFace: React.FC = () => (
  <BaseWidget className={playerStyles.player}>
    <div className={playerStyles.notPlaying}>
      <span className="material-icons">music_note</span>
      <p className={playerStyles.title}>Nothing playing!</p>
      <p className={playerStyles.note}>
        Start playing something on your computer.
      </p>
    </div>
  </BaseWidget>
)

export const StatusFace: React.FC<{ time: string; date: string }> = ({
  time,
  date
}) => (
  <div className={statusStyles.statusbar}>
    <div className={statusStyles.timedate}>
      <div className={statusStyles.time}>{time}</div>
      <div className={statusStyles.date}>{date}</div>
    </div>
  </div>
)

function hourLabel(minutes: number) {
  let hour = Math.floor(minutes / 60)
  const suffix = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12 || 12
  return hour + ' ' + suffix
}

function placeLanes(events: CalendarEvent[]) {
  const sorted = events
    .slice()
    .sort(
      (a, b) =>
        (a.startMin || 0) - (b.startMin || 0) ||
        (a.endMin || 0) - (b.endMin || 0)
    )
  const result: { event: CalendarEvent; lane: number; lanes: number }[] =
    []
  let group: { event: CalendarEvent; lane: number; lanes: number }[] = []
  let laneEnds: number[] = []
  let groupEnd = -1
  const closeGroup = () => {
    group.forEach(item => {
      item.lanes = Math.max(1, laneEnds.length)
    })
    result.push(...group)
    group = []
    laneEnds = []
  }
  sorted.forEach(event => {
    const start = event.startMin || 0
    const end = event.endMin || start + 30
    if (start >= groupEnd) closeGroup()
    let lane = laneEnds.findIndex(laneEnd => laneEnd <= start)
    if (lane < 0) {
      lane = laneEnds.length
      laneEnds.push(end)
    } else {
      laneEnds[lane] = end
    }
    groupEnd = Math.max(groupEnd, end)
    group.push({ event, lane, lanes: 1 })
  })
  closeGroup()
  return result
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

function timedEvents(events: CalendarEvent[], now: number) {
  if (!macClockSynced()) {
    return events.filter(
      event =>
        typeof event.startMin === 'number' &&
        typeof event.endMin === 'number'
    )
  }
  const placed: CalendarEvent[] = []
  events.forEach(event => {
    const start = Date.parse(event.start)
    const end = Date.parse(event.end)
    if (Number.isNaN(start) || Number.isNaN(end)) return
    const day = macDayFromToday(start, now)
    if (day < 0 || day > 1) return
    const startMin = macMinuteOfDay(start)
    const endMin =
      macDayFromToday(end, now) > day ? 24 * 60 : macMinuteOfDay(end)
    placed.push({
      ...event,
      day,
      startMin,
      endMin: Math.max(endMin, startMin + 15)
    })
  })
  return placed
}

export const CalendarFace: React.FC<{
  calendar?: CalendarInfo
  now: number
  onJoin?: (event: CalendarEvent) => void
}> = ({ calendar, now, onJoin }) => {
  const events = timedEvents(calendar?.events || [], now)
  const ready = events.length > 0
  let gridStart = 7 * 60
  let gridEnd = 19 * 60
  if (ready) {
    const earliest = Math.min(
      ...events.map(event => event.startMin || gridStart)
    )
    const latest = Math.max(
      ...events.map(event => event.endMin || gridEnd)
    )
    gridStart = Math.min(gridStart, Math.floor(earliest / 60) * 60)
    gridEnd = Math.max(gridEnd, Math.ceil(latest / 60) * 60)
  }
  const span = gridEnd - gridStart
  const hourPx = 96
  const scrollRef = useRef<HTMLDivElement>(null)
  const userScrollAt = useRef(0)
  const autoScrolling = useRef(false)
  const synced = macClockSynced()
  const nowMin = synced ? macMinuteOfDay(now) : -1
  const showNow = synced && nowMin >= gridStart && nowMin <= gridEnd

  useEffect(() => {
    const node = scrollRef.current
    if (!node || Date.now() - userScrollAt.current < 2 * 60 * 1000) return
    const anchor = synced ? Math.max(nowMin, gridStart) : gridStart
    const target = Math.max(0, ((anchor - gridStart - 45) / 60) * hourPx)
    if (Math.abs(node.scrollTop - target) < 2) return
    autoScrolling.current = true
    node.scrollTop = target
  }, [ready, gridStart, events.length, nowMin, synced])

  function onScroll() {
    if (autoScrolling.current) {
      autoScrolling.current = false
      return
    }
    userScrollAt.current = Date.now()
  }

  const hours: number[] = []
  for (let minute = gridStart; minute < gridEnd; minute += 60)
    hours.push(minute)
  const dayTitle = (day: number) => {
    const label = day === 0 ? 'Today' : 'Tomorrow'
    if (synced)
      return label + ' ' + WEEKDAYS[macWeekday(now + day * 86400000)]
    const sample = events.find(event => (event.day || 0) === day)
    const name = sample?.when?.split(' ')[0]
    return label + (name ? ' ' + name : '')
  }
  const nowMs = synced ? now : 0

  return (
    <BaseWidget className={styles.calendar}>
      <p className={styles.calendarTitle}>Calendar</p>
      {!ready ? (
        <p className={styles.calendarEmpty}>
          {calendar?.message || 'No events'}
        </p>
      ) : (
        <>
          <div className={styles.dayHeads}>
            <span className={styles.hourSpacer} />
            <span>{dayTitle(0)}</span>
            <span>{dayTitle(1)}</span>
          </div>
          <div
            ref={scrollRef}
            className={styles.timeScroll}
            data-scroll="calendar"
            onScroll={onScroll}
          >
            <div
              className={styles.timeGrid}
              style={{ height: (span / 60) * hourPx + 'px' }}
            >
              <div className={styles.hourCol}>
                {hours.map(minute => (
                  <span
                    key={minute}
                    style={{
                      top: ((minute - gridStart) / span) * 100 + '%'
                    }}
                  >
                    {hourLabel(minute)}
                  </span>
                ))}
              </div>
              {[0, 1].map(day => (
                <div key={day} className={styles.dayCol}>
                  {hours.map(minute => (
                    <span
                      key={minute}
                      className={styles.hourLine}
                      style={{
                        top: ((minute - gridStart) / span) * 100 + '%'
                      }}
                    />
                  ))}
                  {day === 0 && showNow ? (
                    <span
                      className={styles.nowLine}
                      style={{
                        top: ((nowMin - gridStart) / span) * 100 + '%'
                      }}
                    />
                  ) : null}
                  {placeLanes(
                    events.filter(event => (event.day || 0) === day)
                  ).map(({ event, lane, lanes }) => {
                    const canceled =
                      event.canceled === true ||
                      /^Canceled:/i.test(event.title)
                    const title = event.title
                      .replace(/^Canceled:\s*/i, '')
                      .trim()
                    const start = Date.parse(event.start)
                    const end = Date.parse(event.end)
                    const state = !nowMs
                      ? 'later'
                      : end <= nowMs
                        ? 'past'
                        : start <= nowMs
                          ? 'now'
                          : 'later'
                    const place = event.online
                      ? 'Microsoft Teams Meeting'
                      : event.where || ''
                    const joinable =
                      event.canJoin === true &&
                      !canceled &&
                      state !== 'past' &&
                      start - nowMs <= 15 * 60 * 1000
                    return (
                      <div
                        key={event.start + event.title}
                        className={styles.block}
                        data-canceled={canceled ? 'true' : 'false'}
                        data-state={state}
                        style={{
                          top:
                            (((event.startMin || 0) - gridStart) / span) *
                              100 +
                            '%',
                          height:
                            (((event.endMin || 0) -
                              (event.startMin || 0)) /
                              span) *
                              100 +
                            '%',
                          left: (lane / lanes) * 100 + '%',
                          width: 100 / lanes + '%'
                        }}
                      >
                        {joinable ? (
                          <button
                            className={styles.blockJoin}
                            onClick={e => {
                              e.stopPropagation()
                              if (onJoin) onJoin(event)
                            }}
                          >
                            Join
                          </button>
                        ) : null}
                        <p className={styles.blockTitle}>
                          {canceled ? 'Canceled: ' : ''}
                          {title}
                        </p>
                        {place ? (
                          <p className={styles.blockMeta}>{place}</p>
                        ) : null}
                        {event.organizer &&
                        (!place ||
                          (event.endMin || 0) - (event.startMin || 0) >=
                            45) ? (
                          <p className={styles.blockMeta}>
                            {event.organizer}
                          </p>
                        ) : null}
                      </div>
                    )
                  })}
                </div>
              ))}
            </div>
          </div>
        </>
      )}
    </BaseWidget>
  )
}

function weatherLine(value: number | null | undefined, prefix: string) {
  if (typeof value !== 'number' || Number.isNaN(value)) return ''
  return prefix + Math.round(value) + '°'
}

function weatherTone(icon: string) {
  if (icon === 'sunny' || icon === 'wb_sunny' || icon === 'wb_twilight') {
    return 'sun'
  }
  if (icon === 'water_drop' || icon === 'grain') return 'rain'
  return ''
}

function weatherSky(weather?: WeatherInfo) {
  if (weather?.isDay === false) return 'night'
  const icon = weather?.icon || ''
  return icon === 'sunny' || icon === 'wb_sunny' || icon === 'filter_drama'
    ? 'clear'
    : 'cloudy'
}

export const WeatherFace: React.FC<{ weather?: WeatherInfo }> = ({
  weather
}) => {
  const ready = typeof weather?.temp === 'number'
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [fontPx, setFontPx] = useState(16)
  const [hidden, setHidden] = useState(0)
  const wide = box.h > 0 && box.w / box.h >= 1.6
  const hourSlots = Math.max(
    2,
    Math.min(6, Math.floor((box.w - fontPx * 1.8) / (fontPx * 3.5)))
  )
  const hours = (weather?.hours || []).slice(0, hourSlots)

  useEffect(() => {
    const node = boxRef.current
    if (!node) return
    const measure = () => {
      const w = node.clientWidth
      const h = node.clientHeight
      setBox(current =>
        current.w === w && current.h === h ? current : { w, h }
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  useEffect(() => {
    if (!box.w || !box.h) return
    // Rough em budget of the content, refined by the shrink step below.
    const guess = Math.min(box.h / 10.2, box.w / (wide ? 17 : 12))
    setHidden(0)
    setFontPx(Math.max(12, Math.min(44, Math.floor(guess))))
  }, [box, wide, weather])

  useEffect(() => {
    const node = boxRef.current
    if (!node || !box.w) return
    let overflow =
      node.scrollHeight > node.clientHeight + 1 ||
      node.scrollWidth > node.clientWidth + 1
    const lines = node.querySelectorAll('p, div')
    for (let i = 0; i < lines.length && !overflow; i += 1) {
      const line = lines[i] as HTMLElement
      if (
        line.clientWidth > 0 &&
        line.scrollWidth > line.clientWidth + 1
      ) {
        overflow = true
      }
    }
    if (!overflow) return
    if (fontPx > 12) setFontPx(Math.max(12, Math.floor(fontPx * 0.93)))
    else if (hidden < 1) setHidden(hidden + 1)
  }, [box, fontPx, hidden, weather])

  return (
    <BaseWidget
      ref={boxRef}
      className={styles.weather}
      data-hidden={hidden}
      data-wide={wide ? 'true' : 'false'}
      data-sky={weatherSky(weather)}
      style={{ fontSize: fontPx + 'px' }}
    >
      <div className={styles.weatherTop}>
        <div className={styles.weatherLeft}>
          <p className={styles.weatherPlace}>
            {weather?.place || 'Weather'}
            {weather?.query ? null : (
              <span className={'material-icons ' + styles.weatherPin}>
                near_me
              </span>
            )}
          </p>
          {ready ? (
            <strong className={styles.weatherTemp}>
              {Math.round(weather?.temp || 0)}°
            </strong>
          ) : null}
        </div>
        <div className={styles.weatherRight}>
          {ready ? (
            <span
              className={'material-icons ' + styles.weatherIcon}
              data-tone={weatherTone(weather?.icon || '')}
            >
              {weather?.icon || 'cloud'}
            </span>
          ) : null}
          <p className={styles.weatherLabel}>
            {ready
              ? weather?.label
              : weather?.message || 'Loading weather'}
          </p>
          {ready ? (
            <p className={styles.weatherRange}>
              {weatherLine(weather?.high, 'H:')}
              {weather?.high != null && weather?.low != null ? ' ' : ''}
              {weatherLine(weather?.low, 'L:')}
            </p>
          ) : null}
        </div>
      </div>
      {ready && hours.length > 0 ? (
        <div className={styles.weatherHours}>
          {hours.map((hour, index) => (
            <div className={styles.weatherHour} key={index + hour.time}>
              <span>{hour.time}</span>
              <span
                className={'material-icons ' + styles.weatherIcon}
                data-tone={weatherTone(hour.icon)}
              >
                {hour.icon}
              </span>
              <strong>{weatherLine(hour.temp, '')}</strong>
            </div>
          ))}
        </div>
      ) : null}
    </BaseWidget>
  )
}
const USAGE_COLORS: Record<string, string> = {
  codex: '#00f59b',
  claude: '#ff7b2e',
  cursor: '#4f9dff'
}

const RED = '#ff4d5e'
const AMBER = '#ffc043'

type UsageTier = 'full' | 'tall' | 'wide' | 'quarter'

type LimitMetric = {
  label: string
  left: number
  pct: string
  numColor: string
  fill: string
  glow: string
  width: string
  track: string
  low: boolean
  reset: string
  resetsAt: string | null
}

function money(value: number) {
  return (
    '$' + (value >= 100 ? Math.round(value).toString() : value.toFixed(2))
  )
}

function tokenText(value: number) {
  if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B'
  if (value >= 1e6) return Math.round(value / 1e6) + 'M'
  if (value >= 1e3) return Math.round(value / 1e3) + 'K'
  return '0'
}

function rgba(hex: string, alpha: number) {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return 'rgba(' + r + ',' + g + ',' + b + ',' + alpha + ')'
}

function resetDuration(iso: string | null, now: number) {
  if (!iso) return null
  const ms = Date.parse(iso) - now
  if (Number.isNaN(ms) || ms <= 0) return null
  const minutes = Math.floor(ms / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  const mins = minutes % 60
  if (days > 0) return days + 'd ' + hours + 'h'
  if (hours > 0) return hours + 'h ' + mins + 'm'
  return Math.max(1, mins) + 'm'
}

function resetText(iso: string | null, now: number) {
  if (!iso) return 'No scheduled reset'
  const duration = resetDuration(iso, now)
  return duration ? 'Resets in ' + duration : 'Resetting now'
}

function updatedAgo(iso: string | undefined, now: number) {
  if (!iso) return 'Updated recently'
  const ms = now - Date.parse(iso)
  if (Number.isNaN(ms) || ms < 60000) return 'Updated just now'
  const minutes = Math.floor(ms / 60000)
  if (minutes < 60) return 'Updated ' + minutes + 'm ago'
  const hours = Math.floor(minutes / 60)
  return 'Updated ' + hours + 'h ago'
}

function metricFor(
  window: UsageWindow,
  brand: string,
  now: number
): LimitMetric {
  const left = Math.max(0, Math.min(100, Number(window.left) || 0))
  const low = left < 15
  const mid = !low && left < 30
  const fill = low ? RED : brand
  return {
    label: window.label,
    left,
    pct: String(Math.round(left)),
    numColor: low ? RED : mid ? AMBER : '#fff',
    fill,
    glow: left > 0 ? '0 0 0.7em ' + rgba(fill, 0.5) : 'none',
    width: left + '%',
    track: low ? 'rgba(255,77,94,0.16)' : 'rgba(255,255,255,0.08)',
    low,
    reset: resetText(window.resetsAt, now),
    resetsAt: window.resetsAt
  }
}

function overviewLimits(
  windows: UsageWindow[],
  brand: string,
  now: number
) {
  if (windows.length === 0) return [] as LimitMetric[]
  const metrics = windows.map(window => metricFor(window, brand, now))
  if (metrics.length <= 2) return metrics
  let lowest = metrics[1]
  for (let i = 2; i < metrics.length; i += 1) {
    if (metrics[i].left < lowest.left) lowest = metrics[i]
  }
  return [metrics[0], lowest]
}

function lowestMetric(metrics: LimitMetric[]) {
  if (metrics.length === 0) return null
  let lowest = metrics[0]
  for (let i = 1; i < metrics.length; i += 1) {
    if (metrics[i].left < lowest.left) lowest = metrics[i]
  }
  return lowest
}

function usageTier(width: number, height: number): UsageTier {
  if (!width || !height) return 'full'
  const ratio = width / height
  if (width >= 560 && height >= 300) return 'full'
  if (height >= 300 && ratio < 1.35) return 'tall'
  if (width >= 560 && height < 300) return 'wide'
  return 'quarter'
}

function overviewLayout(
  style: UsageStyle | undefined,
  tier: UsageTier
): 'cards' | 'tinted' | 'list' | 'rings' | 'mini' {
  if (style && style !== 'auto') return style
  if (tier === 'tall') return 'list'
  if (tier === 'wide') return 'rings'
  if (tier === 'quarter') return 'mini'
  return 'cards'
}

function UsageRing({
  pct,
  label,
  stroke,
  numColor,
  size,
  strokeWidth,
  centerLabel
}: {
  pct: string
  label?: string
  stroke: string
  numColor: string
  size: string
  strokeWidth: string
  centerLabel?: boolean
}) {
  const left = Math.max(0, Math.min(100, Number(pct) || 0))
  const dash = (263.9 * left) / 100
  const glow =
    left > 0
      ? 'drop-shadow(0 0 0.35em ' + rgba(stroke, 0.55) + ')'
      : 'none'
  return (
    <div
      className={styles.usageRing}
      style={{ width: size, height: size }}
    >
      <svg className={styles.usageRingSvg}>
        <circle
          cx="50%"
          cy="50%"
          r="42%"
          style={{
            fill: 'none',
            stroke: 'rgba(255,255,255,0.08)',
            strokeWidth
          }}
        />
      </svg>
      <svg
        className={styles.usageRingSvg}
        style={{ transform: 'rotate(-90deg)', filter: glow }}
      >
        <circle
          cx="50%"
          cy="50%"
          r="42%"
          style={{
            fill: 'none',
            stroke,
            strokeWidth,
            strokeLinecap: 'round',
            strokeDasharray: dash.toFixed(1) + '% 300%'
          }}
        />
      </svg>
      <div className={styles.usageRingCenter}>
        <span style={{ color: numColor }}>{pct}%</span>
        {centerLabel && label ? <small>{label} left</small> : null}
      </div>
    </div>
  )
}

function UsageBarFill({
  width,
  fill,
  glow,
  track,
  height
}: {
  width: string
  fill: string
  glow?: string
  track: string
  height: string
}) {
  return (
    <div
      className={styles.usageBar}
      style={{ height, background: track, borderRadius: '999px' }}
    >
      <span
        style={{
          width,
          background: fill,
          boxShadow: glow || 'none',
          borderRadius: '999px'
        }}
      />
    </div>
  )
}

function SpendChart({
  days,
  color,
  tall
}: {
  days: number[]
  color: string
  tall?: boolean
}) {
  const peak = Math.max(1, ...days)
  return (
    <div
      className={styles.usageChart}
      data-tall={tall ? 'true' : 'false'}
      data-empty={days.some(value => value > 0) ? 'false' : 'true'}
    >
      {days.map((value, index) => (
        <span
          key={index}
          style={{
            height: Math.max(5, Math.round((value / peak) * 100)) + '%',
            background: color,
            opacity: index === days.length - 1 ? 1 : value ? 0.5 : 0.22
          }}
        />
      ))}
    </div>
  )
}

export const UsageFace: React.FC<{
  usage?: AiUsageInfo
  target?: UsageTarget
  usageStyle?: UsageStyle
  compact?: boolean
  now: number
}> = ({
  usage,
  target = 'all',
  usageStyle = 'auto',
  compact = false,
  now
}) => {
  const all = usage?.providers || []
  const providers =
    target === 'all' ? all : all.filter(provider => provider.id === target)
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })

  useEffect(() => {
    const node = boxRef.current
    if (!node) return
    const measure = () => {
      const w = node.clientWidth
      const h = node.clientHeight
      setBox(current =>
        current.w === w && current.h === h ? current : { w, h }
      )
    }
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const observer = new ResizeObserver(measure)
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  const tier = usageTier(box.w, box.h)
  const layout = overviewLayout(usageStyle, tier)
  const base =
    tier === 'full' ? 16 : tier === 'tall' ? 14 : tier === 'wide' ? 12 : 11
  const loading = !usage
  const provider = target === 'all' ? null : providers[0]
  const brand = USAGE_COLORS[target] || '#9fb4ff'

  if (target !== 'all') {
    return (
      <ProviderUsage
        boxRef={boxRef}
        base={compact ? Math.min(base, 12) : base}
        tier={tier}
        provider={provider || undefined}
        brand={brand}
        name={USAGE_NAMES[target]}
        loading={loading}
        compact={compact}
        now={now}
      />
    )
  }

  const anyStale = providers.some(item => item.status === 'stale')
  const staleIso = providers.find(item => item.updatedAt)?.updatedAt
  const headRight =
    layout === 'cards' || layout === 'tinted' || layout === 'rings'
      ? 'lowest limit'
      : '% left'

  return (
    <BaseWidget
      ref={boxRef}
      className={styles.usage}
      data-layout={layout}
      data-tier={tier}
      style={{ fontSize: base + 'px' }}
    >
      <div className={styles.usageHeadRow}>
        <span className={styles.usageTitle}>AI usage</span>
        {anyStale ? (
          <span className={styles.usageChipStale}>
            {updatedAgo(staleIso, now)}
          </span>
        ) : loading ? (
          <span className={styles.usageMutedHead}>Loading usage…</span>
        ) : (
          <span className={styles.usageMutedHead}>{headRight}</span>
        )}
      </div>
      <div
        className={styles.usageBody}
        style={{ opacity: anyStale ? 0.5 : 1 }}
      >
        {loading ? (
          <OverviewLoading layout={layout} />
        ) : providers.length === 0 ? (
          <p className={styles.usageMuted}>No subscriptions found</p>
        ) : layout === 'cards' || layout === 'tinted' ? (
          <OverviewCards
            providers={providers}
            tinted={layout === 'tinted'}
            now={now}
          />
        ) : layout === 'list' ? (
          <OverviewList providers={providers} now={now} />
        ) : layout === 'rings' ? (
          <OverviewRings providers={providers} now={now} />
        ) : (
          <OverviewMini providers={providers} now={now} />
        )}
      </div>
    </BaseWidget>
  )
}

function OverviewLoading({
  layout
}: {
  layout: 'cards' | 'tinted' | 'list' | 'rings' | 'mini'
}) {
  if (layout === 'cards' || layout === 'tinted') {
    return (
      <div className={styles.usageCards}>
        {[0, 1, 2].map(i => (
          <div key={i} className={styles.usageCard}>
            <div
              className={styles.usageSkeleton}
              style={{ width: '40%' }}
            />
            <div className={styles.usageSkeletonRing} />
            <div className={styles.usageSkeleton} />
          </div>
        ))}
      </div>
    )
  }
  return (
    <div className={styles.usageList}>
      {[0, 1, 2].map(i => (
        <div key={i} className={styles.usageListRow}>
          <div className={styles.usageSkeleton} style={{ width: '30%' }} />
          <div className={styles.usageSkeleton} style={{ flex: 1 }} />
        </div>
      ))}
    </div>
  )
}

function OverviewCards({
  providers,
  tinted,
  now
}: {
  providers: UsageProvider[]
  tinted: boolean
  now: number
}) {
  return (
    <div className={styles.usageCards}>
      {providers.map(item => {
        const brand = USAGE_COLORS[item.id] || '#9fb4ff'
        const off =
          item.status === 'off' || (item.windows || []).length === 0
        const metrics = overviewLimits(item.windows || [], brand, now)
        const lead = lowestMetric(metrics)
        const others = metrics.filter(metric => metric !== lead)
        const low = !!lead && lead.low
        const cost = item.cost
        const border = low
          ? 'rgba(255,77,94,0.55)'
          : tinted
            ? rgba(brand, 0.28)
            : 'rgba(255,255,255,0.08)'
        const tint = tinted
          ? 'linear-gradient(180deg,' +
            rgba(brand, 0.2) +
            ',' +
            rgba(brand, 0.08) +
            ')'
          : 'rgba(255,255,255,0.02)'
        return (
          <div
            key={item.id}
            className={styles.usageCard}
            style={{ borderColor: border, background: tint }}
          >
            <div className={styles.usageCardTop}>
              <div className={styles.usageNameLine}>
                <strong style={{ color: brand }}>{item.name}</strong>
                {item.plan ? <small>{item.plan}</small> : null}
              </div>
              {low ? (
                <span className={styles.usageLowPill}>LOW</span>
              ) : null}
            </div>
            {off ? (
              <div className={styles.usageOffBox}>
                <div>Not connected</div>
                <small>
                  {item.message ||
                    'Sign in to ' + item.name + ' to see usage'}
                </small>
              </div>
            ) : lead ? (
              <>
                <div className={styles.usageDialWrap}>
                  <UsageRing
                    pct={lead.pct}
                    label={lead.label}
                    stroke={lead.fill}
                    numColor={lead.numColor}
                    size="6.75em"
                    strokeWidth="9%"
                    centerLabel
                  />
                </div>
                {others.map(metric => (
                  <div key={metric.label} className={styles.usageSideBar}>
                    <span>{metric.label}</span>
                    <UsageBarFill
                      width={metric.width}
                      fill={metric.fill}
                      track={metric.track}
                      height="0.4375em"
                    />
                    <b style={{ color: metric.numColor }}>{metric.pct}%</b>
                  </div>
                ))}
                {cost ? (
                  <div className={styles.usageCardSpend}>
                    <div>
                      <span>Today</span>
                      <b>{money(cost.today)}</b>
                      <small>{tokenText(cost.todayTokens)} tokens</small>
                    </div>
                    <div>
                      <span>30 days</span>
                      <b>{money(cost.month)}</b>
                      <small>{tokenText(cost.monthTokens)} tokens</small>
                    </div>
                    <SpendChart days={cost.days || []} color={brand} />
                  </div>
                ) : null}
              </>
            ) : null}
          </div>
        )
      })}
    </div>
  )
}

function OverviewList({
  providers,
  now
}: {
  providers: UsageProvider[]
  now: number
}) {
  return (
    <div className={styles.usageList}>
      {providers.map((item, index) => {
        const brand = USAGE_COLORS[item.id] || '#9fb4ff'
        const off =
          item.status === 'off' || (item.windows || []).length === 0
        const metrics = overviewLimits(item.windows || [], brand, now)
        const low = metrics.some(metric => metric.low)
        return (
          <div
            key={item.id}
            className={styles.usageListRow}
            data-first={index === 0 ? 'true' : 'false'}
            style={{
              background: low
                ? 'linear-gradient(90deg,rgba(255,77,94,0.14),rgba(255,77,94,0) 70%)'
                : 'transparent'
            }}
          >
            <div className={styles.usageListName}>
              <strong style={{ color: brand }}>{item.name}</strong>
              <div className={styles.usageNameLine}>
                {item.plan ? <small>{item.plan}</small> : null}
                {low ? (
                  <span className={styles.usageLowPill}>LOW</span>
                ) : null}
              </div>
              {!off && item.cost ? (
                <div className={styles.usageListToday}>
                  Today <b>{money(item.cost.today)}</b>
                </div>
              ) : null}
            </div>
            {off ? (
              <div className={styles.usageMuted}>
                {item.message ||
                  'Sign in to ' + item.name + ' to see usage'}
              </div>
            ) : (
              <div className={styles.usageListBars}>
                {metrics.map(metric => (
                  <div key={metric.label} className={styles.usageSideBar}>
                    <span>{metric.label}</span>
                    <UsageBarFill
                      width={metric.width}
                      fill={metric.fill}
                      glow={metric.glow}
                      track={metric.track}
                      height="0.5em"
                    />
                    <b style={{ color: metric.numColor }}>{metric.pct}%</b>
                  </div>
                ))}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function OverviewRings({
  providers,
  now
}: {
  providers: UsageProvider[]
  now: number
}) {
  return (
    <div className={styles.usageRings}>
      {providers.map(item => {
        const brand = USAGE_COLORS[item.id] || '#9fb4ff'
        const off =
          item.status === 'off' || (item.windows || []).length === 0
        const metrics = overviewLimits(item.windows || [], brand, now)
        const lead = lowestMetric(metrics)
        const low = !!lead && lead.low
        return (
          <div key={item.id} className={styles.usageRingRow}>
            {off || !lead ? (
              <div className={styles.usageRingEmpty} />
            ) : (
              <UsageRing
                pct={lead.pct}
                stroke={lead.fill}
                numColor={lead.numColor}
                size="5.75em"
                strokeWidth="10%"
              />
            )}
            <div className={styles.usageRingMeta}>
              <strong style={{ color: brand }}>{item.name}</strong>
              <div>
                {item.plan || ''}
                {item.plan && lead ? ' · ' : ''}
                {off ? 'Not connected' : lead ? lead.label : 'Loading…'}
              </div>
              {!off && lead ? <small>{lead.reset}</small> : null}
              {low ? (
                <div className={styles.usageLowText}>LOW LIMIT</div>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function OverviewMini({
  providers,
  now
}: {
  providers: UsageProvider[]
  now: number
}) {
  return (
    <div className={styles.usageList}>
      {providers.map((item, index) => {
        const brand = USAGE_COLORS[item.id] || '#9fb4ff'
        const off =
          item.status === 'off' || (item.windows || []).length === 0
        const lead = lowestMetric(
          overviewLimits(item.windows || [], brand, now)
        )
        const low = !!lead && lead.low
        return (
          <div
            key={item.id}
            className={styles.usageMiniRow}
            data-first={index === 0 ? 'true' : 'false'}
            style={{
              background: low
                ? 'linear-gradient(90deg,rgba(255,77,94,0.14),rgba(255,77,94,0) 70%)'
                : 'transparent'
            }}
          >
            <strong style={{ color: brand }}>{item.name}</strong>
            {off || !lead ? (
              <span className={styles.usageMuted}>
                Sign in to see usage
              </span>
            ) : (
              <>
                <UsageBarFill
                  width={lead.width}
                  fill={lead.fill}
                  glow={lead.glow}
                  track={lead.track}
                  height="0.5em"
                />
                <b style={{ color: lead.numColor }}>{lead.pct}%</b>
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}

function ProviderUsage({
  boxRef,
  base,
  tier,
  provider,
  brand,
  name,
  loading,
  compact,
  now
}: {
  boxRef: React.RefObject<HTMLDivElement | null>
  base: number
  tier: UsageTier
  provider?: UsageProvider
  brand: string
  name: string
  loading: boolean
  compact?: boolean
  now: number
}) {
  const off =
    !!provider &&
    (provider.status === 'off' || (provider.windows || []).length === 0)
  const stale = provider?.status === 'stale'
  const ok = !!provider && !loading && !off
  const metrics = (provider?.windows || []).map(window =>
    metricFor(window, brand, now)
  )
  const primary = lowestMetric(metrics)
  const others = metrics.filter(metric => metric !== primary)
  const lowOne = ok ? metrics.find(metric => metric.low) : undefined
  const row = tier === 'full' || tier === 'wide'
  const showChips = tier === 'full' || tier === 'tall'
  const showFooter = tier === 'full' || tier === 'tall'
  const showChart =
    !compact &&
    (tier === 'full' || (tier === 'tall' && others.length <= 1))
  const showReset = tier !== 'quarter'
  const headerSpend = tier === 'wide'
  const nameSize = compact
    ? '1.45em'
    : tier === 'full'
      ? '2.25em'
      : tier === 'tall'
        ? '2em'
        : tier === 'wide'
          ? '1.75em'
          : '1.625em'
  const pSize = compact
    ? '2.35em'
    : tier === 'full'
      ? '4.5em'
      : tier === 'tall'
        ? '3.75em'
        : tier === 'wide'
          ? '3.5em'
          : '3em'
  const pUnit = compact
    ? '1.1em'
    : tier === 'full'
      ? '2em'
      : tier === 'tall'
        ? '1.6em'
        : tier === 'wide'
          ? '1.5em'
          : '1.4em'
  const pBar =
    tier === 'full'
      ? '0.75em'
      : tier === 'quarter'
        ? '0.5625em'
        : '0.625em'
  const next = (provider?.windows || [])
    .map(window => window.resetsAt)
    .filter(Boolean)
    .sort()[0]
  const chips: string[] = []
  if (
    next &&
    (provider?.windows || []).every(window => window.left >= 100)
  ) {
    const duration = resetDuration(next as string, now)
    if (duration) chips.push('Next reset ' + duration)
  }
  ;(provider?.notes || []).forEach(note => chips.push(note))
  const cost = provider?.cost

  return (
    <BaseWidget
      ref={boxRef}
      className={styles.usage}
      data-layout="detail"
      data-tier={tier}
      data-compact={compact ? 'true' : 'false'}
      data-low={lowOne ? 'true' : 'false'}
      style={{
        fontSize: base + 'px',
        borderColor: lowOne ? 'rgba(255,77,94,0.5)' : 'transparent'
      }}
    >
      <div className={styles.usageHeadRow}>
        <div className={styles.usageNameLine}>
          <strong style={{ color: brand, fontSize: nameSize }}>
            {name}
          </strong>
          {lowOne && !stale ? (
            <span className={styles.usageLowBadge}>
              LOW {lowOne.label.toUpperCase()}
            </span>
          ) : null}
          {stale ? (
            <span className={styles.usageChipStale}>
              {updatedAgo(provider?.updatedAt, now)}
            </span>
          ) : null}
        </div>
        {headerSpend && ok && cost ? (
          <span className={styles.usageHeaderSpend}>
            Today <b>{money(cost.today)}</b>
            {' · 30 days '}
            <b>{money(cost.month)}</b>
          </span>
        ) : provider?.plan ? (
          <span className={styles.usagePlan}>{provider.plan}</span>
        ) : null}
      </div>
      <div
        className={styles.usageBody}
        style={{ opacity: stale ? 0.5 : 1 }}
      >
        {loading ? (
          <div className={styles.usageDetailLoading}>
            <div
              className={styles.usageSkeleton}
              style={{ width: '30%' }}
            />
            <div
              className={styles.usageSkeleton}
              style={{ width: '22%', height: '2.5em', marginTop: '0.5em' }}
            />
            <div
              className={styles.usageSkeleton}
              style={{ height: '0.625em', marginTop: '0.7em' }}
            />
            <p className={styles.usageMuted}>Loading usage…</p>
          </div>
        ) : off ? (
          <div className={styles.usageOffBox}>
            <div>
              {provider?.message || 'Sign in to ' + name + ' to see usage'}
            </div>
            <small>Usage is unavailable until {name} is connected.</small>
          </div>
        ) : primary ? (
          <>
            {showChips && chips.length > 0 ? (
              <div className={styles.usageChips}>
                {chips.map(chip => (
                  <span
                    key={chip}
                    style={{
                      color: brand,
                      background: rgba(brand, 0.12),
                      borderColor: rgba(brand, 0.3)
                    }}
                  >
                    {chip}
                  </span>
                ))}
              </div>
            ) : null}
            <div
              className={styles.usageDetailCols}
              data-row={row ? 'true' : 'false'}
            >
              <div className={styles.usageLead}>
                <span className={styles.usageLeadLabel}>
                  {primary.label} left
                </span>
                <div className={styles.usageLeadPct}>
                  <span
                    style={{ fontSize: pSize, color: primary.numColor }}
                  >
                    {primary.pct}
                  </span>
                  <span
                    style={{ fontSize: pUnit, color: primary.numColor }}
                  >
                    %
                  </span>
                </div>
                <UsageBarFill
                  width={primary.width}
                  fill={primary.fill}
                  glow={primary.glow}
                  track={primary.track}
                  height={pBar}
                />
                {showReset ? (
                  <div className={styles.usageReset}>{primary.reset}</div>
                ) : null}
              </div>
              {others.length > 0 ? (
                <div
                  className={styles.usageOthers}
                  data-row={row ? 'true' : 'false'}
                >
                  {others.map(metric => (
                    <div key={metric.label} className={styles.usageOther}>
                      <div className={styles.usageLine}>
                        <span>{metric.label}</span>
                        <b style={{ color: metric.numColor }}>
                          {metric.pct}%
                        </b>
                      </div>
                      <UsageBarFill
                        width={metric.width}
                        fill={metric.fill}
                        glow={metric.glow}
                        track={metric.track}
                        height="0.5em"
                      />
                      {showReset ? (
                        <div className={styles.usageResetSmall}>
                          {metric.reset}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}
            </div>
            {showFooter && cost ? (
              <div className={styles.usageCost}>
                <div className={styles.usageSpend}>
                  <span>Today</span>
                  <b>{money(cost.today)}</b>
                  <small>{tokenText(cost.todayTokens)} tokens</small>
                </div>
                <div className={styles.usageSpend}>
                  <span>30 days</span>
                  <b>{money(cost.month)}</b>
                  <small>{tokenText(cost.monthTokens)} tokens</small>
                </div>
                {showChart ? (
                  <SpendChart days={cost.days || []} color={brand} tall />
                ) : null}
              </div>
            ) : null}
          </>
        ) : null}
      </div>
    </BaseWidget>
  )
}

export const PhotosFace: React.FC<{ photos?: PhotosInfo }> = ({
  photos
}) => {
  const image = photos?.image
  const ready = !!image
  return (
    <BaseWidget
      className={styles.photos}
      data-ready={ready ? 'true' : 'false'}
    >
      {ready ? (
        <img
          src={image}
          alt=""
          className={styles.photosImage}
          data-fit={photos?.fit === 'fit' ? 'fit' : 'fill'}
        />
      ) : (
        <div className={styles.photosEmpty}>
          <span className="material-icons">photo_library</span>
          <p>{photos?.message || 'Add photos in Settings'}</p>
        </div>
      )}
    </BaseWidget>
  )
}
