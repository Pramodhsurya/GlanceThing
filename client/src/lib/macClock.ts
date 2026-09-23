// The Car Thing's own clock is not set, so time comes from the Mac.
let skew = 0
let utcOffset = -new Date().getTimezoneOffset()
let synced = false

export function syncMacClock(data: {
  now?: unknown
  utcOffset?: unknown
}) {
  if (typeof data.now !== 'number') return
  skew = data.now - Date.now()
  if (typeof data.utcOffset === 'number') utcOffset = data.utcOffset
  synced = true
}

export function macClockSynced() {
  return synced
}

export function macNow() {
  return Date.now() + skew
}

function localDays(ms: number) {
  return Math.floor((ms + utcOffset * 60000) / 86400000)
}

export function macMinuteOfDay(ms: number) {
  const local = new Date(ms + utcOffset * 60000)
  return local.getUTCHours() * 60 + local.getUTCMinutes()
}

export function macWeekday(ms: number) {
  return new Date(ms + utcOffset * 60000).getUTCDay()
}

export function macDayFromToday(ms: number, now = macNow()) {
  return localDays(ms) - localDays(now)
}
