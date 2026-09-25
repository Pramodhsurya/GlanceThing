import { app, dialog } from 'electron'
import axios from 'axios'
import fs from 'fs'
import http from 'http'
import path from 'path'
import { pipeline } from 'stream/promises'

import { getStorageValue, setStorageValue } from './storage.js'
import { ghCliToken } from './github.js'
import { buildUnzipCommand, execAsync, log } from './utils.js'

export interface CommunityIssue {
  id: string
  title: string
  message: string
}

export interface CommunityManifest {
  id: string
  label: string
  version: string
  author: string
  description: string
  repository: string
  platforms?: string[]
  requiredVersions?: { client?: string; server?: string }
}

export interface CommunityCatalogItem {
  id: string
  owner: string
  repo: string
  apiUrl: string
  label: string
  version: string
  author: string
  description: string
  downloadUrl: string
  assetName: string
  htmlUrl: string
  downloads: number
  official?: boolean
  appId?: string
  appPath?: string
  icon?: string
  color?: string
  builtin?: boolean
}

interface OfficialCatalogApp {
  id: string
  label: string
  version: string
  author: string
  description: string
  icon?: string
  color?: string
  path?: string
  builtin?: boolean
}

export const OFFICIAL_APPS_REPO = 'Pramodhsurya/GlanceThing-Apps'

const OFFICIAL_FALLBACK: OfficialCatalogApp[] = [
  {
    id: 'music',
    label: 'Music',
    version: '1.0.0',
    author: 'GlanceThing',
    description:
      'Now playing with seek, skip 10 seconds, shuffle, repeat and volume.',
    icon: 'music_note',
    color: '#a855f7',
    path: 'music'
  },
  {
    id: 'pomodoro',
    label: 'Pomodoro',
    version: '1.0.0',
    author: 'grahamplace',
    description:
      'Focus timer with short and long breaks. Timer from grahamplace/pomodoro-thing.',
    icon: 'timer',
    color: '#ef4444',
    path: 'pomodoro'
  },
  {
    id: 'system',
    label: 'Resource Usage',
    version: '1.0.0',
    author: 'GlanceThing',
    description: 'CPU, memory and uptime of this computer.',
    icon: 'memory',
    color: '#10b981',
    path: 'system'
  },
  {
    id: 'recorder',
    label: 'Recording Notes',
    version: '1.0.0',
    author: 'GlanceThing',
    description: 'Record voice notes with the Car Thing microphone.',
    icon: 'mic',
    color: '#f43f5e',
    path: 'recorder'
  },
  {
    id: 'github',
    label: 'GitHub',
    version: '1.0.0',
    author: 'GlanceThing',
    description: 'Your repos, stars, pull requests and issues.',
    icon: 'code',
    color: '#238636',
    path: 'github'
  },
  {
    id: 'logs',
    label: 'Console Logs',
    version: '1.0.0',
    author: 'GlanceThing',
    description: 'Live GlanceThing logs.',
    icon: 'list_alt',
    color: '#0ea5e9',
    path: 'logs'
  },
  {
    id: 'link',
    label: 'Link',
    version: '1.0.0',
    author: 'GlanceThing',
    description: 'Shared tap board between connected Car Things.',
    icon: 'link',
    color: '#6366f1',
    path: 'link'
  },
  {
    id: 'mic',
    label: 'Mic',
    version: '1.0.0',
    author: 'GlanceThing',
    description:
      'Pick which mics to control. Tap to mute or unmute. Optional pop-up when a mic is in use.',
    icon: 'mic',
    color: '#22c55e',
    path: 'mic'
  },
  {
    id: 'weather',
    label: 'Weather',
    version: '1.0.0',
    author: 'GlanceThing',
    description:
      'Fullscreen weather from the tray, plus a weather widget for home pages.',
    icon: 'wb_sunny',
    color: '#38bdf8',
    path: 'weather',
    builtin: true
  },
  {
    id: 'calendar',
    label: 'Calendar',
    version: '1.0.0',
    author: 'GlanceThing',
    description:
      'Today and tomorrow from Mac Calendar. Ships a calendar widget for the layout.',
    icon: 'calendar_today',
    color: '#f59e0b',
    path: 'calendar',
    builtin: true
  },
  {
    id: 'usage',
    label: 'AI usage',
    version: '1.0.0',
    author: 'GlanceThing',
    description:
      'Codex, Claude and Cursor limits, with widgets you drop on a page.',
    icon: 'data_usage',
    color: '#a78bfa',
    path: 'usage',
    builtin: true
  },
  {
    id: 'photos',
    label: 'Photos',
    version: '1.0.0',
    author: 'GlanceThing',
    description:
      'Browse the photo album from the tray. Ships a photo widget for home pages.',
    icon: 'photo_library',
    color: '#fb7185',
    path: 'photos',
    builtin: true
  },
  {
    id: 'exampleapp',
    label: 'Example App',
    version: '1.0.0',
    author: 'GlanceThing',
    description: 'A template you can copy to make a new GlanceThing app.',
    icon: 'widgets',
    color: '#f59e0b',
    path: 'exampleapp'
  }
]

export interface CommunityInstalledApp {
  id: string
  label: string
  version: string
  author: string
  description: string
  repository: string
  sourceUrl: string
  enabled: boolean
  hasClient: boolean
  clientPath: string
  color: string
  icon: string
  installedAt: string
}

export interface StagedCommunityApp {
  manifest: CommunityManifest
  issues: CommunityIssue[]
  sourceUrl: string
  hasClient: boolean
  clientPath: string
  overwrite: boolean
}

const RESERVED = new Set([
  'music',
  'pomodoro',
  'system',
  'logs',
  'link',
  'recorder',
  'github',
  'mic',
  'weather',
  'calendar',
  'usage',
  'photos',
  'spotify',
  'gmp',
  'local'
])

const COLORS = [
  '#a855f7',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#0ea5e9',
  '#6366f1',
  '#f43f5e',
  '#14b8a6'
]

let staged: StagedCommunityApp | null = null

function appsRoot() {
  return path.join(app.getPath('userData'), 'apps')
}

function stagedDir() {
  return path.join(appsRoot(), '.staged')
}

function appDir(id: string) {
  return path.join(appsRoot(), id)
}

export function colorForId(id: string) {
  let hash = 0
  for (let i = 0; i < id.length; i++)
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0
  return COLORS[hash % COLORS.length]
}

export function parseRepoUrl(value: string) {
  let processed = value.trim()
  if (!processed)
    return { processed: '', valid: false, owner: '', repo: '' }
  processed = processed.replace(/^git@github\.com:/, 'https://github.com/')
  processed = processed.replace(
    /^git:\/\/github\.com\//,
    'https://github.com/'
  )
  if (/^[^/]+\/[^/]+$/.test(processed)) {
    processed = `https://api.github.com/repos/${processed}`
  } else if (
    processed.includes('github.com') &&
    !processed.includes('api.github.com/repos')
  ) {
    processed = processed.replace('github.com', 'api.github.com/repos')
    processed = processed.replace(/\.git$/, '')
    processed = processed.replace(/\/$/, '')
  }
  const match = processed.match(
    /^https:\/\/api\.github\.com\/repos\/([^/]+)\/([^/]+)$/
  )
  return {
    processed,
    valid: !!match,
    owner: match?.[1] ?? '',
    repo: match?.[2] ?? ''
  }
}

async function githubHeaders() {
  const token =
    (getStorageValue('githubToken', true) as string | null) ||
    (await ghCliToken())
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'GlanceThing'
  }
  if (token) headers.Authorization = `Bearer ${token}`
  return headers
}

function isOfficialRepo(owner: string, repo: string) {
  return (
    owner.toLowerCase() === 'pramodhsurya' &&
    repo.toLowerCase() === 'glancething-apps'
  )
}

function isOfficialItem(item: CommunityCatalogItem) {
  return !!item.official || isOfficialRepo(item.owner, item.repo)
}

function listCatalog(): CommunityCatalogItem[] {
  const stored = getStorageValue('communityCatalog')
  return Array.isArray(stored) ? (stored as CommunityCatalogItem[]) : []
}

function listInstalled(): CommunityInstalledApp[] {
  const stored = getStorageValue('communityApps')
  return Array.isArray(stored) ? (stored as CommunityInstalledApp[]) : []
}

function saveCatalog(items: CommunityCatalogItem[]) {
  setStorageValue('communityCatalog', items)
}

function saveInstalled(items: CommunityInstalledApp[]) {
  setStorageValue('communityApps', items)
}

export function getCommunityCatalog() {
  return listCatalog()
}

export function getCommunityApps() {
  return listInstalled()
}

export function getEnabledCommunityApps() {
  return listInstalled()
    .filter(app => app.enabled)
    .map(app => ({
      id: app.id,
      name: app.label,
      icon: app.icon || 'extension',
      color: app.color
    }))
}

function safeId(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9_-]/g, '')
}

function readManifest(dir: string): CommunityManifest | null {
  const candidates = [
    path.join(dir, 'manifest.json'),
    ...fs
      .readdirSync(dir, { withFileTypes: true })
      .filter(e => e.isDirectory())
      .map(e => path.join(dir, e.name, 'manifest.json'))
  ]
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue
    try {
      const raw = JSON.parse(fs.readFileSync(file, 'utf8'))
      const id = safeId(String(raw.id || raw.name || ''))
      if (!id) continue
      return {
        id,
        label: String(raw.label || raw.name || id),
        version: String(raw.version || '0.0.0'),
        author: String(raw.author || 'Unknown'),
        description: String(raw.description || ''),
        repository: String(raw.repository || ''),
        platforms: Array.isArray(raw.platforms)
          ? raw.platforms
          : undefined,
        requiredVersions: raw.requiredVersions
      }
    } catch {
      // try the next candidate
    }
  }
  return null
}

function findClientPath(root: string) {
  const search = [root]
  const nested = fs
    .readdirSync(root, { withFileTypes: true })
    .filter(e => e.isDirectory())
    .map(e => path.join(root, e.name))
  search.push(...nested)
  for (const dir of search) {
    for (const folder of ['client', 'dist', 'webapp']) {
      const index = path.join(dir, folder, 'index.html')
      if (fs.existsSync(index)) return path.join(dir, folder)
    }
    if (fs.existsSync(path.join(dir, 'index.html'))) return dir
  }
  return null
}

function compareVersion(a: string, b: string) {
  const pa = a
    .replace(/^v/, '')
    .split('.')
    .map(n => parseInt(n, 10) || 0)
  const pb = b
    .replace(/^v/, '')
    .split('.')
    .map(n => parseInt(n, 10) || 0)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff) return diff
  }
  return 0
}

function buildIssues(
  manifest: CommunityManifest,
  hasClient: boolean,
  existing?: CommunityInstalledApp
): CommunityIssue[] {
  const issues: CommunityIssue[] = [
    {
      id: 'insecure',
      title: 'Insecure App',
      message:
        'App has not been validated or updated by GlanceThing (It may not work)'
    }
  ]
  if (!hasClient) {
    issues.push({
      id: 'no-client',
      title: 'No Web UI',
      message:
        'This package has no client/index.html. It may be a DeskThing server app that GlanceThing cannot run yet.'
    })
  }
  if (RESERVED.has(manifest.id)) {
    issues.push({
      id: 'reserved',
      title: 'Reserved App ID',
      message: `“${manifest.id}” is a built-in GlanceThing app and cannot be replaced.`
    })
  }
  if (existing) {
    const cmp = compareVersion(manifest.version, existing.version)
    issues.push({
      id: 'exists',
      title: 'App Already Exists',
      message: `App with name ${existing.label} already exists but is ${
        cmp === 0
          ? 'the same version as'
          : cmp > 0
            ? 'older than'
            : 'newer than'
      } incoming version ${manifest.version}`
    })
  }
  const platformAliases: Record<string, string[]> = {
    darwin: ['darwin', 'mac', 'macos', 'osx'],
    win32: ['win32', 'windows', 'win'],
    linux: ['linux']
  }
  const aliases = platformAliases[process.platform] || [process.platform]
  if (
    manifest.platforms?.length &&
    !manifest.platforms.some(p =>
      aliases.includes(String(p).toLowerCase())
    )
  ) {
    issues.push({
      id: 'platform',
      title: 'Incompatible Platform',
      message: `App not compatible with ${process.platform} platform`
    })
  }
  const required = manifest.requiredVersions?.server
  if (required && compareVersion(app.getVersion(), required) < 0) {
    issues.push({
      id: 'compatible-server',
      title: 'compatible-server',
      message: `Server version ${app.getVersion()} incompatible. Requires ${required}`
    })
  }
  return issues
}

async function githubGet<T>(url: string) {
  const res = await axios.get<T>(url, {
    headers: await githubHeaders(),
    timeout: 20000,
    validateStatus: () => true
  })
  if (res.status === 403)
    throw new Error('GitHub API limit reached. Add a token in Settings.')
  if (res.status === 404)
    throw new Error('Repository or release not found.')
  if (res.status !== 200) throw new Error(`GitHub returned ${res.status}`)
  return res.data
}

async function fetchRepoReleaseItems(parsed: {
  processed: string
  owner: string
  repo: string
}): Promise<CommunityCatalogItem[]> {
  const releases = await githubGet<
    {
      html_url: string
      tag_name: string
      assets: {
        name: string
        browser_download_url: string
        download_count?: number
        content_type?: string
      }[]
    }[]
  >(`${parsed.processed}/releases`)

  if (!releases.length)
    throw new Error('This repository has no GitHub releases.')

  const latest = releases[0]
  const zips = (latest.assets || []).filter(
    a =>
      /\.(zip|tar\.gz)$/i.test(a.name) ||
      (a.content_type || '').includes('zip')
  )
  if (!zips.length)
    throw new Error(
      'No .zip release asset found. GlanceThing needs a zip that contains manifest.json.'
    )

  const many = zips.length > 1
  const downloads = latest.assets.reduce(
    (n, a) => n + (a.download_count || 0),
    0
  )
  return zips.map(asset => ({
    id: many
      ? `${parsed.owner}/${parsed.repo}:${asset.name}`
      : `${parsed.owner}/${parsed.repo}`,
    owner: parsed.owner,
    repo: parsed.repo,
    apiUrl: parsed.processed,
    label: many
      ? asset.name.replace(/-app-v?[\d.]+.*$/i, '').replace(/[-_]/g, ' ')
      : parsed.repo,
    version: latest.tag_name.replace(/^v/, ''),
    author: parsed.owner,
    description: '',
    downloadUrl: asset.browser_download_url,
    assetName: asset.name,
    htmlUrl: latest.html_url,
    downloads
  }))
}

function matchOfficialMeta(assetName: string, meta: OfficialCatalogApp[]) {
  const stem = assetName
    .replace(/-app-v?[\d.]+.*$/i, '')
    .replace(/\.(zip|tar\.gz)$/i, '')
    .toLowerCase()
  return meta.find(
    app =>
      app.id === stem ||
      (app.path || '').toLowerCase() === stem ||
      assetName.toLowerCase().startsWith(`${app.id}-`) ||
      (app.path
        ? assetName.toLowerCase().startsWith(`${app.path}-`)
        : false)
  )
}

async function fetchOfficialCatalogJson(): Promise<OfficialCatalogApp[]> {
  try {
    const res = await axios.get<{ apps?: OfficialCatalogApp[] }>(
      `https://raw.githubusercontent.com/${OFFICIAL_APPS_REPO}/main/catalog.json`,
      { timeout: 15000, validateStatus: () => true }
    )
    if (res.status === 200 && Array.isArray(res.data?.apps))
      return res.data.apps
  } catch {
    // use the bundled fallback
  }
  return OFFICIAL_FALLBACK
}

export async function refreshOfficialStore() {
  const parsed = parseRepoUrl(OFFICIAL_APPS_REPO)
  if (!parsed.valid)
    throw new Error('Official apps repo is misconfigured.')

  let releaseItems: CommunityCatalogItem[] = []
  try {
    releaseItems = await fetchRepoReleaseItems(parsed)
  } catch (err) {
    log(
      `Official store releases unavailable: ${(err as Error).message}`,
      'Apps'
    )
  }

  const meta = await fetchOfficialCatalogJson()
  const official: CommunityCatalogItem[] = releaseItems.map(item => {
    const app = matchOfficialMeta(item.assetName, meta)
    const appId = app?.id || guessAppId(item)
    return {
      ...item,
      official: true,
      appId,
      appPath: app?.path || appId,
      label: app?.label || item.label,
      author: app?.author || item.author,
      description: app?.description || item.description,
      icon: app?.icon,
      color: app?.color
    }
  })

  for (const app of meta) {
    if (official.some(item => item.appId === app.id)) continue
    official.push({
      id: `${parsed.owner}/${parsed.repo}:${app.id}`,
      owner: parsed.owner,
      repo: parsed.repo,
      apiUrl: parsed.processed,
      label: app.label,
      version: app.version,
      author: app.author,
      description: app.description,
      downloadUrl: '',
      assetName: '',
      htmlUrl: `https://github.com/${OFFICIAL_APPS_REPO}`,
      downloads: 0,
      official: true,
      appId: app.id,
      appPath: app.path || app.id,
      icon: app.icon,
      color: app.color
    })
  }

  const user = listCatalog().filter(item => !isOfficialItem(item))
  saveCatalog([...official, ...user])
  log(`Official store loaded (${official.length} apps)`, 'Apps')
  return listCatalog()
}

function guessAppId(
  item: Pick<CommunityCatalogItem, 'assetName' | 'label'>
) {
  const stem = (item.assetName || item.label || '')
    .replace(/-app-v?[\d.]+.*$/i, '')
    .replace(/\.(zip|tar\.gz)$/i, '')
    .replace(/\s+/g, '')
  return safeId(stem)
}

export function previewInstallIssues(catalogId: string): CommunityIssue[] {
  const item = listCatalog().find(c => c.id === catalogId)
  if (!item) throw new Error('App is not in the store.')
  const appId = item.appId || guessAppId(item)
  const existing = appId
    ? listInstalled().find(app => app.id === appId)
    : undefined
  return buildIssues(
    {
      id: appId || 'unknown',
      label: item.label,
      version: item.version,
      author: item.author,
      description: item.description,
      repository: item.htmlUrl
    },
    true,
    existing
  )
}

export async function addCommunityRepo(input: string) {
  const parsed = parseRepoUrl(input)
  if (!parsed.valid) throw new Error('Invalid repository URL format')
  if (isOfficialRepo(parsed.owner, parsed.repo)) {
    return refreshOfficialStore()
  }

  const items = await fetchRepoReleaseItems(parsed)
  const prefix = `${parsed.owner}/${parsed.repo}`
  const catalog = listCatalog().filter(
    c =>
      !isOfficialItem(c) &&
      c.id !== prefix &&
      !c.id.startsWith(`${prefix}:`)
  )
  const official = listCatalog().filter(isOfficialItem)
  saveCatalog([...official, ...items, ...catalog])
  log(
    `Added community repo ${prefix} (${items.length} app${items.length === 1 ? '' : 's'})`,
    'Apps'
  )
  return items
}

async function extractArchive(zipPath: string, dest: string) {
  fs.mkdirSync(dest, { recursive: true })
  const cmd = buildUnzipCommand(`"${zipPath}"`, dest)
  if (!cmd) throw new Error('Cannot extract archives on this platform')
  await execAsync(cmd, 60_000)
}

function collectStage(
  root: string,
  sourceUrl: string
): StagedCommunityApp {
  const manifest = readManifest(root)
  if (!manifest) {
    throw new Error('No manifest.json found in the archive.')
  }
  const client = findClientPath(root)
  const existing = listInstalled().find(a => a.id === manifest.id)
  return {
    manifest,
    issues: buildIssues(manifest, !!client, existing),
    sourceUrl,
    hasClient: !!client,
    clientPath: client ? path.relative(root, client) : '',
    overwrite: !!existing
  }
}

export async function downloadCommunityApp(catalogId: string) {
  const item = listCatalog().find(c => c.id === catalogId)
  if (!item) throw new Error('App is not in the store.')
  if (item.downloadUrl) {
    return stageFromUrl(item.downloadUrl, item.htmlUrl || item.apiUrl)
  }
  if (item.official && item.appPath) {
    return stageOfficialFolder(item.appPath, item.htmlUrl || item.apiUrl)
  }
  throw new Error('This app has no download yet.')
}

async function stageOfficialFolder(appPath: string, sourceUrl: string) {
  fs.rmSync(stagedDir(), { recursive: true, force: true })
  fs.mkdirSync(stagedDir(), { recursive: true })
  const zipPath = path.join(stagedDir(), 'repo.zip')
  const extractPath = path.join(stagedDir(), 'repo')
  const url = `https://api.github.com/repos/${OFFICIAL_APPS_REPO}/zipball`
  log(`Downloading official app folder ${appPath}`, 'Apps')
  const res = await axios.get(url, {
    responseType: 'stream',
    headers: await githubHeaders(),
    timeout: 120_000
  })
  await pipeline(res.data, fs.createWriteStream(zipPath))
  await extractArchive(zipPath, extractPath)
  const roots = fs
    .readdirSync(extractPath, { withFileTypes: true })
    .filter(entry => entry.isDirectory())
  const repoRoot = roots[0]
    ? path.join(extractPath, roots[0].name)
    : extractPath
  const appRoot = path.join(repoRoot, appPath)
  if (!fs.existsSync(appRoot))
    throw new Error(`App folder ${appPath} was not found in the repo.`)
  const dest = path.join(stagedDir(), 'extracted')
  fs.cpSync(appRoot, dest, { recursive: true })
  staged = collectStage(dest, sourceUrl)
  return staged
}

export async function stageFromUrl(
  downloadUrl: string,
  sourceUrl: string
) {
  fs.rmSync(stagedDir(), { recursive: true, force: true })
  fs.mkdirSync(stagedDir(), { recursive: true })
  const zipPath = path.join(stagedDir(), 'app.zip')
  const extractPath = path.join(stagedDir(), 'extracted')

  log(`Downloading community app ${downloadUrl}`, 'Apps')
  const res = await axios.get(downloadUrl, {
    responseType: 'stream',
    headers: await githubHeaders(),
    timeout: 120_000
  })
  await pipeline(res.data, fs.createWriteStream(zipPath))
  await extractArchive(zipPath, extractPath)
  staged = collectStage(extractPath, sourceUrl)
  return staged
}

export async function stageFromZipFile(filePath: string) {
  fs.rmSync(stagedDir(), { recursive: true, force: true })
  fs.mkdirSync(stagedDir(), { recursive: true })
  const extractPath = path.join(stagedDir(), 'extracted')
  await extractArchive(filePath, extractPath)
  staged = collectStage(extractPath, filePath)
  return staged
}

export async function pickCommunityZip() {
  const result = await dialog.showOpenDialog({
    title: 'Upload Local File',
    properties: ['openFile'],
    filters: [{ name: 'Zip', extensions: ['zip', 'tar.gz'] }]
  })
  if (result.canceled || !result.filePaths[0]) return null
  return stageFromZipFile(result.filePaths[0])
}

export function getStagedCommunityApp() {
  return staged
}

export function confirmCommunityInstall() {
  if (!staged) throw new Error('Nothing is staged.')
  if (RESERVED.has(staged.manifest.id))
    throw new Error('That app id is reserved.')

  const id = staged.manifest.id
  const dest = appDir(id)
  const extractPath = path.join(stagedDir(), 'extracted')
  if (!fs.existsSync(extractPath))
    throw new Error('Staged files are missing.')

  fs.mkdirSync(appsRoot(), { recursive: true })
  fs.rmSync(dest, { recursive: true, force: true })
  fs.renameSync(extractPath, dest)

  const record: CommunityInstalledApp = {
    id,
    label: staged.manifest.label,
    version: staged.manifest.version,
    author: staged.manifest.author,
    description: staged.manifest.description,
    repository: staged.manifest.repository || staged.sourceUrl,
    sourceUrl: staged.sourceUrl,
    enabled: true,
    hasClient: staged.hasClient,
    clientPath: staged.clientPath,
    color: colorForId(id),
    icon: 'extension',
    installedAt: new Date().toISOString()
  }

  const others = listInstalled().filter(a => a.id !== id)
  saveInstalled([record, ...others])
  staged = null
  fs.rmSync(stagedDir(), { recursive: true, force: true })
  log(`Installed community app ${id}`, 'Apps')
  return record
}

export function setCommunityAppEnabled(id: string, enabled: boolean) {
  saveInstalled(
    listInstalled().map(app => (app.id === id ? { ...app, enabled } : app))
  )
}

export function removeCommunityApp(id: string) {
  const next = listInstalled().filter(app => app.id !== id)
  saveInstalled(next)
  fs.rmSync(appDir(id), { recursive: true, force: true })
  log(`Removed community app ${id}`, 'Apps')
}

export function removeCommunityRepo(id: string) {
  const item = listCatalog().find(c => c.id === id)
  if (item && isOfficialItem(item))
    throw new Error('Official store apps cannot be removed.')
  saveCatalog(listCatalog().filter(c => c.id !== id))
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon'
}

export function serveCommunityRequest(
  req: http.IncomingMessage,
  res: http.ServerResponse
) {
  const host = req.headers.host || 'localhost'
  const url = new URL(req.url || '/', `http://${host}`)
  const match = url.pathname.match(/^\/community\/([^/]+)(?:\/(.*))?$/)
  if (!match) return false

  const id = safeId(decodeURIComponent(match[1]))
  const installed = listInstalled().find(a => a.id === id && a.enabled)
  if (!installed || !installed.hasClient) {
    res.statusCode = 404
    res.end('App not found')
    return true
  }

  const root = path.resolve(appDir(id), installed.clientPath || '.')
  let rest = decodeURIComponent(match[2] || '')
  if (!rest || rest.endsWith('/')) rest += 'index.html'
  const file = path.resolve(root, rest)
  if (!file.startsWith(root + path.sep) && file !== root) {
    res.statusCode = 403
    res.end()
    return true
  }
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.statusCode = 404
    res.end()
    return true
  }
  res.setHeader(
    'Content-Type',
    MIME[path.extname(file).toLowerCase()] || 'application/octet-stream'
  )
  res.setHeader('Cache-Control', 'no-cache')
  fs.createReadStream(file).pipe(res)
  return true
}
