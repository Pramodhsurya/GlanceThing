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
  type UsageTarget,
  type UsageWindow,
  type WeatherInfo
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

function resetText(iso: string | null, now: number) {
  if (!iso) return ''
  const ms = Date.parse(iso) - now
  if (Number.isNaN(ms)) return ''
  if (ms <= 0) return 'Resetting now'
  const minutes = Math.floor(ms / 60000)
  const days = Math.floor(minutes / 1440)
  const hours = Math.floor((minutes % 1440) / 60)
  if (days > 0) return 'Resets in ' + days + 'd ' + hours + 'h'
  if (hours > 0) return 'Resets in ' + hours + 'h ' + (minutes % 60) + 'm'
  return 'Resets in ' + Math.max(1, minutes) + 'm'
}

function tokenText(value: number) {
  if (value >= 1e9) return (value / 1e9).toFixed(1) + 'B'
  if (value >= 1e6) return Math.round(value / 1e6) + 'M'
  if (value >= 1e3) return Math.round(value / 1e3) + 'K'
  return String(Math.round(value))
}

function money(value: number) {
  return '$' + (value >= 100 ? value.toFixed(0) : value.toFixed(2))
}

const UsageBar: React.FC<{ left: number; color: string }> = ({
  left,
  color
}) => (
  <div className={styles.usageTrack}>
    <span
      style={{
        width: Math.max(0, Math.min(100, left)) + '%',
        background: left < 15 ? '#ff3b5c' : color,
        boxShadow: '0 0 0.5em ' + (left < 15 ? '#ff3b5c' : color)
      }}
    />
  </div>
)

function overviewWindows(windows: UsageWindow[]) {
  if (windows.length <= 2) return windows
  const rest = windows.slice(1)
  let lowest = rest[0]
  for (let i = 1; i < rest.length; i += 1) {
    if (rest[i].left < lowest.left) lowest = rest[i]
  }
  return [windows[0], lowest]
}

function usageLines(target: UsageTarget, providers: UsageProvider[]) {
  if (target === 'all') {
    const spend = providers.filter(provider => provider.cost).length
    return 1.6 + providers.length * 2.3 + spend * 0.9
  }
  const provider = providers[0]
  if (!provider) return 4
  return (
    2 +
    (provider.windows || []).length * 2.6 +
    (provider.notes || []).length * 1.2 +
    (provider.message ? 1.2 : 0) +
    (provider.cost ? 3.2 : 0)
  )
}

export const UsageFace: React.FC<{
  usage?: AiUsageInfo
  target?: UsageTarget
  now: number
}> = ({ usage, target = 'all', now }) => {
  const all = usage?.providers || []
  const providers =
    target === 'all' ? all : all.filter(provider => provider.id === target)
  const boxRef = useRef<HTMLDivElement>(null)
  const [box, setBox] = useState({ w: 0, h: 0 })
  const [fontPx, setFontPx] = useState(16)
  const [hidden, setHidden] = useState(0)
  const lines = usageLines(target, providers)

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
    const guess = Math.min(
      box.h / lines,
      box.w / (target === 'all' ? 19 : 13)
    )
    setHidden(0)
    setFontPx(Math.max(10, Math.min(30, Math.floor(guess))))
  }, [box, lines, target])

  useEffect(() => {
    const node = boxRef.current
    if (!node || !box.w) return
    const overflow =
      node.scrollHeight > node.clientHeight + 1 ||
      node.scrollWidth > node.clientWidth + 1
    if (!overflow) return
    if (fontPx > 10) setFontPx(Math.max(10, Math.floor(fontPx * 0.93)))
    else if (hidden < 1) setHidden(hidden + 1)
  }, [box, fontPx, hidden, usage, target])

  const provider = target === 'all' ? null : providers[0]
  const color = USAGE_COLORS[target] || '#9fb4ff'
  const cost = provider?.cost
  const peak = Math.max(1, ...(cost?.days || []))

  return (
    <BaseWidget
      ref={boxRef}
      className={styles.usage}
      data-hidden={hidden}
      style={{ fontSize: fontPx + 'px' }}
    >
      {target === 'all' ? (
        <>
          <p className={styles.usageTitle}>
            AI usage<span>% left</span>
          </p>
          {providers.length === 0 ? (
            <p className={styles.usageMuted}>Loading usage…</p>
          ) : (
            providers.map(item => {
              const windows = overviewWindows(item.windows || [])
              const tint = USAGE_COLORS[item.id] || '#9fb4ff'
              return (
                <div
                  key={item.id}
                  className={styles.usageRow}
                  data-status={item.status || 'ok'}
                >
                  <div className={styles.usageRowTop}>
                    <div className={styles.usageName}>
                      <strong style={{ color: tint }}>{item.name}</strong>
                      {item.plan ? <small>{item.plan}</small> : null}
                    </div>
                    {windows.length === 0 ? (
                      <p className={styles.usageMuted}>
                        {item.message || 'Not connected'}
                      </p>
                    ) : (
                      windows.map(window => (
                        <div
                          key={window.label}
                          className={styles.usageMini}
                        >
                          <div className={styles.usageLine}>
                            <span>{window.label}</span>
                            <b>{Math.round(window.left)}%</b>
                          </div>
                          <UsageBar left={window.left} color={tint} />
                        </div>
                      ))
                    )}
                  </div>
                  {item.cost ? (
                    <p className={styles.usageRowCost}>
                      <span>
                        Today <b>{money(item.cost.today)}</b> ·{' '}
                        {tokenText(item.cost.todayTokens)} tokens
                      </span>
                      <span>
                        30 days <b>{money(item.cost.month)}</b> ·{' '}
                        {tokenText(item.cost.monthTokens)} tokens
                      </span>
                    </p>
                  ) : null}
                </div>
              )
            })
          )}
        </>
      ) : (
        <>
          <div className={styles.usageHead}>
            <strong style={{ color }}>{USAGE_NAMES[target]}</strong>
            {provider?.plan ? <small>{provider.plan}</small> : null}
          </div>
          {!provider ? (
            <p className={styles.usageMuted}>Loading usage…</p>
          ) : null}
          {provider?.message ? (
            <p className={styles.usageMuted}>{provider.message}</p>
          ) : null}
          {(provider?.windows || []).map(window => (
            <div key={window.label} className={styles.usageWindow}>
              <div className={styles.usageLine}>
                <span>{window.label}</span>
                <b>{Math.round(window.left)}% left</b>
              </div>
              <UsageBar left={window.left} color={color} />
              <p className={styles.usageReset}>
                {resetText(window.resetsAt, now)}
              </p>
            </div>
          ))}
          {(provider?.notes || []).map(note => (
            <p key={note} className={styles.usageNote}>
              {note}
            </p>
          ))}
          {cost ? (
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
              <div
                className={styles.usageChart}
                data-empty={
                  cost.days.some(value => value > 0) ? 'false' : 'true'
                }
              >
                {cost.days.map((value, index) => (
                  <span
                    key={index}
                    style={{
                      height: Math.max(4, (value / peak) * 100) + '%',
                      background: color
                    }}
                  />
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </BaseWidget>
  )
}
