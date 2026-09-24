import '@electron-toolkit/preload'

interface Shortcut {
  id: string
  command: string
}

declare global {
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
      } | null>
      findOpenPort: () => Promise<number>
      isPortOpen: (port: number) => Promise<boolean>
      importCalendar: (source: 'mac') => Promise<{
        source: 'mac'
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
    }
  }
}
