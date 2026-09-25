import { execFile } from 'child_process'
import { app } from 'electron'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

import { getStorageValue, setStorageValue } from './storage.js'
import { execAsync, log } from './utils.js'

const execFileAsync = promisify(execFile)

export interface MicDevice {
  name: string
  muted: boolean
  canMute: boolean
  active: boolean
}

export interface MicState {
  muted: boolean
  active: boolean
  selected: string[]
  devices: MicDevice[]
  autoOpen: boolean
}

type Listener = (state: MicState) => void
type OpenListener = () => void

const listeners = new Set<Listener>()
const openListeners = new Set<OpenListener>()
let cached: MicState = {
  muted: false,
  active: false,
  selected: [],
  devices: [],
  autoOpen: true
}
let helperPath: string | null = null
let monitor: ReturnType<typeof setInterval> | null = null
let wasActive = false
let pendingOpen = false

export function onMicChange(listener: Listener) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function onMicShouldOpen(listener: OpenListener) {
  openListeners.add(listener)
  return () => openListeners.delete(listener)
}

function micAutoOpen() {
  return getStorageValue('micAutoOpen') !== false
}

export function setMicAutoOpen(on: boolean) {
  setStorageValue('micAutoOpen', on)
}

export function notifyMicAutoOpenChanged() {
  if (!micAutoOpen()) pendingOpen = false
  emit({ ...cached, autoOpen: micAutoOpen() })
}

function requestOpen() {
  if (!micAutoOpen()) return
  pendingOpen = true
  openListeners.forEach(l => l())
}

export function flushMicOpen(send: (payload: unknown) => void) {
  if (!pendingOpen || !micAutoOpen()) return
  send({ type: 'mic', action: 'open' })
}

let selectedCache: string[] | null | undefined
let knownCache: string[] | null = null

function savedSelection() {
  if (selectedCache !== undefined) return selectedCache
  const saved = getStorageValue('micSelected')
  selectedCache = Array.isArray(saved) ? (saved as string[]) : null
  return selectedCache
}

function resolveSelected(devices: MicDevice[]) {
  const names = devices.map(d => d.name)
  if (!knownCache) {
    const stored = getStorageValue('micKnown')
    knownCache = Array.isArray(stored) ? (stored as string[]) : []
  }
  const saved = savedSelection()
  const newcomers = names.filter(n => knownCache!.indexOf(n) === -1)
  if (newcomers.length || names.join('\0') !== knownCache.join('\0')) {
    knownCache = names
    setStorageValue('micKnown', names)
  }
  if (!saved) return names
  return names.filter(n => saved.indexOf(n) !== -1 || newcomers.indexOf(n) !== -1)
}

function withSelection(
  state: Omit<MicState, 'selected' | 'autoOpen'>
): MicState {
  return {
    ...state,
    selected: resolveSelected(state.devices),
    autoOpen: micAutoOpen()
  }
}

function emit(state: MicState) {
  cached = { ...state, autoOpen: micAutoOpen() }
  listeners.forEach(l => l(cached))
}

export function micState() {
  return cached
}

function swiftSource() {
  return path.join(
    process.env.NODE_ENV === 'development'
      ? app.getAppPath()
      : path.join(process.resourcesPath, 'app.asar.unpacked'),
    'resources',
    'common',
    'micmute',
    'mute.swift'
  )
}

async function macHelper() {
  if (helperPath && fs.existsSync(helperPath)) return helperPath
  const dest = path.join(app.getPath('userData'), 'micmute')
  const src = swiftSource()
  if (!fs.existsSync(src)) throw new Error('Mic helper is missing.')
  const stamp = `${src}:${fs.statSync(src).mtimeMs}`
  const stampFile = dest + '.src'
  if (
    !fs.existsSync(dest) ||
    !fs.existsSync(stampFile) ||
    fs.readFileSync(stampFile, 'utf8') !== stamp
  ) {
    await execFileAsync('swiftc', ['-O', '-o', dest, src], { timeout: 60000 })
    fs.writeFileSync(stampFile, stamp)
  }
  helperPath = dest
  return dest
}

function parseState(raw: string): Omit<MicState, 'selected' | 'autoOpen'> {
  const parsed = JSON.parse(raw) as {
    muted?: boolean
    active?: boolean
    devices?: MicDevice[]
  }
  const devices = (Array.isArray(parsed.devices) ? parsed.devices : []).map(
    d => ({
      name: String(d.name || ''),
      muted: !!d.muted,
      canMute: !!d.canMute,
      active: !!d.active
    })
  )
  return {
    muted: !!parsed.muted,
    active: !!parsed.active || devices.some(d => d.active),
    devices
  }
}

async function runMac(
  action: 'status' | 'mute' | 'unmute' | 'toggle',
  names: string[]
) {
  const bin = await macHelper()
  const { stdout } = await execFileAsync(bin, [action, ...names], {
    timeout: 8000
  })
  return parseState(stdout.toString())
}

function linuxSources(text: string) {
  return text
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => line.split(/\s+/)[1])
    .filter(name => name && !/monitor/i.test(name))
}

async function runLinux(action: 'status' | 'mute' | 'unmute' | 'toggle') {
  let list = ''
  try {
    list = await execAsync('pactl list short sources', 4000)
  } catch {
    throw new Error('PulseAudio / PipeWire (pactl) is not available.')
  }
  const names = linuxSources(list)
  const states = await Promise.all(
    names.map(async name => {
      const out = await execAsync(`pactl get-source-mute ${name}`, 3000).catch(
        () => 'Mute: no'
      )
      return { name, muted: /yes/i.test(out), active: false }
    })
  )
  const running = await execAsync('pactl list sources', 4000).catch(() => '')
  for (const s of states) {
    const block = running.split('Name: ').find(b => b.startsWith(s.name))
    s.active = !!block && /State:\s*RUNNING/i.test(block.slice(0, 400))
  }
  const pick = resolveSelected(
    states.map(s => ({
      name: s.name,
      muted: s.muted,
      canMute: true,
      active: s.active
    }))
  )
  const targets = states.filter(s => pick.indexOf(s.name) !== -1)
  const anyLive = targets.some(s => !s.muted)
  const want =
    action === 'mute' ? true : action === 'unmute' ? false : anyLive
  if (action !== 'status') {
    await Promise.all(
      targets.map(s =>
        execAsync(`pactl set-source-mute ${s.name} ${want ? 1 : 0}`, 3000)
      )
    )
  }
  const after =
    action === 'status'
      ? states
      : states.map(s =>
          targets.some(t => t.name === s.name) ? { ...s, muted: want } : s
        )
  return {
    muted: targets.length > 0 && targets.every(s =>
      action === 'status' ? s.muted : want
    ),
    active: after.some(s => s.active),
    devices: after.map(s => ({
      name: s.name,
      muted: s.muted,
      canMute: true,
      active: s.active
    }))
  }
}

async function runWindows(action: 'status' | 'mute' | 'unmute' | 'toggle') {
  const script = `
$ErrorActionPreference = 'Stop'
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
using System.Collections.Generic;
public static class GtMic {
  [ComImport, Guid("BCDE0395-E52F-467C-8E3D-C4579291692E")]
  class MMDeviceEnumerator {}
  [ComImport, Guid("A95664D2-9614-4F35-A746-DE8DB63617E6"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceEnumerator {
    int EnumAudioEndpoints(int dataFlow, int stateMask, out IMMDeviceCollection devices);
    int GetDefaultAudioEndpoint(int dataFlow, int role, out IMMDevice device);
  }
  [ComImport, Guid("0BD7A1BE-7A1A-44DB-8397-CC498A07BDD2"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDeviceCollection {
    int GetCount(out uint count);
    int Item(uint index, out IMMDevice device);
  }
  [ComImport, Guid("D666063F-1587-4E43-81F1-B948E807363F"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IMMDevice {
    int Activate(ref Guid iid, int clsCtx, IntPtr paramsPtr, [MarshalAs(UnmanagedType.IUnknown)] out object iface);
    int OpenPropertyStore(int access, out IPropertyStore store);
  }
  [ComImport, Guid("886d8eeb-8cf2-4446-8d02-cdba1dbdcf99"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IPropertyStore {
    int GetCount(out int count);
    int GetAt(int i, out PROPERTYKEY key);
    int GetValue(ref PROPERTYKEY key, out PROPVARIANT pv);
  }
  [ComImport, Guid("5CDF2C82-841E-4546-9722-0CF74078229A"), InterfaceType(ComInterfaceType.InterfaceIsIUnknown)]
  interface IAudioEndpointVolume {
    int RegisterControlChangeNotify(IntPtr n);
    int UnregisterControlChangeNotify(IntPtr n);
    int GetChannelCount(out uint c);
    int SetMasterVolumeLevel(float l, Guid e);
    int SetMasterVolumeLevelScalar(float l, Guid e);
    int GetMasterVolumeLevel(out float l);
    int GetMasterVolumeLevelScalar(out float l);
    int SetChannelVolumeLevel(uint c, float l, Guid e);
    int SetChannelVolumeLevelScalar(uint c, float l, Guid e);
    int GetChannelVolumeLevel(uint c, out float l);
    int GetChannelVolumeLevelScalar(uint c, out float l);
    int SetMute([MarshalAs(UnmanagedType.Bool)] bool mute, Guid e);
    int GetMute(out bool mute);
  }
  [StructLayout(LayoutKind.Sequential)]
  struct PROPERTYKEY { public Guid fmtid; public int pid; }
  [StructLayout(LayoutKind.Sequential)]
  struct PROPVARIANT {
    public short vt; public short w1; public short w2; public short w3;
    public IntPtr data;
  }
  public static string Run(string action) {
    var enumerator = (IMMDeviceEnumerator)new MMDeviceEnumerator();
    IMMDeviceCollection col;
    enumerator.EnumAudioEndpoints(1, 1, out col);
    uint count; col.GetCount(out count);
    var names = new List<string>();
    var muted = new List<bool>();
    var volIid = new Guid("5CDF2C82-841E-4546-9722-0CF74078229A");
    var nameKey = new PROPERTYKEY { fmtid = new Guid("A45C254E-DF1C-4EFD-8020-67D146A850E0"), pid = 14 };
    IAudioEndpointVolume first = null;
    bool anyLive = false;
    for (uint i = 0; i < count; i++) {
      IMMDevice dev; col.Item(i, out dev);
      object iface; dev.Activate(ref volIid, 1, IntPtr.Zero, out iface);
      var vol = (IAudioEndpointVolume)iface;
      bool m; vol.GetMute(out m);
      IPropertyStore store; dev.OpenPropertyStore(0, out store);
      PROPVARIANT pv; store.GetValue(ref nameKey, out pv);
      var name = Marshal.PtrToStringUni(pv.data) ?? ("Input " + i);
      names.Add(name); muted.Add(m);
      if (!m) anyLive = true;
      if (first == null) first = vol;
    }
    bool want = action == "mute" ? true : action == "unmute" ? false : action == "toggle" ? anyLive : false;
    if (action != "status") {
      for (uint i = 0; i < count; i++) {
        IMMDevice dev; col.Item(i, out dev);
        object iface; dev.Activate(ref volIid, 1, IntPtr.Zero, out iface);
        ((IAudioEndpointVolume)iface).SetMute(want, Guid.Empty);
        muted[(int)i] = want;
      }
    }
    var parts = new List<string>();
    bool allMuted = names.Count > 0;
    for (int i = 0; i < names.Count; i++) {
      if (!muted[i]) allMuted = false;
      parts.Add("{\\"name\\":\\"" + names[i].Replace("\\\\","\\\\\\\\").Replace("\\"","\\\\\\"") + "\\",\\"muted\\":" + (muted[i] ? "true" : "false") + ",\\"canMute\\":true}");
    }
    return "{\\"muted\\":" + (allMuted ? "true" : "false") + ",\\"devices\\":[" + string.Join(",", parts.ToArray()) + "]}";
  }
}
"@
[GtMic]::Run('${action}')
`
  const { stdout } = await execFileAsync(
    'powershell.exe',
    ['-NoProfile', '-Command', script],
    { timeout: 15000 }
  )
  return parseState(stdout.toString().trim().split('\n').pop() || '{}')
}

async function run(action: 'status' | 'mute' | 'unmute' | 'toggle') {
  const names =
    action === 'status' ? [] : resolveSelected(cached.devices)
  if (process.platform === 'darwin')
    return withSelection(await runMac(action, names))
  if (process.platform === 'linux') return withSelection(await runLinux(action))
  if (process.platform === 'win32') return withSelection(await runWindows(action))
  throw new Error('Mic mute is not available on this system.')
}

function noteActive(state: MicState) {
  if (state.active && !wasActive) requestOpen()
  if (!state.active) pendingOpen = false
  wasActive = state.active
}

export async function refreshMic() {
  const state = await run('status')
  noteActive(state)
  emit(state)
  return state
}

export async function setMicMuted(muted: boolean) {
  const state = await run(muted ? 'mute' : 'unmute')
  noteActive(state)
  emit(state)
  log(state.muted ? 'Microphones muted' : 'Microphones unmuted', 'Mic')
  return state
}

export async function toggleMic() {
  const state = await run('toggle')
  noteActive(state)
  emit(state)
  log(state.muted ? 'Microphones muted' : 'Microphones unmuted', 'Mic')
  return state
}

export async function selectMics(names: string[]) {
  selectedCache = names
  setStorageValue('micSelected', names)
  const state = await refreshMic()
  return state
}

export function startMicMonitor() {
  if (monitor) return
  void refreshMic().catch(() => undefined)
  monitor = setInterval(() => {
    void refreshMic().catch(() => undefined)
  }, 1000)
}
