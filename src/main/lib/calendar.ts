import { execFile } from 'child_process'

import { getStorageValue, setStorageValue } from './storage.js'
import { log, LogLevel } from './utils.js'

export const CALENDAR_SOURCES = [
  'teams',
  'mac',
  'slack',
  'google'
] as const

export type CalendarSource = (typeof CALENDAR_SOURCES)[number]

export const CALENDAR_SOURCE_META: Record<
  CalendarSource,
  { label: string; icon: string; empty: string }
> = {
  teams: {
    label: 'Teams',
    icon: 'groups',
    empty:
      'No Teams meetings. Add Outlook or Exchange in System Settings → Internet Accounts, then import again.'
  },
  mac: {
    label: 'Mac Calendar',
    icon: 'laptop_mac',
    empty: 'No events in Calendar for today and tomorrow.'
  },
  slack: {
    label: 'Slack',
    icon: 'tag',
    empty: 'No Slack events. Add Slack to Calendar.app, then import again.'
  },
  google: {
    label: 'Google Calendar',
    icon: 'event',
    empty:
      'No Google Calendar events. Add Google in System Settings → Internet Accounts, then import again.'
  }
}

export interface CalendarEvent {
  title: string
  start: string
  end: string
  where: string
  when: string
  day: number
  startMin: number
  endMin: number
  online?: boolean
  organizer?: string
  canceled?: boolean
  canJoin?: boolean
  reminderMin?: number
  joinUrl?: string
  account?: string
  calendarName?: string
}

const TEAMS_JOIN =
  /https:\/\/teams\.microsoft\.com\/l\/meetup-join\/[^\s<>"')\]]+/

function eventKey(event: { title: string; start: string }) {
  return `${event.title}|${event.start}`
}

export interface CalendarImport {
  source: CalendarSource
  events: CalendarEvent[]
  message: string
}

const SEP = '\u001f'
const REC = '\u001e'

function runScript(source: string, flags: string[] = []): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'osascript',
      [...flags, '-e', source],
      { timeout: 60000, maxBuffer: 4 * 1024 * 1024 },
      (error, stdout, stderr) => {
        if (error)
          reject(Object.assign(error, { stderr: String(stderr || '') }))
        else resolve(stdout)
      }
    )
  })
}

function gridPlace(start: Date, end: Date) {
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const startMin = start.getHours() * 60 + start.getMinutes()
  let endMin = end.getHours() * 60 + end.getMinutes()
  if (end.toDateString() !== start.toDateString() || endMin <= startMin) {
    endMin = Math.min(24 * 60, startMin + 60)
  }
  return {
    day: start.toDateString() === today.toDateString() ? 0 : 1,
    startMin,
    endMin
  }
}

function whenLabel(date: Date) {
  const day = date.toLocaleDateString('en-US', { weekday: 'short' })
  let hour = date.getHours()
  const minute = String(date.getMinutes()).padStart(2, '0')
  const suffix = hour >= 12 ? 'PM' : 'AM'
  hour = hour % 12 || 12
  return `${day} ${hour}:${minute} ${suffix}`
}

function fromParts(parts: string[], offset: number) {
  const year = Number(parts[offset])
  const month = Number(parts[offset + 1])
  const day = Number(parts[offset + 2])
  const hour = Number(parts[offset + 3])
  const minute = Number(parts[offset + 4])
  if (
    [year, month, day, hour, minute].some(value => Number.isNaN(value))
  ) {
    return null
  }
  return new Date(year, month - 1, day, hour, minute)
}

const WEEKDAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA']
const DAY_MS = 24 * 60 * 60 * 1000

function dayStart(date: Date) {
  const copy = new Date(date)
  copy.setHours(0, 0, 0, 0)
  return copy
}

function daysBetween(a: Date, b: Date) {
  return Math.round(
    (dayStart(b).getTime() - dayStart(a).getTime()) / DAY_MS
  )
}

function parseRule(text: string) {
  const rule: Record<string, string> = {}
  for (const part of text.replace(/^RRULE:/i, '').split(';')) {
    const [key, value] = part.split('=')
    if (key && value)
      rule[key.trim().toUpperCase()] = value.trim().toUpperCase()
  }
  return rule
}

function parseUntil(value: string | undefined) {
  if (!value) return null
  const match = value.match(
    /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/
  )
  if (!match) return null
  const [, y, m, d, hh, mm, ss, utc] = match
  if (!hh) return new Date(Number(y), Number(m) - 1, Number(d), 23, 59, 59)
  const args = [
    Number(y),
    Number(m) - 1,
    Number(d),
    Number(hh),
    Number(mm),
    Number(ss)
  ] as const
  return utc ? new Date(Date.UTC(...args)) : new Date(...args)
}

function nthWeekday(day: Date) {
  const nth = Math.floor((day.getDate() - 1) / 7) + 1
  const last =
    day.getDate() + 7 >
    new Date(day.getFullYear(), day.getMonth() + 1, 0).getDate()
  return { nth, last }
}

function ruleMatchesDay(
  rule: Record<string, string>,
  first: Date,
  day: Date
) {
  const offset = daysBetween(first, day)
  if (offset < 0) return false
  const interval = Math.max(1, Number(rule.INTERVAL) || 1)
  const byDay = rule.BYDAY ? rule.BYDAY.split(',') : []
  const weekday = WEEKDAYS[day.getDay()]
  const freq = rule.FREQ

  if (freq === 'DAILY') {
    if (offset % interval !== 0) return false
    return byDay.length === 0 || byDay.some(item => item.endsWith(weekday))
  }
  if (freq === 'WEEKLY') {
    const mondayOf = (date: Date) => {
      const copy = dayStart(date)
      copy.setDate(copy.getDate() - ((copy.getDay() + 6) % 7))
      return copy
    }
    const weeks = Math.round(
      daysBetween(mondayOf(first), mondayOf(day)) / 7
    )
    if (weeks % interval !== 0) return false
    const days = byDay.length > 0 ? byDay : [WEEKDAYS[first.getDay()]]
    return days.some(item => item.endsWith(weekday))
  }
  if (freq === 'MONTHLY') {
    const months =
      (day.getFullYear() - first.getFullYear()) * 12 +
      day.getMonth() -
      first.getMonth()
    if (months % interval !== 0) return false
    if (byDay.length > 0) {
      const place = nthWeekday(day)
      return byDay.some(item => {
        const match = item.match(/^([+-]?\d+)?([A-Z]{2})$/)
        if (!match || match[2] !== weekday) return false
        if (!match[1]) return true
        const n = Number(match[1])
        return n === -1 ? place.last : n === place.nth
      })
    }
    const monthDays = rule.BYMONTHDAY
      ? rule.BYMONTHDAY.split(',').map(Number)
      : [first.getDate()]
    return monthDays.includes(day.getDate())
  }
  if (freq === 'YEARLY') {
    if ((day.getFullYear() - first.getFullYear()) % interval !== 0)
      return false
    return (
      day.getMonth() === first.getMonth() &&
      day.getDate() === first.getDate()
    )
  }
  return false
}

function expandRecurring(
  start: Date,
  end: Date,
  ruleText: string,
  excluded: string[],
  windowStart: Date,
  windowEnd: Date
) {
  const rule = parseRule(ruleText)
  if (!rule.FREQ) return []
  const until = parseUntil(rule.UNTIL)
  const count = Number(rule.COUNT) || 0
  const duration = Math.max(end.getTime() - start.getTime(), 0)
  const skip = new Set(excluded)
  const found: Date[] = []
  let seen = 0
  const firstDay = dayStart(start)
  const lastDay = dayStart(new Date(windowEnd.getTime() - 1))
  const scanFrom = count > 0 ? firstDay : dayStart(windowStart)
  for (
    let day = new Date(Math.max(scanFrom.getTime(), firstDay.getTime()));
    day <= lastDay && seen < 5000;
    day = new Date(day.getFullYear(), day.getMonth(), day.getDate() + 1)
  ) {
    if (!ruleMatchesDay(rule, start, day)) continue
    seen += 1
    if (count > 0 && seen > count) break
    const occurrence = new Date(
      day.getFullYear(),
      day.getMonth(),
      day.getDate(),
      start.getHours(),
      start.getMinutes()
    )
    if (until && occurrence > until) break
    const key = `${day.getFullYear()}-${day.getMonth() + 1}-${day.getDate()}`
    if (skip.has(key)) continue
    if (occurrence >= windowStart && occurrence < windowEnd)
      found.push(occurrence)
  }
  return found.map(when => ({
    start: when,
    end: new Date(when.getTime() + duration)
  }))
}

function calendarWindow() {
  const windowStart = dayStart(new Date())
  const windowEnd = new Date(windowStart)
  windowEnd.setDate(windowEnd.getDate() + 2)
  return { windowStart, windowEnd }
}

function parseEvents(raw: string): CalendarEvent[] {
  const events: CalendarEvent[] = []
  const { windowStart, windowEnd } = calendarWindow()
  for (const row of raw.split(REC)) {
    const parts = row.split(SEP).map(part => part.trim())
    if (parts.length < 11 || !parts[0]) continue
    const start = fromParts(parts, 1)
    const end = fromParts(parts, 6)
    if (!start || !end) continue
    const rule = parts[12] || ''
    const excluded = (parts[13] || '').split(',').filter(Boolean)
    const occurrences =
      rule && rule !== 'missing value'
        ? expandRecurring(
            start,
            end,
            rule,
            excluded,
            windowStart,
            windowEnd
          )
        : start >= windowStart && start < windowEnd
          ? [{ start, end }]
          : []
    const where = parts[11] || ''
    const notes = `${parts[14] || ''} ${parts[15] || ''} ${where}`
    const join = TEAMS_JOIN.exec(notes)
    const online =
      !!join || /teams\.microsoft\.com|Microsoft Teams/i.test(notes)
    const title = parts[0].slice(0, 80)
    const canceled =
      /^cancel+ed:/i.test(title) || parts[16] === 'cancelled'
    for (const occurrence of occurrences) {
      events.push({
        title,
        start: occurrence.start.toISOString(),
        end: occurrence.end.toISOString(),
        where: online && /teams/i.test(where) ? '' : where.slice(0, 40),
        when: whenLabel(occurrence.start),
        ...gridPlace(occurrence.start, occurrence.end),
        online,
        canceled,
        ...(join ? { joinUrl: join[0] } : {}),
        ...(parts[17] ? { calendarName: parts[17].slice(0, 80) } : {})
      })
    }
  }
  events.sort((a, b) => a.start.localeCompare(b.start))
  const seen = new Set<string>()
  return events
    .filter(event => {
      const key = `${event.title}|${event.start}`
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 24)
}

const eventKitScript = `
ObjC.import('EventKit')
function text(value) {
  try {
    if (!value || (value.isNil && value.isNil())) return ''
    const out = ObjC.unwrap(value)
    return typeof out === 'string' ? out : ''
  } catch (e) {
    return ''
  }
}
let status = Number($.EKEventStore.authorizationStatusForEntityType(0))
if (status === 0) {
  let answered = false
  const asker = $.EKEventStore.alloc.init
  asker.requestFullAccessToEventsWithCompletion(function () {
    answered = true
  })
  for (let i = 0; i < 500 && !answered; i++) {
    $.NSRunLoop.currentRunLoop.runUntilDate($.NSDate.dateWithTimeIntervalSinceNow(0.1))
  }
  status = Number($.EKEventStore.authorizationStatusForEntityType(0))
}
if (status !== 3) {
  JSON.stringify({ status: status, events: [] })
} else {
  const store = $.EKEventStore.alloc.init
  const start = $.NSCalendar.currentCalendar.startOfDayForDate($.NSDate.date)
  const end = start.dateByAddingTimeInterval(2 * 86400)
  const skip = /holiday|birthday|siri suggestions|scheduled reminders/i
  const calendars = store.calendarsForEntityType(0)
  const wanted = $.NSMutableArray.array
  for (let i = 0; i < calendars.count; i++) {
    const c = calendars.objectAtIndex(i)
    if (!skip.test(text(c.title))) wanted.addObject(c)
  }
  const found = store.eventsMatchingPredicate(
    store.predicateForEventsWithStartDateEndDateCalendars(start, end, wanted)
  )
  const events = []
  for (let i = 0; i < found.count; i++) {
    const e = found.objectAtIndex(i)
    if (e.allDay) continue
    let organizer = ''
    try {
      if (e.organizer && !e.organizer.isNil()) organizer = text(e.organizer.name)
    } catch (err) {}
    let link = ''
    try {
      if (e.URL && !e.URL.isNil()) link = text(e.URL.absoluteString)
    } catch (err) {}
    const notes = text(e.notes)
    const joinAt = notes.search(/https:\\/\\/teams\\.microsoft\\.com\\/l\\/meetup-join\\//)
    let account = ''
    let calendar = ''
    try {
      if (e.calendar && !e.calendar.isNil()) {
        calendar = text(e.calendar.title)
        if (e.calendar.source && !e.calendar.source.isNil()) {
          account = text(e.calendar.source.title)
        }
      }
    } catch (err) {}
    events.push({
      title: text(e.title),
      start: Number(e.startDate.timeIntervalSince1970) * 1000,
      end: Number(e.endDate.timeIntervalSince1970) * 1000,
      where: text(e.location),
      organizer: organizer,
      canceled: Number(e.status) === 3,
      teams: /teams\\.microsoft\\.com|Microsoft Teams/i.test(notes + ' ' + link),
      join: joinAt >= 0 ? notes.slice(joinAt, joinAt + 1200) : link,
      account: account,
      calendar: calendar
    })
  }
  JSON.stringify({ status: status, events: events })
}
`

interface EventKitEvent {
  title: string
  start: number
  end: number
  where: string
  organizer: string
  canceled: boolean
  teams: boolean
  join: string
  account?: string
  calendar?: string
}

function eventsFromEventKit(raw: string): CalendarEvent[] | null {
  let parsed: { status: number; events: EventKitEvent[] }
  try {
    parsed = JSON.parse(raw.trim())
  } catch {
    return null
  }
  if (parsed.status !== 3) return null
  const events: CalendarEvent[] = []
  for (const item of parsed.events) {
    if (
      !item.title ||
      !Number.isFinite(item.start) ||
      !Number.isFinite(item.end)
    )
      continue
    const start = new Date(item.start)
    const end = new Date(item.end)
    const title = item.title.trim().slice(0, 80)
    const canceled = item.canceled || /^cancel+ed:/i.test(title)
    const join = TEAMS_JOIN.exec(item.join || '')
    const online = item.teams || !!join || /teams/i.test(item.where)
    events.push({
      title:
        canceled && !/^cancel+ed:/i.test(title)
          ? `Canceled: ${title}`
          : title,
      start: start.toISOString(),
      end: end.toISOString(),
      where:
        online && /teams/i.test(item.where) ? '' : item.where.slice(0, 40),
      when: whenLabel(start),
      ...gridPlace(start, end),
      online,
      canceled,
      ...(item.organizer
        ? { organizer: item.organizer.slice(0, 60) }
        : {}),
      ...(join ? { joinUrl: join[0] } : {}),
      ...(item.account ? { account: item.account.slice(0, 80) } : {}),
      ...(item.calendar
        ? { calendarName: item.calendar.slice(0, 80) }
        : {})
    })
  }
  events.sort((a, b) => a.start.localeCompare(b.start))
  const seen = new Set<string>()
  return events
    .filter(event => {
      const key = eventKey(event)
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .slice(0, 24)
}

async function importMacCalendar(): Promise<CalendarEvent[]> {
  try {
    const raw = await runScript(eventKitScript, ['-l', 'JavaScript'])
    const events = eventsFromEventKit(raw)
    if (events) return events
    log(
      `EventKit has no calendar access (${raw.trim().slice(0, 40)}), using AppleScript`,
      'Calendar',
      LogLevel.WARN
    )
  } catch (error) {
    log(
      `EventKit read failed: ${(error as Error).message}`,
      'Calendar',
      LogLevel.WARN
    )
  }
  return parseEvents(await runScript(macScript))
}

const macScript = `
set sep to ASCII character 31
set rec to ASCII character 30
set theStart to current date
set hours of theStart to 0
set minutes of theStart to 0
set seconds of theStart to 0
set theEnd to theStart + (2 * days)
set out to ""
tell application "Calendar"
  repeat with c in calendars
    set cname to name of c as text
    if cname is not "US Holidays" and cname is not "Birthdays" and cname is not "Siri Suggestions" then
      set evs to events of c whose start date ≥ theStart and start date < theEnd
      set older to events of c whose start date < theStart and recurrence is not ""
      repeat with e in (evs & older)
        set rule to ""
        try
          set rule to recurrence of e as text
        end try
        if rule is "missing value" then set rule to ""
        set s to start date of e
        if rule is not "" or s ≥ theStart then
          set en to end date of e
          set title to summary of e as text
          set loc to ""
          try
            set loc to location of e as text
          end try
          if loc is "missing value" then set loc to ""
          set skipped to ""
          try
            repeat with x in (excluded dates of e)
              set skipped to skipped & (year of x as integer as text) & "-" & (month of x as integer as text) & "-" & (day of x as integer as text) & ","
            end repeat
          end try
          set note to ""
          try
            set note to description of e as text
          end try
          if note is "missing value" or (note does not contain "teams.microsoft.com" and note does not contain "Microsoft Teams") then set note to ""
          set link to ""
          try
            set link to url of e as text
          end try
          if link is "missing value" then set link to ""
          set state to ""
          try
            set state to status of e as text
          end try
          set out to out & title & sep & (year of s as integer as text) & sep & (month of s as integer as text) & sep & (day of s as integer as text) & sep & (hours of s as integer as text) & sep & (minutes of s as integer as text) & sep & (year of en as integer as text) & sep & (month of en as integer as text) & sep & (day of en as integer as text) & sep & (hours of en as integer as text) & sep & (minutes of en as integer as text) & sep & loc & sep & rule & sep & skipped & sep & note & sep & link & sep & state & sep & cname & rec
        end if
      end repeat
    end if
  end repeat
end tell
return out
`

function regrid(events: CalendarEvent[]) {
  const { windowStart, windowEnd } = calendarWindow()
  return events
    .map(event => ({
      event,
      start: new Date(event.start),
      end: new Date(event.end)
    }))
    .filter(
      item =>
        !Number.isNaN(item.start.getTime()) &&
        item.start >= windowStart &&
        item.start < windowEnd
    )
    .map(item => ({
      ...item.event,
      when: whenLabel(item.start),
      ...gridPlace(item.start, item.end)
    }))
}

export function isCalendarSource(value: unknown): value is CalendarSource {
  return (
    value === 'mac' ||
    value === 'google' ||
    value === 'teams' ||
    value === 'slack'
  )
}

function sourceHay(event: CalendarEvent) {
  return [
    event.account,
    event.calendarName,
    event.where,
    event.title,
    event.joinUrl,
    event.online ? 'teams' : ''
  ].join(' ')
}

function matchesSource(event: CalendarEvent, source: CalendarSource) {
  if (source === 'mac') return true
  const hay = sourceHay(event)
  if (source === 'google') return /google|gmail/i.test(hay)
  if (source === 'slack') return /slack/i.test(hay)
  return (
    !!event.joinUrl ||
    event.online === true ||
    /teams|exchange|outlook|office 365|microsoft/i.test(hay)
  )
}

function filterEvents(events: CalendarEvent[], source: CalendarSource) {
  return events.filter(event => matchesSource(event, source))
}

export async function refreshStoredCalendar(source?: CalendarSource) {
  const before = getStorageValue('screenLayout') as {
    calendar?: { source?: unknown; events?: CalendarEvent[] }
  } | null
  const stored = before?.calendar
  const choice =
    source || (isCalendarSource(stored?.source) ? stored.source : null)
  if (!choice) return null

  const result = await importCalendar(choice)
  const failed =
    result.events.length === 0 && /could not/i.test(result.message)
  if (!failed) {
    const links: Record<string, string> = {}
    for (const event of result.events) {
      if (event.joinUrl) links[eventKey(event)] = event.joinUrl
    }
    setStorageValue('calendarJoinLinks', links)
  }
  const events = (
    failed && !source && Array.isArray(stored?.events)
      ? regrid(stored.events)
      : result.events
  ).map(raw => {
    const event = { ...raw }
    const joinUrl = event.joinUrl
    delete event.joinUrl
    delete event.account
    delete event.calendarName
    return {
      ...event,
      canJoin: event.canJoin === true || !!joinUrl
    }
  })

  const latest = getStorageValue('screenLayout')
  if (!latest || typeof latest !== 'object' || Array.isArray(latest))
    return result
  setStorageValue('screenLayout', {
    ...(latest as Record<string, unknown>),
    calendar: {
      source: choice,
      events,
      message: result.message,
      updatedAt: new Date().toISOString()
    }
  })
  if (failed) log(result.message, 'Calendar', LogLevel.WARN)
  return { ...result, events }
}

export function joinLinkFor(title: unknown, start: unknown) {
  if (typeof title !== 'string' || typeof start !== 'string') return null
  const links = getStorageValue('calendarJoinLinks') as Record<
    string,
    unknown
  > | null
  const url = links ? links[eventKey({ title, start })] : null
  return typeof url === 'string' && TEAMS_JOIN.test(url) ? url : null
}

export async function importCalendar(
  source: CalendarSource
): Promise<CalendarImport> {
  if (process.platform !== 'darwin') {
    return {
      source,
      events: [],
      message: 'Calendar import is only available on macOS.'
    }
  }

  try {
    const events = filterEvents(await importMacCalendar(), source)
    const meta = CALENDAR_SOURCE_META[source]
    return {
      source,
      events,
      message:
        events.length > 0
          ? `Imported ${events.length} from ${meta.label}.`
          : meta.empty
    }
  } catch (error) {
    const err = error as {
      message?: string
      killed?: boolean
      stderr?: string
    }
    const detail = String(err.stderr || err.message || error)
      .trim()
      .split('\n')
      .slice(-1)[0]
      .slice(0, 200)
    log(`Calendar import failed: ${detail}`, 'Calendar', LogLevel.WARN)
    let message =
      'Calendar could not be read. Allow GlanceThing to control Calendar, then try again.'
    if (err.killed) {
      message = 'Calendar took too long to answer. Try again in a minute.'
    } else if (!/-1743|not allowed|not authori[sz]ed/i.test(detail)) {
      message = `Calendar could not be read: ${detail.split('\n')[0]}`
    }
    return { source, events: [], message }
  }
}
