import { contextBridge, ipcRenderer } from 'electron'

interface Shortcut {
  id: string
  command: string
}

enum IPCHandler {
  FindCarThing = 'findCarThing',
  FindSetupCarThing = 'findSetupCarThing',
  RebootCarThing = 'rebootCarThing',
  RestoreCarThing = 'restoreCarThing',
  InstallApp = 'installApp',
  StartServer = 'startServer',
  StopServer = 'stopServer',
  GetServerInfo = 'getServerInfo',
  ForwardSocketServer = 'forwardSocketServer',
  GetVersion = 'getVersion',
  GetStorageValue = 'getStorageValue',
  SetStorageValue = 'setStorageValue',
  TriggerCarThingStateUpdate = 'triggerCarThingStateUpdate',
  UploadShortcutImage = 'uploadShortcutImage',
  RemoveNewShortcutImage = 'removeNewShortcutImage',
  GetShortcuts = 'getShortcuts',
  AddShortcut = 'addShortcut',
  RemoveShortcut = 'removeShortcut',
  UpdateShortcut = 'updateShortcut',
  RefreshCarThing = 'refreshCarThing',
  IsDevMode = 'isDevMode',
  GetBrightness = 'getBrightness',
  SetBrightness = 'setBrightness',
  GetPatches = 'getPatches',
  ApplyPatch = 'applyPatch',
  ValidateConfig = 'validateConfig',
  GetPlaybackHandlerConfig = 'getPlaybackHandlerConfig',
  SetPlaybackHandlerConfig = 'setPlaybackHandlerConfig',
  RestartPlaybackHandler = 'restartPlaybackHandler',
  HasCustomClient = 'hasCustomClient',
  ImportCustomClient = 'importCustomClient',
  RemoveCustomClient = 'removeCustomClient',
  GetLogs = 'getLogs',
  ClearLogs = 'clearLogs',
  DownloadLogs = 'downloadLogs',
  UploadScreensaverImage = 'uploadScreensaverImage',
  RemoveScreensaverImage = 'removeScreensaverImage',
  RemoveScreensaverPhoto = 'removeScreensaverPhoto',
  SetScreensaverPhotoFit = 'setScreensaverPhotoFit',
  ListScreensaverPhotos = 'listScreensaverPhotos',
  GetScreensaverPhotoPreview = 'getScreensaverPhotoPreview',
  HasCustomScreensaverImage = 'hasCustomScreensaverImage',
  OpenDevTools = 'openDevTools',
  GetChannel = 'getChannel',
  CheckUpdate = 'checkUpdate',
  InstallUpdate = 'installUpdate',
  GetUpdateStatus = 'getUpdateStatus',
  FindOpenPort = 'findOpenPort',
  IsPortOpen = 'isPortOpen',
  ImportCalendar = 'importCalendar',
  RefreshWeather = 'refreshWeather',
  RefreshAiUsage = 'refreshAiUsage',
  SetGitHubToken = 'setGitHubToken',
  GetGitHubTokenSource = 'getGitHubTokenSource',
  CommunityCatalog = 'communityCatalog',
  CommunityList = 'communityList',
  CommunityRefreshStore = 'communityRefreshStore',
  CommunityPreviewIssues = 'communityPreviewIssues',
  CommunityAddRepo = 'communityAddRepo',
  CommunityDownload = 'communityDownload',
  CommunityPickZip = 'communityPickZip',
  CommunityStaged = 'communityStaged',
  CommunityConfirm = 'communityConfirm',
  CommunityRemove = 'communityRemove',
  CommunitySetEnabled = 'communitySetEnabled',
  CommunityRemoveRepo = 'communityRemoveRepo'
}

// Custom APIs for renderer
const api = {
  on: (channel: string, listener: (...args: unknown[]) => void) => {
    const _listener = (_event, ...args: unknown[]) => listener(...args)
    ipcRenderer.on(channel, _listener)

    return () => ipcRenderer.removeListener(channel, _listener)
  },
  findCarThing: () => ipcRenderer.invoke(IPCHandler.FindCarThing),
  findSetupCarThing: () =>
    ipcRenderer.invoke(IPCHandler.FindSetupCarThing),
  rebootCarThing: () => ipcRenderer.invoke(IPCHandler.RebootCarThing),
  restoreCarThing: () => ipcRenderer.invoke(IPCHandler.RestoreCarThing),
  installApp: () => ipcRenderer.invoke(IPCHandler.InstallApp),
  startServer: () => ipcRenderer.invoke(IPCHandler.StartServer),
  stopServer: () => ipcRenderer.invoke(IPCHandler.StopServer),
  getServerInfo: () => ipcRenderer.invoke(IPCHandler.GetServerInfo),
  forwardSocketServer: () =>
    ipcRenderer.invoke(IPCHandler.ForwardSocketServer),
  getVersion: () => ipcRenderer.invoke(IPCHandler.GetVersion),
  getStorageValue: (key: string) =>
    ipcRenderer.invoke(IPCHandler.GetStorageValue, key),
  setStorageValue: (key: string, value: unknown) =>
    ipcRenderer.invoke(IPCHandler.SetStorageValue, key, value),
  triggerCarThingStateUpdate: () =>
    ipcRenderer.invoke(IPCHandler.TriggerCarThingStateUpdate),
  uploadShortcutImage: (name: string) =>
    ipcRenderer.invoke(IPCHandler.UploadShortcutImage, name),
  removeNewShortcutImage: () =>
    ipcRenderer.invoke(IPCHandler.RemoveNewShortcutImage),
  getShortcuts: () => ipcRenderer.invoke(IPCHandler.GetShortcuts),
  addShortcut: (shortcut: Shortcut) =>
    ipcRenderer.invoke(IPCHandler.AddShortcut, shortcut),
  removeShortcut: (shortcut: Shortcut) =>
    ipcRenderer.invoke(IPCHandler.RemoveShortcut, shortcut),
  updateShortcut: (shortcut: Shortcut) =>
    ipcRenderer.invoke(IPCHandler.UpdateShortcut, shortcut),
  refreshCarThing: () => ipcRenderer.invoke(IPCHandler.RefreshCarThing),
  isDevMode: () => ipcRenderer.invoke(IPCHandler.IsDevMode),
  getBrightness: () => ipcRenderer.invoke(IPCHandler.GetBrightness),
  setBrightness: (brightness: number) =>
    ipcRenderer.invoke(IPCHandler.SetBrightness, brightness),
  getPatches: () => ipcRenderer.invoke(IPCHandler.GetPatches),
  applyPatch: (patchName: string) =>
    ipcRenderer.invoke(IPCHandler.ApplyPatch, patchName),
  validateConfig: (handlerName: string, config: unknown) =>
    ipcRenderer.invoke(IPCHandler.ValidateConfig, handlerName, config),
  getPlaybackHandlerConfig: (handlerName: string) =>
    ipcRenderer.invoke(IPCHandler.GetPlaybackHandlerConfig, handlerName),
  setPlaybackHandlerConfig: (handlerName: string, config: unknown) =>
    ipcRenderer.invoke(
      IPCHandler.SetPlaybackHandlerConfig,
      handlerName,
      config
    ),
  restartPlaybackHandler: () =>
    ipcRenderer.invoke(IPCHandler.RestartPlaybackHandler),
  hasCustomClient: () => ipcRenderer.invoke(IPCHandler.HasCustomClient),
  importCustomClient: () =>
    ipcRenderer.invoke(IPCHandler.ImportCustomClient),
  removeCustomClient: () =>
    ipcRenderer.invoke(IPCHandler.RemoveCustomClient),
  getLogs: () => ipcRenderer.invoke(IPCHandler.GetLogs),
  clearLogs: () => ipcRenderer.invoke(IPCHandler.ClearLogs),
  downloadLogs: () => ipcRenderer.invoke(IPCHandler.DownloadLogs),
  hasCustomScreensaverImage: () =>
    ipcRenderer.invoke(IPCHandler.HasCustomScreensaverImage),
  listScreensaverPhotos: () =>
    ipcRenderer.invoke(IPCHandler.ListScreensaverPhotos),
  getScreensaverPhotoPreview: (id: string) =>
    ipcRenderer.invoke(IPCHandler.GetScreensaverPhotoPreview, id),
  uploadScreensaverImage: () =>
    ipcRenderer.invoke(IPCHandler.UploadScreensaverImage),
  removeScreensaverImage: () =>
    ipcRenderer.invoke(IPCHandler.RemoveScreensaverImage),
  removeScreensaverPhoto: (id: string) =>
    ipcRenderer.invoke(IPCHandler.RemoveScreensaverPhoto, id),
  setScreensaverPhotoFit: (id: string, fit: 'fill' | 'fit') =>
    ipcRenderer.invoke(IPCHandler.SetScreensaverPhotoFit, id, fit),
  openDevTools: () => ipcRenderer.invoke(IPCHandler.OpenDevTools),
  getChannel: () => ipcRenderer.invoke(IPCHandler.GetChannel),
  checkUpdate: () => ipcRenderer.invoke(IPCHandler.CheckUpdate),
  installUpdate: () => ipcRenderer.invoke(IPCHandler.InstallUpdate),
  getUpdateStatus: () => ipcRenderer.invoke(IPCHandler.GetUpdateStatus),
  findOpenPort: () => ipcRenderer.invoke(IPCHandler.FindOpenPort),
  isPortOpen: port => ipcRenderer.invoke(IPCHandler.IsPortOpen, port),
  importCalendar: (source: 'mac') =>
    ipcRenderer.invoke(IPCHandler.ImportCalendar, source),
  refreshWeather: (query?: string, unit?: 'auto' | 'C' | 'F') =>
    ipcRenderer.invoke(IPCHandler.RefreshWeather, query, unit),
  refreshAiUsage: () => ipcRenderer.invoke(IPCHandler.RefreshAiUsage),
  setGitHubToken: (token: string) =>
    ipcRenderer.invoke(IPCHandler.SetGitHubToken, token),
  getGitHubTokenSource: () =>
    ipcRenderer.invoke(IPCHandler.GetGitHubTokenSource),
  communityCatalog: () => ipcRenderer.invoke(IPCHandler.CommunityCatalog),
  communityList: () => ipcRenderer.invoke(IPCHandler.CommunityList),
  communityRefreshStore: () =>
    ipcRenderer.invoke(IPCHandler.CommunityRefreshStore),
  communityPreviewIssues: (id: string) =>
    ipcRenderer.invoke(IPCHandler.CommunityPreviewIssues, id),
  communityAddRepo: (url: string) =>
    ipcRenderer.invoke(IPCHandler.CommunityAddRepo, url),
  communityDownload: (id: string) =>
    ipcRenderer.invoke(IPCHandler.CommunityDownload, id),
  communityPickZip: () => ipcRenderer.invoke(IPCHandler.CommunityPickZip),
  communityStaged: () => ipcRenderer.invoke(IPCHandler.CommunityStaged),
  communityConfirm: () => ipcRenderer.invoke(IPCHandler.CommunityConfirm),
  communityRemove: (id: string) =>
    ipcRenderer.invoke(IPCHandler.CommunityRemove, id),
  communitySetEnabled: (id: string, enabled: boolean) =>
    ipcRenderer.invoke(IPCHandler.CommunitySetEnabled, id, enabled),
  communityRemoveRepo: (id: string) =>
    ipcRenderer.invoke(IPCHandler.CommunityRemoveRepo, id)
}

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('api', api)
  } catch (error) {
    console.error(error)
  }
} else {
  // @ts-expect-error (define in dts)
  window.api = api
}
