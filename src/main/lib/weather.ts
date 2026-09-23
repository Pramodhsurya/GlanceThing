import axios from 'axios'

import { log, LogLevel } from './utils.js'
import { getStorageValue, setStorageValue } from './storage.js'

export interface WeatherReport {
  query: string
  place: string
  temp: number | null
  unit: 'F' | 'C'
  code: number
  label: string
  icon: string
  high: number | null
  low: number | null
  feels: number | null
  humidity: number | null
  wind: number | null
  windUnit: string
  windDir: string
  rain: number | null
  tomorrowDay: string
  tomorrowHigh: number | null
  tomorrowLow: number | null
  isDay: boolean
  hours: WeatherHour[]
  message: string
  updatedAt: string
}

export interface WeatherHour {
  time: string
  temp: number | null
  icon: string
  kind: 'hour' | 'sunrise' | 'sunset'
}

const CONDITIONS: {
  code: number
  label: string
  icon: string
  night?: string
}[] = [
  { code: 0, label: 'Clear', icon: 'sunny', night: 'bedtime' },
  { code: 1, label: 'Mostly Clear', icon: 'sunny', night: 'bedtime' },
  {
    code: 2,
    label: 'Partly Cloudy',
    icon: 'filter_drama',
    night: 'nights_stay'
  },
  { code: 3, label: 'Cloudy', icon: 'cloud' },
  { code: 45, label: 'Fog', icon: 'foggy' },
  { code: 48, label: 'Fog', icon: 'foggy' },
  { code: 51, label: 'Drizzle', icon: 'water_drop' },
  { code: 61, label: 'Rain', icon: 'water_drop' },
  { code: 71, label: 'Snow', icon: 'ac_unit' },
  { code: 80, label: 'Showers', icon: 'water_drop' },
  { code: 95, label: 'Thunderstorms', icon: 'thunderstorm' }
]

function condition(code: number) {
  let match = CONDITIONS[0]
  for (const item of CONDITIONS) {
    if (code >= item.code) match = item
  }
  return match
}

function iconFor(code: number, isDay: boolean) {
  const sky = condition(code)
  return !isDay && sky.night ? sky.night : sky.icon
}

// Open-Meteo local times look like "2026-09-23T06:45" in the place's timezone.
function clockParts(value: string) {
  const match = /T(\d{2}):(\d{2})/.exec(value)
  if (!match) return null
  return { hour: Number(match[1]), minute: Number(match[2]) }
}

function clockLabel(value: string, unit: 'F' | 'C', withMinutes: boolean) {
  const parts = clockParts(value)
  if (!parts) return ''
  const minutes = String(parts.minute).padStart(2, '0')
  if (unit === 'C') {
    return `${String(parts.hour).padStart(2, '0')}${withMinutes ? ':' + minutes : ''}`
  }
  const suffix = parts.hour < 12 ? 'AM' : 'PM'
  const hour = parts.hour % 12 || 12
  return `${hour}${withMinutes ? ':' + minutes : ''} ${suffix}`
}

function upcomingHours(
  data: {
    current?: { time?: string }
    hourly?: {
      time?: string[]
      temperature_2m?: number[]
      weather_code?: number[]
      is_day?: number[]
    }
    daily?: { sunrise?: string[]; sunset?: string[] }
  },
  unit: 'F' | 'C'
): WeatherHour[] {
  const hourly = data.hourly || {}
  const times = Array.isArray(hourly.time) ? hourly.time : []
  const now = String(data.current?.time || '')
  const temps = hourly.temperature_2m || []
  const codes = hourly.weather_code || []
  const days = hourly.is_day || []
  const tempAt = (index: number) =>
    Number.isFinite(Number(temps[index])) ? Number(temps[index]) : null

  const out: { at: string; hour: WeatherHour }[] = []
  for (let index = 0; index < times.length && out.length < 8; index += 1) {
    if (times[index] <= now) continue
    out.push({
      at: times[index],
      hour: {
        time: clockLabel(times[index], unit, false),
        temp: tempAt(index),
        icon: iconFor(Number(codes[index]) || 0, days[index] !== 0),
        kind: 'hour'
      }
    })
  }
  if (out.length === 0) return []

  const last = out[out.length - 1].at
  const sunEvents: { at: string; kind: 'sunrise' | 'sunset' }[] = []
  for (const at of data.daily?.sunrise || [])
    sunEvents.push({ at, kind: 'sunrise' })
  for (const at of data.daily?.sunset || [])
    sunEvents.push({ at, kind: 'sunset' })
  for (const sun of sunEvents) {
    if (!sun.at || sun.at <= now || sun.at >= last) continue
    const hourIndex = times.indexOf(sun.at.slice(0, 13) + ':00')
    out.push({
      at: sun.at,
      hour: {
        time: clockLabel(sun.at, unit, true),
        temp: hourIndex >= 0 ? tempAt(hourIndex) : null,
        icon: 'wb_twilight',
        kind: sun.kind
      }
    })
  }
  out.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
  return out.slice(0, 8).map(item => item.hour)
}

function unitForCountry(country: string) {
  const value = country.trim().toUpperCase()
  if (
    value === 'US' ||
    value === 'USA' ||
    value === 'UNITED STATES' ||
    value === 'LR' ||
    value === 'LIBERIA' ||
    value === 'MM' ||
    value === 'MYANMAR'
  ) {
    return 'F'
  }
  return 'C'
}

function windDirection(degrees: number) {
  const names = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW']
  const index = Math.round(degrees / 45) % 8
  return names[index] || 'N'
}

function weekday(isoDate: string) {
  const parts = isoDate.split('-').map(part => Number(part))
  if (parts.length < 3 || parts.some(part => !Number.isFinite(part)))
    return ''
  const date = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]))
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][
    date.getUTCDay()
  ]
}

async function locateHere() {
  const providers = ['https://ipwho.is/', 'https://ipapi.co/json/']
  for (const url of providers) {
    const found = await axios
      .get(url, { timeout: 8000, validateStatus: () => true })
      .catch(() => null)
    if (!found || found.status !== 200 || typeof found.data !== 'object')
      continue
    const data = found.data || {}
    const latitude = Number(data.latitude)
    const longitude = Number(data.longitude)
    const place = data.city || data.region
    if (!place || Number.isNaN(latitude) || Number.isNaN(longitude))
      continue
    return {
      place: String(place),
      latitude,
      longitude,
      country: String(data.country_code || data.country || '')
    }
  }
  return null
}

async function locate(query: string) {
  const name = query.trim()
  const here = await locateHere()
  if (!name) {
    if (!here) throw new Error('location')
    return here
  }

  const found = await axios.get(
    'https://geocoding-api.open-meteo.com/v1/search',
    {
      params: { name, count: 5 },
      timeout: 8000,
      validateStatus: () => true
    }
  )
  const results = Array.isArray(found.data?.results)
    ? found.data.results
    : []
  if (results.length === 0) throw new Error('place')
  const namedCountry = name.includes(',')
  const localCountry = (here?.country || '').trim().toUpperCase()
  const hit =
    !namedCountry && localCountry
      ? results.find(
          (item: { country_code?: string; country?: string }) =>
            String(item.country_code || item.country || '')
              .trim()
              .toUpperCase() === localCountry ||
            unitForCountry(String(item.country_code || '')) ===
              unitForCountry(localCountry)
        ) || results[0]
      : results[0]
  return {
    place: hit.name as string,
    latitude: hit.latitude as number,
    longitude: hit.longitude as number,
    country: (hit.country_code as string) || (hit.country as string) || ''
  }
}

export type WeatherUnitChoice = 'auto' | 'C' | 'F'

export function getWeatherUnitChoice(): WeatherUnitChoice {
  const stored = getStorageValue('weatherUnit')
  return stored === 'C' || stored === 'F' ? stored : 'auto'
}

export async function fetchWeather(
  query = '',
  unitChoice: WeatherUnitChoice = 'auto'
): Promise<WeatherReport> {
  const where = await locate(query)
  const unit =
    unitChoice === 'auto' ? unitForCountry(where.country) : unitChoice
  const forecast = await axios.get(
    'https://api.open-meteo.com/v1/forecast',
    {
      params: {
        latitude: where.latitude,
        longitude: where.longitude,
        current:
          'temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,wind_speed_10m,wind_direction_10m,is_day',
        hourly: 'temperature_2m,weather_code,is_day',
        daily:
          'temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset',
        temperature_unit: unit === 'F' ? 'fahrenheit' : 'celsius',
        wind_speed_unit: unit === 'F' ? 'mph' : 'kmh',
        timezone: 'auto',
        forecast_days: 2
      },
      timeout: 8000,
      validateStatus: () => true
    }
  )
  if (forecast.status !== 200 || !forecast.data?.current) {
    throw new Error('forecast')
  }
  const code = Number(forecast.data.current.weather_code) || 0
  const sky = condition(code)
  const numberOrNull = (value: unknown) => {
    const parsed = Number(value)
    return Number.isFinite(parsed) ? parsed : null
  }
  const daily = forecast.data.daily || {}
  const tomorrowDate = Array.isArray(daily.time)
    ? String(daily.time[1] || '')
    : ''
  const direction = numberOrNull(forecast.data.current.wind_direction_10m)
  const isDay = forecast.data.current.is_day !== 0
  return {
    query: query.trim(),
    place: where.place,
    temp: numberOrNull(forecast.data.current.temperature_2m),
    unit,
    code,
    label: sky.label,
    icon: iconFor(code, isDay),
    high: numberOrNull(daily.temperature_2m_max?.[0]),
    low: numberOrNull(daily.temperature_2m_min?.[0]),
    feels: numberOrNull(forecast.data.current.apparent_temperature),
    humidity: numberOrNull(forecast.data.current.relative_humidity_2m),
    wind: numberOrNull(forecast.data.current.wind_speed_10m),
    windUnit: unit === 'F' ? 'mph' : 'km/h',
    windDir: direction == null ? '' : windDirection(direction),
    rain: numberOrNull(daily.precipitation_probability_max?.[0]),
    tomorrowDay: weekday(tomorrowDate),
    tomorrowHigh: numberOrNull(daily.temperature_2m_max?.[1]),
    tomorrowLow: numberOrNull(daily.temperature_2m_min?.[1]),
    isDay,
    hours: upcomingHours(forecast.data, unit),
    message: '',
    updatedAt: new Date().toISOString()
  }
}

function hasWeatherTile(layout: Record<string, unknown>) {
  const pages = Array.isArray(layout.pages)
    ? layout.pages
    : [{ tiles: layout.tiles }]
  return pages.some(
    page =>
      page &&
      Array.isArray((page as { tiles?: unknown[] }).tiles) &&
      (page as { tiles: { kind?: string }[] }).tiles.some(
        tile => tile && tile.kind === 'weather'
      )
  )
}

export async function refreshStoredWeather(query?: string) {
  const stored = getStorageValue('screenLayout')
  if (!stored || typeof stored !== 'object' || Array.isArray(stored))
    return null
  const layout = stored as Record<string, unknown>
  if (query === undefined && !hasWeatherTile(layout)) return null
  const previous = (layout.weather || {}) as Partial<WeatherReport>
  const placeQuery = query !== undefined ? query : previous.query || ''
  const save = (weather: Partial<WeatherReport>) => {
    const latest = getStorageValue('screenLayout')
    const base =
      latest && typeof latest === 'object' && !Array.isArray(latest)
        ? (latest as Record<string, unknown>)
        : layout
    setStorageValue('screenLayout', { ...base, weather })
  }
  try {
    const weather = await fetchWeather(placeQuery, getWeatherUnitChoice())
    save(weather)
    log(`Weather updated for ${weather.place}`, 'Weather')
    return weather
  } catch (error) {
    const message =
      (error as Error).message === 'place'
        ? 'That city was not found.'
        : 'Weather could not be loaded.'
    const weather = {
      ...previous,
      query: placeQuery,
      message,
      updatedAt: new Date().toISOString()
    }
    save(weather)
    log(message, 'Weather', LogLevel.WARN)
    return weather
  }
}
