import axios, { AxiosInstance } from 'axios'
import fs from 'fs'

import { getStorageValue, setStorageValue } from './storage.js'
import { execAsync } from './utils.js'

const GH_PATHS = ['gh', '/opt/homebrew/bin/gh', '/usr/local/bin/gh']
const PAGE = 30
const LIST = 15

export interface GitHubRepo {
  fullName: string
  name: string
  owner: string
  description: string | null
  private: boolean
  stars: number
  forks: number
  openIssues: number
  language: string | null
  updatedAt: string
}

export interface GitHubItem {
  number: number
  title: string
  author: string
  state: string
  draft: boolean
  merged: boolean
  comments: number
  updatedAt: string
  labels: { name: string; color: string }[]
}

export interface GitHubOverview {
  user: { login: string; name: string | null; avatar: string | null; followers: number; publicRepos: number }
  repos: GitHubRepo[]
  starred: GitHubRepo[]
  fetchedAt: number
}

let cached: GitHubOverview | null = null

export function setGitHubToken(token: string) {
  setStorageValue('githubToken', token.trim(), true)
  cached = null
}

export function getRefreshMinutes() {
  const value = Number(getStorageValue('githubRefreshMinutes'))
  return value > 0 ? value : 15
}

export async function ghCliToken() {
  for (const bin of GH_PATHS) {
    if (bin.startsWith('/') && !fs.existsSync(bin)) continue
    const out = await execAsync(`"${bin}" auth token`, 5000).catch(() => null)
    if (out?.trim()) return out.trim()
  }
  return null
}

export async function getGitHubTokenSource(): Promise<'saved' | 'gh' | 'none'> {
  if (getStorageValue('githubToken', true)) return 'saved'
  return (await ghCliToken()) ? 'gh' : 'none'
}

async function client(): Promise<AxiosInstance> {
  const token = getStorageValue('githubToken', true) || (await ghCliToken())
  if (!token) throw new Error('no_token')
  return axios.create({
    baseURL: 'https://api.github.com',
    timeout: 15000,
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28'
    }
  })
}

type RawRepo = {
  full_name: string
  name: string
  owner: { login: string }
  description: string | null
  private: boolean
  stargazers_count: number
  forks_count: number
  open_issues_count: number
  language: string | null
  updated_at: string
}

function mapRepo(r: RawRepo): GitHubRepo {
  return {
    fullName: r.full_name,
    name: r.name,
    owner: r.owner.login,
    description: r.description,
    private: r.private,
    stars: r.stargazers_count,
    forks: r.forks_count,
    openIssues: r.open_issues_count,
    language: r.language,
    updatedAt: r.updated_at
  }
}

export async function getOverview(refresh = false): Promise<GitHubOverview> {
  if (!refresh && cached && Date.now() - cached.fetchedAt < getRefreshMinutes() * 60_000)
    return cached

  const api = await client()
  const [user, repos, starred] = await Promise.all([
    api.get('/user'),
    api.get('/user/repos', { params: { sort: 'updated', per_page: PAGE } }),
    api.get('/user/starred', { params: { sort: 'updated', per_page: PAGE } })
  ])

  cached = {
    user: {
      login: user.data.login,
      name: user.data.name,
      avatar: user.data.avatar_url,
      followers: user.data.followers,
      publicRepos: user.data.public_repos
    },
    repos: (repos.data as RawRepo[]).map(mapRepo),
    starred: (starred.data as RawRepo[]).map(mapRepo),
    fetchedAt: Date.now()
  }
  return cached
}

type RawItem = {
  number: number
  title: string
  user: { login: string } | null
  state: string
  draft?: boolean
  merged_at?: string | null
  comments?: number
  updated_at: string
  labels?: { name: string; color: string }[]
  pull_request?: unknown
}

function mapItem(i: RawItem): GitHubItem {
  return {
    number: i.number,
    title: i.title,
    author: i.user?.login ?? 'ghost',
    state: i.state,
    draft: !!i.draft,
    merged: !!i.merged_at,
    comments: i.comments ?? 0,
    updatedAt: i.updated_at,
    labels: (i.labels ?? []).map(l => ({ name: l.name, color: l.color }))
  }
}

export async function getRepoDetail(fullName: string, state: 'open' | 'closed') {
  if (!/^[\w.-]+\/[\w.-]+$/.test(fullName)) throw new Error('Invalid repository')
  const api = await client()
  const [pulls, issues] = await Promise.all([
    api.get(`/repos/${fullName}/pulls`, {
      params: { state, per_page: LIST, sort: 'updated', direction: 'desc' }
    }),
    api.get(`/repos/${fullName}/issues`, {
      params: { state, per_page: LIST * 2, sort: 'updated', direction: 'desc' }
    })
  ])

  return {
    fullName,
    state,
    pulls: (pulls.data as RawItem[]).map(mapItem),
    issues: (issues.data as RawItem[])
      .filter(i => !i.pull_request)
      .slice(0, LIST)
      .map(mapItem)
  }
}
