import CoreAudio
import Foundation

struct Device {
  let id: AudioDeviceID
  let name: String
  let canMute: Bool
  let muted: Bool
  let active: Bool
}

func address(_ selector: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope)
  -> AudioObjectPropertyAddress
{
  AudioObjectPropertyAddress(
    mSelector: selector,
    mScope: scope,
    mElement: kAudioObjectPropertyElementMain
  )
}

func stringProp(_ id: AudioObjectID, _ selector: AudioObjectPropertySelector) -> String {
  var addr = address(selector, kAudioObjectPropertyScopeGlobal)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(id, &addr, 0, nil, &size) == noErr else { return "" }
  var cf: CFString?
  var used = size
  let err = withUnsafeMutablePointer(to: &cf) { ptr in
    AudioObjectGetPropertyData(id, &addr, 0, nil, &used, ptr)
  }
  guard err == noErr, let cf else { return "" }
  return cf as String
}

func hasInput(_ id: AudioDeviceID) -> Bool {
  var addr = address(kAudioDevicePropertyStreamConfiguration, kAudioDevicePropertyScopeInput)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(id, &addr, 0, nil, &size) == noErr, size > 0 else {
    return false
  }
  let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: 8)
  defer { raw.deallocate() }
  var used = size
  guard AudioObjectGetPropertyData(id, &addr, 0, nil, &used, raw) == noErr else { return false }
  let list = raw.bindMemory(to: AudioBufferList.self, capacity: 1)
  return Int(list.pointee.mNumberBuffers) > 0
}

func muteState(_ id: AudioDeviceID) -> (can: Bool, muted: Bool) {
  var addr = address(kAudioDevicePropertyMute, kAudioDevicePropertyScopeInput)
  var val: UInt32 = 0
  var size = UInt32(MemoryLayout<UInt32>.size)
  let err = AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &val)
  return (err == noErr, val != 0)
}

func isRunning(_ id: AudioDeviceID) -> Bool {
  var addr = address(
    kAudioDevicePropertyDeviceIsRunningSomewhere,
    kAudioObjectPropertyScopeGlobal
  )
  var val: UInt32 = 0
  var size = UInt32(MemoryLayout<UInt32>.size)
  guard AudioObjectGetPropertyData(id, &addr, 0, nil, &size, &val) == noErr else {
    return false
  }
  return val != 0
}

func setMuted(_ id: AudioDeviceID, _ muted: Bool) -> Bool {
  var addr = address(kAudioDevicePropertyMute, kAudioDevicePropertyScopeInput)
  var val: UInt32 = muted ? 1 : 0
  return AudioObjectSetPropertyData(
    id,
    &addr,
    0,
    nil,
    UInt32(MemoryLayout<UInt32>.size),
    &val
  ) == noErr
}

func allInputs() -> [Device] {
  var addr = address(kAudioHardwarePropertyDevices, kAudioObjectPropertyScopeGlobal)
  var size: UInt32 = 0
  guard AudioObjectGetPropertyDataSize(AudioObjectID(kAudioObjectSystemObject), &addr, 0, nil, &size)
    == noErr
  else { return [] }
  let count = Int(size) / MemoryLayout<AudioDeviceID>.size
  var ids = [AudioDeviceID](repeating: 0, count: count)
  var used = size
  guard
    AudioObjectGetPropertyData(
      AudioObjectID(kAudioObjectSystemObject),
      &addr,
      0,
      nil,
      &used,
      &ids
    ) == noErr
  else { return [] }

  return ids.compactMap { id in
    guard hasInput(id) else { return nil }
    let name = stringProp(id, kAudioObjectPropertyName)
    if isVirtual(name) { return nil }
    let mute = muteState(id)
    return Device(
      id: id,
      name: name,
      canMute: mute.can,
      muted: mute.muted,
      active: isRunning(id)
    )
  }
}

func isVirtual(_ name: String) -> Bool {
  let n = name.lowercased()
  let skip = [
    "aggregate", "zoom", "teams", "webex", "skype", "discord", "slack",
    "soundflower", "blackhole", "loopback", "vb-audio", "virtual"
  ]
  return skip.contains { n.contains($0) }
}

let devices = allInputs()
let args = Array(CommandLine.arguments.dropFirst())
let action = args.first ?? "status"
let named = Set(args.dropFirst())
let targets = named.isEmpty
  ? devices
  : devices.filter { named.contains($0.name) }
let wantMute: Bool? = {
  switch action {
  case "mute": return true
  case "unmute": return false
  case "toggle":
    return targets.contains(where: { $0.canMute && !$0.muted })
  default: return nil
  }
}()

if let wantMute {
  for device in targets where device.canMute {
    _ = setMuted(device.id, wantMute)
  }
}

let after = allInputs()
let afterTargets = named.isEmpty
  ? after
  : after.filter { named.contains($0.name) }
let controllable = afterTargets.filter(\.canMute)
let muted = !controllable.isEmpty && controllable.allSatisfy(\.muted)
let payload: [String: Any] = [
  "muted": muted,
  "active": after.contains(where: \.active),
  "devices": after.map {
    [
      "name": $0.name,
      "muted": $0.muted,
      "canMute": $0.canMute,
      "active": $0.active
    ]
  }
]
let data = try JSONSerialization.data(withJSONObject: payload)
FileHandle.standardOutput.write(data)
