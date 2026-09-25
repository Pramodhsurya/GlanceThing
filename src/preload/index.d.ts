import '@electron-toolkit/preload'

interface Shortcut {
  id: string
  command: string
}

declare global {
  interface CommunityIssue {
    id: string
    title: string
    message: string
  }

  interface CommunityCatalogItem {
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

  interface CommunityInstalledApp {
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

  interface StagedCommunityApp {
    manifest: {
      id: string
      label: string
      version: string
      author: string
      description: string
      repository: string
    }
    issues: CommunityIssue[]
    sourceUrl: string
    hasClient: boolean
    clientPath: string
    overwrite: boolean
  }

  interface UpdateStatus {
    state: 'idle' | 'downloading' | 'installing' | 'restarting' | 'error'
    version?: string
    progress?: number
    error?: string
  }

  interface Window {
    api: {
      on: (
        channel: string,
        listener: (...args: unknown[]) => void
      ) => () => void
      findCarThing: () => Promise<string | boolean>
      findSetupCarThing: () => Promise<
        'not_found' | 'not_installed' | 'ready'
      >
      rebootCarThing: () => Promise<void>
      restoreCarThing: () => Promise<void>
      installApp: () => Promise<string | true>
      startServer: () => Promise<void>
      stopServer: () => Promise<void>
      getServerInfo: () => Promise<{
        running: boolean
        port: number | null
      }>
      forwardSocketServer: () => Promise<void>
      getVersion: () => Promise<string>
      getStorageValue: (key: string) => Promise<unknown>
      setStorageValue: (key: string, value: unknown) => Promise
      triggerCarThingStateUpdate: () => void
      uploadShortcutImage: (name: string) => Promise<string>
      removeNewShortcutImage: () => Promise<void>
      getShortcuts: () => Promise<Shortcut[]>
      addShortcut: (shortcut: Shortcut) => Promise<void>
      removeShortcut: (id: string) => Promise<void>
      updateShortcut: (shortcut: Shortcut) => Promise<void>
      refreshCarThing: () => Promise<void>
      isDevMode: () => Promise<boolean>
      getBrightness: () => Promise<number>
      setBrightness: (brightness: number) => Promise<void>
      getPatches: () => Promise<
        { name: string; description: string; installed: boolean }[] | false
      >
      applyPatch: (patchName: string) => Promise<void>
      validateConfig: (
        handlerName: string,
        config: unknown
      ) => Promise<boolean>
      getPlaybackHandlerConfig: (handlerName: string) => Promise<unknown>
      setPlaybackHandlerConfig: (
        handlerName: string,
        config: unknown
      ) => Promise<void>
      restartPlaybackHandler: () => Promise<void>
      hasCustomClient: () => Promise<boolean>
      importCustomClient: () => Promise<void>
      removeCustomClient: () => Promise<void>
      getLogs: () => Promise<string[]>
      clearLogs: () => Promise<void>
      downloadLogs: () => Promise<void>
      uploadScreensaverImage: () => Promise<{
        success: boolean
        error?: string
        message?: string
        added?: number
        count?: number
      }>
      removeScreensaverImage: () => Promise<boolean>
      removeScreensaverPhoto: (id: string) => Promise<boolean>
      setScreensaverPhotoFit: (
        id: string,
        fit: 'fill' | 'fit'
      ) => Promise<boolean>
      listScreensaverPhotos: () => Promise<
        { id: string; name: string; fit: 'fill' | 'fit' }[]
      >
      getScreensaverPhotoPreview: (id: string) => Promise<string | null>
      hasCustomScreensaverImage: () => Promise<boolean>
      openDevTools: () => void
      getChannel: () => Promise<'stable' | 'nightly'>
      checkUpdate: () => Promise<{
        currentVersion: string
        latestVersion: string
        downloadUrl: string
        updateAvailable: boolean
        canInstall: boolean
      } | null>
      installUpdate: () => Promise<void>
      getUpdateStatus: () => Promise<UpdateStatus>
      findOpenPort: () => Promise<number>
      isPortOpen: (port: number) => Promise<boolean>
      importCalendar: (
        source: 'mac' | 'google' | 'teams' | 'slack'
      ) => Promise<{
        source: 'mac' | 'google' | 'teams' | 'slack'
        events: {
          title: string
          start: string
          end: string
          where: string
        }[]
        message: string
      }>
      refreshWeather: (
        query?: string,
        unit?: 'auto' | 'C' | 'F'
      ) => Promise<{
        place: string
        temp: number | null
        unit: 'F' | 'C'
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
        days: {
          date: string
          day: string
          high: number | null
          low: number | null
          icon: string
          label: string
          rain: number | null
        }[]
        isDay: boolean
        hours: {
          time: string
          temp: number | null
          icon: string
          kind: 'hour' | 'sunrise' | 'sunset'
        }[]
        message: string
        query: string
      } | null>
      refreshAiUsage: () => Promise<unknown>
      setGitHubToken: (token: string) => Promise<void>
      getGitHubTokenSource: () => Promise<'saved' | 'gh' | 'none'>
      communityCatalog: () => Promise<CommunityCatalogItem[]>
      communityList: () => Promise<CommunityInstalledApp[]>
      communityRefreshStore: () => Promise<CommunityCatalogItem[]>
      communityPreviewIssues: (id: string) => Promise<CommunityIssue[]>
      communityAddRepo: (url: string) => Promise<CommunityCatalogItem[]>
      communityDownload: (id: string) => Promise<StagedCommunityApp>
      communityPickZip: () => Promise<StagedCommunityApp | null>
      communityStaged: () => Promise<StagedCommunityApp | null>
      communityConfirm: () => Promise<CommunityInstalledApp>
      communityRemove: (id: string) => Promise<void>
      communitySetEnabled: (id: string, enabled: boolean) => Promise<void>
      communityRemoveRepo: (id: string) => Promise<void>
    }
  }
}
