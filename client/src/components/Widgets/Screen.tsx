import React, { useEffect, useRef, useState } from 'react'

import BaseWidget from './widgets/BaseWidget/BaseWidget'
import type { ActionItem } from './screenModel'

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
