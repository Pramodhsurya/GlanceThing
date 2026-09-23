import { exec } from 'child_process'

import { getStorageValue } from '../storage.js'
import { getParsedPlatformCommand } from '../utils.js'

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
      if (!action?.command || action.command.startsWith('__builtin:'))
        return

      const parsed = getParsedPlatformCommand(action.command)
      if (!parsed) return

      exec(parsed.cmd, { shell: parsed.shell })
    }
  }
]
