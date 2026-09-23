import React, { useEffect, useRef, useState } from 'react'

import BaseWidget from './widgets/BaseWidget/BaseWidget'
import type { ActionItem, WeatherInfo } from './screenModel'

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
