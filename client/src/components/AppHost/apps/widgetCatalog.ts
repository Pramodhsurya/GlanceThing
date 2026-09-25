import type {
  TileKind,
  UsageStyle,
  UsageTarget
} from '../../Widgets/screenModel'

export interface WidgetOffer {
  id: string
  appId: string
  kind: TileKind
  label: string
  hint: string
  icon: string
  provider?: UsageTarget
  usageStyle?: UsageStyle
}

export interface WidgetGroup {
  appId: string
  name: string
  icon: string
  color: string
  widgets: WidgetOffer[]
}

export const HOME_APP_ID = 'home'

export const FEATURE_APP_IDS = [
  'weather',
  'calendar',
  'usage',
  'photos'
] as const

export const WIDGET_GROUPS: WidgetGroup[] = [
  {
    appId: HOME_APP_ID,
    name: 'Home',
    icon: 'dashboard',
    color: '#64748b',
    widgets: [
      {
        id: 'layout',
        appId: HOME_APP_ID,
        kind: 'layout',
        label: 'Layout',
        hint: 'App shortcuts',
        icon: 'grid_view'
      },
      {
        id: 'actions',
        appId: HOME_APP_ID,
        kind: 'actions',
        label: 'Actions',
        hint: 'Lock, sleep…',
        icon: 'touch_app'
      },
      {
        id: 'playback',
        appId: HOME_APP_ID,
        kind: 'playback',
        label: 'Playback',
        hint: 'Now playing',
        icon: 'music_note'
      }
    ]
  },
  {
    appId: 'weather',
    name: 'Weather',
    icon: 'wb_sunny',
    color: '#38bdf8',
    widgets: [
      {
        id: 'weather',
        appId: 'weather',
        kind: 'weather',
        label: 'Weather',
        hint: 'Now and hourly',
        icon: 'wb_sunny'
      }
    ]
  },
  {
    appId: 'calendar',
    name: 'Calendar',
    icon: 'calendar_today',
    color: '#f59e0b',
    widgets: [
      {
        id: 'calendar',
        appId: 'calendar',
        kind: 'calendar',
        label: 'Calendar',
        hint: 'Today, tomorrow',
        icon: 'calendar_today'
      }
    ]
  },
  {
    appId: 'usage',
    name: 'AI usage',
    icon: 'data_usage',
    color: '#a78bfa',
    widgets: [
      {
        id: 'usage',
        appId: 'usage',
        kind: 'usage',
        label: 'AI usage',
        hint: 'Codex, Claude, Cursor',
        icon: 'data_usage'
      }
    ]
  },
  {
    appId: 'photos',
    name: 'Photos',
    icon: 'photo_library',
    color: '#fb7185',
    widgets: [
      {
        id: 'photos',
        appId: 'photos',
        kind: 'photos',
        label: 'Photo',
        hint: 'Album on the page',
        icon: 'photo_library'
      }
    ]
  }
]
