import { execFile } from 'child_process'

import { joinLinkFor } from '../calendar.js'
import { log, LogLevel } from '../utils.js'

import {
  HandlerAction,
  HandlerFunction
} from '../../types/WebSocketHandler.js'

export const name = 'calendar'

export const hasActions = true

export const actions: HandlerAction[] = [
  {
    action: 'join',
    handle: async (_, data) => {
      const { title, start } = (data || {}) as {
        title?: unknown
        start?: unknown
      }
      const url = joinLinkFor(title, start)
      if (!url) {
        log('No Teams link for that meeting', 'Calendar', LogLevel.WARN)
        return
      }
      execFile('open', [url], error => {
        if (error)
          log(
            `Could not open the meeting: ${error.message}`,
            'Calendar',
            LogLevel.WARN
          )
      })
    }
  }
]

export const handle: HandlerFunction = async () => {}
