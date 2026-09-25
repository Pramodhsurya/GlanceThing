import { session } from 'electron'
import { execFile } from 'child_process'
import fs from 'fs'
import os from 'os'
import path from 'path'

import { log, LogLevel } from './utils.js'
import {
  getStorageValue,
  isAppInstalled,
  setStorageValue
} from './storage.js'

export type UsageProviderId = 'codex' | 'claude' | 'cursor'

export interface UsageWindow {
  label: string
  left: number
  resetsAt: string | null
}

export interface UsageCost {
  today: number
  todayTokens: number
  month: number
  monthTokens: number
  days: number[]
}

export interface UsageProvider {
  id: UsageProviderId
  name: string
  plan: string
  status: 'ok' | 'stale' | 'off'
  message: string
  windows: UsageWindow[]
  notes: string[]
  cost?: UsageCost
  updatedAt: string
}

export interface AiUsageReport {
  providers: UsageProvider[]
  updatedAt: string
}

const PROVIDERS: { id: UsageProviderId; name: string }[] = [
  { id: 'codex', name: 'Codex' },
  { id: 'claude', name: 'Claude' },
  { id: 'cursor', name: 'Cursor' }
]

// Read-only: tokens are never refreshed here, because rotating a refresh
// token would sign the owning CLI or app out.
class SignedOut extends Error {}

const home = os.homedir()

function run(file: string, args: string[]) {
  return new Promise<string>((resolve, reject) => {
    execFile(
      file,
      args,
      { timeout: 15000, maxBuffer: 1 << 20 },
      (err, out) => (err ? reject(err) : resolve(String(out).trim()))
    )
  })
}

// The default session encrypts its cookie store with the Keychain key, and it
// stays broken if startup had to wait on a Keychain prompt. These requests send
// no cookies, so an in-memory session avoids that.
function usageFetch(url: string, init: RequestInit) {
  return session.fromPartition('ai-usage').fetch(url, init)
}

// Chromium's network stack trusts the macOS keychain, which TLS-inspecting
// proxies rely on; Node's bundled CA list does not.
async function getJson(url: string, headers: Record<string, string>) {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 15000)
  try {
    const res = await usageFetch(url, {
      headers,
      signal: controller.signal,
      credentials: 'omit'
    })
    const data = await res.json().catch(() => null)
    return { status: res.status, headers: res.headers, data }
  } finally {
    clearTimeout(timer)
  }
}

function jwtPayload(token: string): Record<string, unknown> {
  try {
    const part = token.split('.')[1] || ''
    return JSON.parse(Buffer.from(part, 'base64url').toString('utf8'))
  } catch {
    return {}
  }
}

function clampLeft(used: unknown) {
  const value = Number(used)
  if (!Number.isFinite(value)) return 100
  return Math.max(0, Math.min(100, 100 - value))
}

function isoFromSeconds(value: unknown) {
  const seconds = Number(value)
  return Number.isFinite(seconds) && seconds > 0
    ? new Date(seconds * 1000).toISOString()
    : null
}

function isoFrom(value: unknown) {
  if (typeof value !== 'string' || !value) return null
  const ms = Date.parse(value)
  return Number.isNaN(ms) ? null : new Date(ms).toISOString()
}

function planName(raw: unknown) {
  const value = String(raw || '').toLowerCase()
  const names: Record<string, string> = {
    free: 'Free',
    plus: 'Plus',
    pro: 'Pro',
    pro_plus: 'Pro+',
    max: 'Max',
    ultra: 'Ultra',
    team: 'Team',
    business: 'Business',
    enterprise: 'Enterprise'
  }
  return (
    names[value] || (value ? value[0].toUpperCase() + value.slice(1) : '')
  )
}

function statusError(status: number) {
  if (status === 401 || status === 403) return new SignedOut('expired')
  return new Error(`HTTP ${status}`)
}

async function codexUsage(): Promise<Partial<UsageProvider>> {
  const file = path.join(
    process.env.CODEX_HOME || path.join(home, '.codex'),
    'auth.json'
  )
  if (!fs.existsSync(file)) throw new SignedOut('Sign in to Codex')
  const auth = JSON.parse(fs.readFileSync(file, 'utf8'))
  const token = auth?.tokens?.access_token
  if (!token) throw new SignedOut('Sign in to Codex')
  const exp = Number(jwtPayload(token).exp)
  if (exp && exp * 1000 < Date.now()) throw new SignedOut('expired')

  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/json',
    'User-Agent': 'GlanceThing'
  }
  if (auth.tokens.account_id)
    headers['ChatGPT-Account-Id'] = auth.tokens.account_id
  const res = await getJson(
    'https://chatgpt.com/backend-api/wham/usage',
    headers
  )
  if (res.status !== 200) throw statusError(res.status)
  const data = res.data || {}
  const windows: UsageWindow[] = []
  const primary = data.rate_limit?.primary_window
  const secondary = data.rate_limit?.secondary_window
  if (primary) {
    windows.push({
      label: 'Session',
      left: clampLeft(primary.used_percent),
      resetsAt: isoFromSeconds(primary.reset_at)
    })
  }
  if (secondary) {
    windows.push({
      label: 'Weekly',
      left: clampLeft(secondary.used_percent),
      resetsAt: isoFromSeconds(secondary.reset_at)
    })
  }
  for (const extra of Array.isArray(data.additional_rate_limits)
    ? data.additional_rate_limits
    : []) {
    const window = extra?.rate_limit?.primary_window
    if (!window) continue
    windows.push({
      label: String(
        extra.limit_name || extra.normal_model_slug || 'Model'
      ),
      left: clampLeft(window.used_percent),
      resetsAt: isoFromSeconds(window.reset_at)
    })
  }

  const notes: string[] = []
  const resets = Number(data.rate_limit_reset_credits?.available_count)
  if (resets > 0)
    notes.push(
      `${resets} limit ${resets === 1 ? 'reset' : 'resets'} available`
    )
  const balance = Number(data.credits?.balance)
  if (data.credits?.has_credits && balance > 0)
    notes.push(`${balance} credits`)
  const cost = await codexCost().catch(err => {
    log(
      `Codex cost scan failed: ${err.message}`,
      'AI usage',
      LogLevel.WARN
    )
    return undefined
  })
  return { plan: planName(data.plan_type), windows, notes, cost }
}

async function claudeCredentials() {
  const file = path.join(home, '.claude', '.credentials.json')
  let raw = ''
  if (fs.existsSync(file)) raw = fs.readFileSync(file, 'utf8')
  else if (process.platform === 'darwin') {
    raw = await run('/usr/bin/security', [
      'find-generic-password',
      '-s',
      'Claude Code-credentials',
      '-w'
    ]).catch(() => '')
  }
  if (!raw) throw new SignedOut('Sign in to Claude Code')
  const creds = JSON.parse(raw)?.claudeAiOauth
  if (!creds?.accessToken) throw new SignedOut('Sign in to Claude Code')
  return creds as {
    accessToken: string
    expiresAt?: number
    subscriptionType?: string
    rateLimitTier?: string
  }
}

function claudePlan(creds: {
  subscriptionType?: string
  rateLimitTier?: string
}) {
  const plan = planName(creds.subscriptionType)
  const tier = /(\d+)x/.exec(creds.rateLimitTier || '')
  return plan === 'Max' && tier ? `Max ${tier[1]}x` : plan
}

let claudeRetryAt = 0

async function claudeUsage(): Promise<Partial<UsageProvider>> {
  const creds = await claudeCredentials()
  const plan = claudePlan(creds)
  const cost = await claudeCost().catch(err => {
    log(
      `Claude cost scan failed: ${err.message}`,
      'AI usage',
      LogLevel.WARN
    )
    return undefined
  })
  if (creds.expiresAt && creds.expiresAt < Date.now()) {
    throw Object.assign(new SignedOut('expired'), {
      partial: { plan, cost }
    })
  }
  if (Date.now() < claudeRetryAt) {
    throw Object.assign(new Error('Rate limited, trying again soon'), {
      partial: { plan, cost }
    })
  }

  const res = await getJson('https://api.anthropic.com/api/oauth/usage', {
    Authorization: `Bearer ${creds.accessToken}`,
    Accept: 'application/json',
    'anthropic-beta': 'oauth-2025-04-20',
    'User-Agent': 'claude-code/2.0.0'
  })
  if (res.status === 429) {
    const wait = Number(res.headers.get('retry-after'))
    claudeRetryAt =
      Date.now() +
      (Number.isFinite(wait) && wait > 0 ? wait * 1000 : 10 * 60 * 1000)
    throw Object.assign(new Error('Rate limited, trying again soon'), {
      partial: { plan, cost }
    })
  }
  if (res.status !== 200) {
    throw Object.assign(statusError(res.status), {
      partial: { plan, cost }
    })
  }
  const data = res.data || {}
  const windows: UsageWindow[] = []
  const add = (
    label: string,
    value: { utilization?: number; resets_at?: string } | null
  ) => {
    if (!value || typeof value !== 'object') return
    windows.push({
      label,
      left: clampLeft(value.utilization),
      resetsAt: isoFrom(value.resets_at)
    })
  }
  add('Session', data.five_hour)
  add('Weekly', data.seven_day)
  add('Opus weekly', data.seven_day_opus)
  add('Sonnet weekly', data.seven_day_sonnet)

  const notes: string[] = []
  const extra = data.extra_usage
  if (extra?.is_enabled) {
    const scale = Math.pow(10, Number(extra.decimal_places) || 2)
    const used = Number(extra.used_credits) / scale
    const limit = Number(extra.monthly_limit) / scale
    if (Number.isFinite(used) && Number.isFinite(limit) && limit > 0) {
      notes.push(`Extra usage $${used.toFixed(2)} of $${limit.toFixed(0)}`)
    }
  }
  return { plan, windows, notes, cost }
}

async function cursorUsage(): Promise<Partial<UsageProvider>> {
  const config =
    process.platform === 'darwin'
      ? path.join(home, 'Library', 'Application Support')
      : process.platform === 'win32'
        ? process.env.APPDATA || path.join(home, 'AppData', 'Roaming')
        : process.env.XDG_CONFIG_HOME || path.join(home, '.config')
  const db = path.join(
    config,
    'Cursor',
    'User',
    'globalStorage',
    'state.vscdb'
  )
  if (!fs.existsSync(db)) throw new SignedOut('Sign in to Cursor')
  const token = await run(
    process.platform === 'darwin' ? '/usr/bin/sqlite3' : 'sqlite3',
    [
      '-readonly',
      db,
      "select value from ItemTable where key='cursorAuth/accessToken'"
    ]
  ).catch(() => '')
  if (!token) throw new SignedOut('Sign in to Cursor')
  const payload = jwtPayload(token)
  const exp = Number(payload.exp)
  if (exp && exp * 1000 < Date.now()) throw new SignedOut('expired')
  const userId = String(payload.sub || '')
    .split('|')
    .pop()
  if (!userId) throw new SignedOut('Sign in to Cursor')

  const session = {
    Cookie: `WorkosCursorSessionToken=${userId}%3A%3A${token}`,
    Accept: 'application/json'
  }
  const res = await getJson(
    'https://cursor.com/api/usage-summary',
    session
  )
  if (res.status !== 200) throw statusError(res.status)
  const data = res.data || {}
  const plan = data.individualUsage?.plan || {}
  const resetsAt = isoFrom(data.billingCycleEnd)
  const windows: UsageWindow[] = []
  if (plan.totalPercentUsed != null) {
    windows.push({
      label: 'Total',
      left: clampLeft(plan.totalPercentUsed),
      resetsAt
    })
  }
  if (plan.autoPercentUsed != null) {
    windows.push({
      label: 'Auto',
      left: clampLeft(plan.autoPercentUsed),
      resetsAt
    })
  }
  if (plan.apiPercentUsed != null) {
    windows.push({
      label: 'API',
      left: clampLeft(plan.apiPercentUsed),
      resetsAt
    })
  }
  const notes: string[] = []
  const onDemand = data.individualUsage?.onDemand
  if (onDemand?.enabled && Number(onDemand.limit) > 0) {
    notes.push(
      `On-demand $${(Number(onDemand.used) / 100).toFixed(2)} of $${(Number(onDemand.limit) / 100).toFixed(0)}`
    )
  }
  const cost = await cursorCost(session).catch(err => {
    log(`Cursor spend failed: ${err.message}`, 'AI usage', LogLevel.WARN)
    return undefined
  })
  return { plan: planName(data.membershipType), windows, notes, cost }
}

// Prices per million tokens: input, output, cache read, cache write (5 min).
const CLAUDE_PRICES: [RegExp, number, number, number, number][] = [
  [/fable-5-1/, 10, 50, 0.25, 12.5],
  [/fable-5/, 10, 50, 1, 12.5],
  [/opus-5-5/, 4, 20, 0.2, 5],
  [/opus-5/, 5, 25, 0.5, 6.25],
  [/sonnet-5/, 2, 10, 0.2, 2.5],
  [/opus-4-[5-9]/, 5, 25, 0.5, 6.25],
  [/opus-4/, 15, 75, 1.5, 18.75],
  [/sonnet-4/, 3, 15, 0.3, 3.75],
  [/haiku-4/, 1, 5, 0.1, 1.25],
  [/haiku-3-5/, 0.8, 4, 0.08, 1],
  [/opus/, 5, 25, 0.5, 6.25],
  [/sonnet/, 2, 10, 0.2, 2.5],
  [/haiku/, 1, 5, 0.1, 1.25]
]

interface ClaudeTurn {
  day: string
  model: string
  input: number
  output: number
  cacheRead: number
  cacheWrite: number
  cacheWrite1h: number
}

function turnCost(turn: ClaudeTurn) {
  const price = CLAUDE_PRICES.find(([pattern]) => pattern.test(turn.model))
  if (!price) return 0
  const [, input, output, read, write] = price
  const write5m = Math.max(0, turn.cacheWrite - turn.cacheWrite1h)
  return (
    (turn.input * input +
      turn.output * output +
      turn.cacheRead * read +
      write5m * write +
      turn.cacheWrite1h * input * 2) /
    1e6
  )
}

function localDay(ms: number) {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

type DayTotals = Record<string, { cost: number; tokens: number }>

const fileCache = new Map<
  string,
  { mtimeMs: number; size: number; days: DayTotals }
>()

function scanClaudeFile(file: string): DayTotals {
  const turns = new Map<string, ClaudeTurn>()
  const text = fs.readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    if (!line.includes('"assistant"') || !line.includes('"usage"'))
      continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const usage = entry?.message?.usage
    if (entry?.type !== 'assistant' || !usage) continue
    const time = Date.parse(entry.timestamp)
    if (Number.isNaN(time)) continue
    const key = `${entry.message.id || ''}:${entry.requestId || ''}`
    const turn: ClaudeTurn = {
      day: localDay(time),
      model: String(entry.message.model || ''),
      input: Number(usage.input_tokens) || 0,
      output: Number(usage.output_tokens) || 0,
      cacheRead: Number(usage.cache_read_input_tokens) || 0,
      cacheWrite: Number(usage.cache_creation_input_tokens) || 0,
      cacheWrite1h:
        Number(usage.cache_creation?.ephemeral_1h_input_tokens) || 0
    }
    const seen = turns.get(key)
    if (key === ':' || !seen || turn.output > seen.output) {
      turns.set(key === ':' ? `${turns.size}` : key, turn)
    }
  }
  const days: Record<string, { cost: number; tokens: number }> = {}
  for (const turn of turns.values()) {
    const bucket =
      days[turn.day] || (days[turn.day] = { cost: 0, tokens: 0 })
    bucket.cost += turnCost(turn)
    bucket.tokens +=
      turn.input + turn.output + turn.cacheRead + turn.cacheWrite
  }
  return days
}

function listJsonl(root: string, since: number, out: string[]) {
  let entries: fs.Dirent[]
  try {
    entries = fs.readdirSync(root, { withFileTypes: true })
  } catch {
    return
  }
  for (const entry of entries) {
    const full = path.join(root, entry.name)
    if (entry.isDirectory()) listJsonl(full, since, out)
    else if (entry.name.endsWith('.jsonl')) {
      try {
        if (fs.statSync(full).mtimeMs >= since) out.push(full)
      } catch {
        // file vanished while scanning
      }
    }
  }
}

// Prices per million tokens: input, output, cached input.
const CODEX_PRICES: [RegExp, number, number, number][] = [
  [/gpt-5\.6-luna/, 0.2, 1.2, 0.02],
  [/gpt-5\.6-terra/, 1.25, 10, 0.125],
  [/gpt-5\.(5|6)/, 5, 30, 0.5],
  [/gpt-5.*mini/, 0.25, 2, 0.025],
  [/gpt-5/, 1.25, 10, 0.125],
  [/./, 5, 30, 0.5]
]

function codexTokens(raw: Record<string, unknown> | undefined) {
  return {
    input: Number(raw?.input_tokens) || 0,
    cached: Number(raw?.cached_input_tokens) || 0,
    output: Number(raw?.output_tokens) || 0,
    total: Number(raw?.total_tokens) || 0
  }
}

// token_count events repeat, so only growth of the running total counts.
function scanCodexFile(file: string): DayTotals {
  const days: DayTotals = {}
  let model = ''
  let previous = codexTokens(undefined)
  const text = fs.readFileSync(file, 'utf8')
  for (const line of text.split('\n')) {
    if (
      !line.includes('"turn_context"') &&
      !line.includes('"token_count"')
    )
      continue
    let entry
    try {
      entry = JSON.parse(line)
    } catch {
      continue
    }
    const payload = entry?.payload || {}
    if (entry?.type === 'turn_context' && payload.model) {
      model = String(payload.model)
      continue
    }
    if (payload.type !== 'token_count' || !payload.info?.total_token_usage)
      continue
    const time = Date.parse(entry.timestamp)
    if (Number.isNaN(time)) continue
    const total = codexTokens(payload.info.total_token_usage)
    const input = Math.max(0, total.input - previous.input)
    const cached = Math.max(0, total.cached - previous.cached)
    const output = Math.max(0, total.output - previous.output)
    const tokens = Math.max(0, total.total - previous.total)
    previous = total
    if (tokens === 0) continue
    const price =
      CODEX_PRICES.find(([pattern]) => pattern.test(model)) ||
      CODEX_PRICES[0]
    const [, inRate, outRate, cacheRate] = price
    const day = localDay(time)
    const bucket = days[day] || (days[day] = { cost: 0, tokens: 0 })
    bucket.cost +=
      (Math.max(0, input - cached) * inRate +
        cached * cacheRate +
        output * outRate) /
      1e6
    bucket.tokens += tokens
  }
  return days
}

async function logCost(
  roots: string[],
  scan: (file: string) => DayTotals
): Promise<UsageCost | undefined> {
  const found = roots.filter(root => fs.existsSync(root))
  if (found.length === 0) return undefined

  const since = Date.now() - 31 * 86400000
  const files: string[] = []
  for (const root of found) listJsonl(root, since, files)
  const totals: DayTotals = {}
  for (const file of files) {
    const stat = fs.statSync(file)
    let cached = fileCache.get(file)
    if (
      !cached ||
      cached.mtimeMs !== stat.mtimeMs ||
      cached.size !== stat.size
    ) {
      cached = { mtimeMs: stat.mtimeMs, size: stat.size, days: scan(file) }
      fileCache.set(file, cached)
      await new Promise(resolve => setImmediate(resolve))
    }
    for (const [day, value] of Object.entries(cached.days)) {
      const bucket = totals[day] || (totals[day] = { cost: 0, tokens: 0 })
      bucket.cost += value.cost
      bucket.tokens += value.tokens
    }
  }
  for (const file of fileCache.keys()) {
    if (
      found.some(root => file.startsWith(root)) &&
      !files.includes(file)
    ) {
      fileCache.delete(file)
    }
  }

  const now = Date.now()
  const today = localDay(now)
  let month = 0
  let monthTokens = 0
  const days: number[] = []
  for (let offset = 29; offset >= 0; offset -= 1) {
    const value = totals[localDay(now - offset * 86400000)]
    month += value?.cost || 0
    monthTokens += value?.tokens || 0
    if (offset < 14) days.push(Math.round((value?.cost || 0) * 100) / 100)
  }
  return {
    today: totals[today]?.cost || 0,
    todayTokens: totals[today]?.tokens || 0,
    month,
    monthTokens,
    days
  }
}

function claudeCost() {
  return logCost(
    [
      path.join(home, '.claude', 'projects'),
      path.join(home, '.config', 'claude', 'projects')
    ],
    scanClaudeFile
  )
}

function codexCost() {
  const codexHome = process.env.CODEX_HOME || path.join(home, '.codex')
  return logCost(
    [
      path.join(codexHome, 'sessions'),
      path.join(codexHome, 'archived_sessions')
    ],
    scanCodexFile
  )
}

async function cursorSpend(
  headers: Record<string, string>,
  start: number,
  end: number
) {
  const res = await usageFetch(
    'https://cursor.com/api/dashboard/get-aggregated-usage-events',
    {
      method: 'POST',
      headers: {
        ...headers,
        'Content-Type': 'application/json',
        Origin: 'https://cursor.com',
        Referer: 'https://cursor.com/dashboard'
      },
      body: JSON.stringify({ teamId: -1, startDate: start, endDate: end }),
      signal: AbortSignal.timeout(15000),
      credentials: 'omit'
    }
  )
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`)
  const data = await res.json()
  const tokens =
    (Number(data.totalInputTokens) || 0) +
    (Number(data.totalOutputTokens) || 0) +
    (Number(data.totalCacheWriteTokens) || 0) +
    (Number(data.totalCacheReadTokens) || 0)
  return { cost: (Number(data.totalCostCents) || 0) / 100, tokens }
}

async function cursorCost(
  headers: Record<string, string>
): Promise<UsageCost | undefined> {
  const now = Date.now()
  const midnight = new Date(now)
  midnight.setHours(0, 0, 0, 0)
  const [today, month] = await Promise.all([
    cursorSpend(headers, midnight.getTime(), now),
    cursorSpend(headers, now - 30 * 86400000, now)
  ])
  return {
    today: today.cost,
    todayTokens: today.tokens,
    month: month.cost,
    monthTokens: month.tokens,
    days: []
  }
}

const FETCHERS: Record<
  UsageProviderId,
  () => Promise<Partial<UsageProvider>>
> = {
  codex: codexUsage,
  claude: claudeUsage,
  cursor: cursorUsage
}

const OPEN_HINTS: Record<UsageProviderId, string> = {
  codex: 'Open Codex to refresh the sign-in',
  claude: 'Open Claude Code to refresh the sign-in',
  cursor: 'Open Cursor to refresh the sign-in'
}

async function readProvider(
  id: UsageProviderId,
  name: string,
  previous?: UsageProvider
): Promise<UsageProvider> {
  const updatedAt = new Date().toISOString()
  try {
    const found = await FETCHERS[id]()
    return {
      id,
      name,
      plan: found.plan || '',
      status: 'ok',
      message: '',
      windows: found.windows || [],
      notes: found.notes || [],
      cost: found.cost,
      updatedAt
    }
  } catch (error) {
    const err = error as Error & { partial?: Partial<UsageProvider> }
    const signedOut = err instanceof SignedOut
    const message =
      signedOut && err.message === 'expired'
        ? OPEN_HINTS[id]
        : signedOut
          ? err.message
          : err.message.startsWith('Rate limited')
            ? err.message
            : `${name} usage could not be loaded`
    if (!signedOut || err.message !== 'expired') {
      log(`${name}: ${err.message}`, 'AI usage', LogLevel.WARN)
    }
    const keep = previous && previous.windows.length > 0
    return {
      id,
      name,
      plan: err.partial?.plan || previous?.plan || '',
      status: keep ? 'stale' : 'off',
      message,
      windows: keep ? previous.windows : [],
      notes: keep ? previous.notes : [],
      cost: err.partial?.cost || previous?.cost,
      updatedAt: keep ? previous.updatedAt : updatedAt
    }
  }
}

export function hasUsageTile() {
  const layout = getStorageValue('screenLayout') as {
    pages?: { tiles?: { kind?: string }[] }[]
    tiles?: { kind?: string }[]
  } | null
  if (!layout || typeof layout !== 'object') return false
  const lists = Array.isArray(layout.pages)
    ? layout.pages.map(page => page?.tiles || [])
    : [layout.tiles || []]
  return lists.some(
    tiles =>
      Array.isArray(tiles) && tiles.some(tile => tile?.kind === 'usage')
  )
}

let running: Promise<AiUsageReport | null> | null = null

export function refreshAiUsage(
  force = false
): Promise<AiUsageReport | null> {
  if (!force && !hasUsageTile() && !isAppInstalled('usage'))
    return Promise.resolve(null)
  if (running) return running
  running = (async () => {
    const stored = getStorageValue('aiUsage') as AiUsageReport | null
    const previous = Array.isArray(stored?.providers)
      ? stored.providers
      : []
    const providers = await Promise.all(
      PROVIDERS.map(({ id, name }) =>
        readProvider(
          id,
          name,
          previous.find(item => item.id === id)
        )
      )
    )
    const report = { providers, updatedAt: new Date().toISOString() }
    setStorageValue('aiUsage', report)
    return report
  })().finally(() => {
    running = null
  })
  return running
}
