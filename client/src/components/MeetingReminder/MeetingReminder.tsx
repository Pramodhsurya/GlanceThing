import { useContext, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

import { SocketContext } from '@/contexts/SocketContext.tsx'
import { SleepContext } from '@/contexts/SleepContext.tsx'
import { macClockSynced } from '@/lib/macClock.ts'

import styles from './MeetingReminder.module.css'

export interface ReminderEvent {
  title: string
  start: string
  end: string
  where?: string
  online?: boolean
  organizer?: string
  canceled?: boolean
  canJoin?: boolean
}

const LEAD_MS = 15 * 60 * 1000
const SNOOZE_MS = 5 * 60 * 1000
const STORE_KEY = 'meetingReminders'

type ReminderStore = Record<
  string,
  { dismissed?: boolean; until?: number }
>

function eventKey(event: ReminderEvent) {
  return event.title + '|' + event.start
}

function loadStore(): ReminderStore {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORE_KEY) || '{}')
    return parsed && typeof parsed === 'object' ? parsed : {}
  } catch {
    return {}
  }
}

function saveStore(store: ReminderStore, now: number) {
  const kept: ReminderStore = {}
  Object.keys(store).forEach(key => {
    const start = Date.parse(key.slice(key.lastIndexOf('|') + 1))
    if (!(start < now - 2 * 86400000)) kept[key] = store[key]
  })
  localStorage.setItem(STORE_KEY, JSON.stringify(kept))
}

function isCanceled(event: ReminderEvent) {
  return event.canceled === true || /^Canceled:/i.test(event.title)
}

function whenText(start: number, now: number) {
  const diff = start - now
  if (diff > 60000) {
    const minutes = Math.ceil(diff / 60000)
    return 'In ' + minutes + ' minutes'
  }
  if (diff > 0) return 'In 1 minute'
  if (diff > -60000) return 'Starting now'
  const ago = Math.floor(-diff / 60000)
  return 'Started ' + ago + (ago === 1 ? ' minute ago' : ' minutes ago')
}

const MeetingReminder: React.FC<{
  events: ReminderEvent[]
  now: number
}> = ({ events, now }) => {
  const { socket } = useContext(SocketContext)
  const { sleepState, setSleepState } = useContext(SleepContext)
  const [store, setStore] = useState<ReminderStore>(loadStore)
  const [focus, setFocus] = useState(0)
  const wokenFor = useRef('')

  const due = macClockSynced()
    ? events
        .filter(event => {
          if (isCanceled(event)) return false
          const start = Date.parse(event.start)
          const end = Date.parse(event.end)
          if (!(start - now <= LEAD_MS) || !(end > now)) return false
          const saved = store[eventKey(event)]
          if (saved && saved.dismissed) return false
          if (saved && saved.until && saved.until > now) return false
          return true
        })
        .sort((a, b) => Date.parse(a.start) - Date.parse(b.start))
    : []
  const event = due[0] || null
  const key = event ? eventKey(event) : ''
  const buttons: ('join' | 'snooze' | 'dismiss')[] = event
    ? event.canJoin
      ? ['join', 'snooze', 'dismiss']
      : ['snooze', 'dismiss']
    : []

  function update(
    target: ReminderEvent,
    value: { dismissed?: boolean; until?: number }
  ) {
    const next = { ...store, [eventKey(target)]: value }
    setStore(next)
    saveStore(next, now)
  }

  function press(button: 'join' | 'snooze' | 'dismiss') {
    if (!event) return
    if (button === 'join') {
      if (socket) {
        socket.send(
          JSON.stringify({
            type: 'calendar',
            action: 'join',
            data: { title: event.title, start: event.start }
          })
        )
      }
      update(event, { dismissed: true })
    } else if (button === 'snooze') {
      update(event, { until: now + SNOOZE_MS })
    } else {
      update(event, { dismissed: true })
    }
  }

  const pressRef = useRef(press)
  pressRef.current = press
  const buttonsRef = useRef(buttons)
  buttonsRef.current = buttons
  const focusRef = useRef(focus)
  focusRef.current = focus

  useEffect(() => {
    setFocus(0)
    if (!key || wokenFor.current === key) return
    wokenFor.current = key
    if (sleepState !== 'off') {
      setSleepState('off')
      if (socket) socket.send(JSON.stringify({ type: 'wake' }))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key])

  useEffect(() => {
    if (!key) return
    function move(direction: number) {
      const count = buttonsRef.current.length
      setFocus(current => (current + direction + count) % count)
    }
    function onKey(e: KeyboardEvent) {
      const handled = [
        'Enter',
        'Escape',
        'ArrowLeft',
        'ArrowRight',
        'ArrowUp',
        'ArrowDown'
      ]
      if (handled.indexOf(e.key) < 0) return
      e.preventDefault()
      e.stopImmediatePropagation()
      if (e.key === 'Enter') {
        const button = buttonsRef.current[focusRef.current]
        if (button) pressRef.current(button)
      } else if (e.key === 'Escape') pressRef.current('dismiss')
      else move(e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 1)
    }
    function onWheel(e: WheelEvent) {
      const delta =
        Math.abs(e.deltaX) >= Math.abs(e.deltaY) ? e.deltaX : e.deltaY
      e.preventDefault()
      e.stopImmediatePropagation()
      if (delta) move(delta > 0 ? 1 : -1)
    }
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('wheel', onWheel, {
      capture: true,
      passive: false
    })
    return () => {
      window.removeEventListener('keydown', onKey, true)
      window.removeEventListener('wheel', onWheel, true)
    }
  }, [key])

  if (!event) return null

  const labels = {
    join: 'Join',
    snooze: 'Snooze 5 min',
    dismiss: 'Dismiss'
  }
  const place = event.online
    ? 'Microsoft Teams Meeting'
    : event.where || ''

  return createPortal(
    <div className={styles.backdrop}>
      <div className={styles.card} role="alertdialog">
        <div className={styles.head}>
          <span className={styles.icon}>
            <span className="material-icons">calendar_today</span>
          </span>
          <div className={styles.text}>
            <p className={styles.title}>{event.title.trim()}</p>
            {place ? <p className={styles.place}>{place}</p> : null}
            <p className={styles.when}>
              {whenText(Date.parse(event.start), now)}
            </p>
            {event.organizer ? (
              <p className={styles.organizer}>{event.organizer}</p>
            ) : null}
          </div>
        </div>
        <div className={styles.buttons}>
          {buttons.map((button, index) => (
            <button
              key={button}
              className={styles.button}
              data-kind={button}
              data-focused={index === focus}
              onClick={() => press(button)}
            >
              {labels[button]}
            </button>
          ))}
        </div>
      </div>
      {due.length > 1 ? (
        <p className={styles.more}>+{due.length - 1} more</p>
      ) : null}
    </div>,
    document.body
  )
}

export default MeetingReminder
