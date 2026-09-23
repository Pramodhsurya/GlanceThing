import { exec } from 'child_process'

import { getStorageValue } from '../storage.js'
import {
  getParsedPlatformCommand,
  getSleepPlatformCommand,
  getWakePlatformCommand
} from '../utils.js'

import { HandlerAction } from '../../types/WebSocketHandler.js'

interface StoredAction {
  id: string
  command?: string
}

export const name = 'actions'

export const hasActions = true

export const actions: HandlerAction[] = [
  {
    action: 'run',
    handle: async (_, data) => {
      const stored = getStorageValue('screenLayout') as {
        actions?: StoredAction[]
      } | null
      const action = stored?.actions?.find(item => item.id === data)
      if (!action?.command) return
      if (action.command === '__builtin:sleep') {
        const sleep = getSleepPlatformCommand()
        if (!sleep) return
        exec(sleep.cmd, { shell: sleep.shell })
        return
      }
      if (action.command === '__builtin:unlock') {
        const wake = getWakePlatformCommand()
        if (!wake) return
        exec(wake.cmd, { shell: wake.shell })
        return
      }
      if (action.command.startsWith('__builtin:')) return

      const parsed = getParsedPlatformCommand(action.command)
      if (!parsed) return

      exec(parsed.cmd, { shell: parsed.shell })
    }
  }
]
