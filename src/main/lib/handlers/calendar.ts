import { execFile } from 'child_process'

import {
  isCalendarSource,
  joinLinkFor,
  refreshStoredCalendar
} from '../calendar.js'
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
  },
  {
    action: 'import',
    handle: async (_, data) => {
      const source = (data || {}) as { source?: unknown }
      if (!isCalendarSource(source.source)) {
        log('Unknown calendar source', 'Calendar', LogLevel.WARN)
        return
      }
      await refreshStoredCalendar(source.source)
    }
  }
]

export const handle: HandlerFunction = async () => {}
