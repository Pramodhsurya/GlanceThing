import { Handler } from '../../types/WebSocketHandler.js'

import * as actions from './actions.js'
import * as apps from './apps.js'
import * as layout from './layout.js'
import * as lock from './lock.js'
import * as ping from './ping.js'
import * as playback from './playback.js'
import * as reboot from './reboot.js'
import * as restore from './restore.js'
import * as screensaver from './screensaver.js'
import * as sleep from './sleep.js'
import * as time from './time.js'
import * as update from './update.js'
import * as version from './version.js'
import * as wake from './wake.js'

export const handlers: Handler[] = [
  actions,
  apps,
  layout,
  lock,
  ping,
  playback,
  reboot,
  restore,
  screensaver,
  sleep,
  time,
  update,
  version,
  wake
]
