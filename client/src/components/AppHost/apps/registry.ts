export interface AppDefinition {
  id: string
  name: string
  icon: string
  color: string
}

export const BUILTIN_APPS: AppDefinition[] = [
  {
    id: 'music',
    name: 'Music',
    icon: 'music_note',
    color: '#a855f7'
  },
  {
    id: 'pomodoro',
    name: 'Pomodoro',
    icon: 'timer',
    color: '#ef4444'
  },
  {
    id: 'system',
    name: 'Resource Usage',
    icon: 'memory',
    color: '#10b981'
  },
  {
    id: 'recorder',
    name: 'Recording Notes',
    icon: 'mic',
    color: '#f43f5e'
  },
  {
    id: 'github',
    name: 'GitHub',
    icon: 'code',
    color: '#238636'
  },
  {
    id: 'logs',
    name: 'Console Logs',
    icon: 'list_alt',
    color: '#0ea5e9'
  },
  {
    id: 'link',
    name: 'Link',
    icon: 'link',
    color: '#6366f1'
  },
  {
    id: 'mic',
    name: 'Mic',
    icon: 'mic',
    color: '#22c55e'
  }
]
