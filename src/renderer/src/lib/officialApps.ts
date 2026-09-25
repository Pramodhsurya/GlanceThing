export const OFFICIAL_APP_IDS = [
  'music',
  'pomodoro',
  'system',
  'recorder',
  'github',
  'logs',
  'link',
  'mic'
] as const

export type OfficialAppId = (typeof OFFICIAL_APP_IDS)[number]

export function isOfficialAppId(id: string | undefined): id is OfficialAppId {
  return !!id && (OFFICIAL_APP_IDS as readonly string[]).includes(id)
}

export function asInstalledApps(value: unknown): string[] | null {
  return Array.isArray(value) ? (value as string[]) : null
}
