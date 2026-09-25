import TypedEmitter from 'typed-emitter'
import { WebSocket, WebSocketServer } from 'ws'
import EventEmitter from 'events'
import { createServer, Server as HttpServer } from 'http'

import {
  getServerPort,
  getSocketPassword,
  getStorageValue
} from './storage.js'

import { log, LogLevel, safeParse } from '../lib/utils.js'
import { runServerSetup } from './setup/setup.js'
import { handlers } from './handlers/handlers.js'

import { AuthenticatedWebSocket } from '../types/WebSocketServer.js'
import { serveCommunityRequest } from './communityApps.js'

interface ServerInfo {
  running: boolean
  port: number | null
}

class ServerManager extends (EventEmitter as new () => TypedEmitter<{
  status: (up: ServerInfo) => void
}>) {
  private wss: WebSocketServer | null = null
  private http: HttpServer | null = null
  private port: number | null = null

  async start() {
    const cleanup = await runServerSetup()

    const WS_PASSWORD = getSocketPassword()
    this.port = await getServerPort()

    return new Promise<void>(resolve => {
      this.http = createServer((req, res) => {
        if (req.url === '/ws-password' || req.url === '/ws-password/') {
          res.setHeader('Content-Type', 'text/plain')
          res.end(WS_PASSWORD)
          return
        }
        if (serveCommunityRequest(req, res)) return
        res.statusCode = 404
        res.end()
      })
      this.wss = new WebSocketServer({ server: this.http })

      this.wss.on('connection', (ws: AuthenticatedWebSocket) => {
        if (getStorageValue('disableSocketAuth') === true)
          ws.authenticated = true

        ws.on('message', async msg => {
          const d = safeParse(msg.toString())
          if (!d) return
          const { type, action, data } = d
          log(
            `Received ${type} ${action ?? ''}`,
            'WebSocketServer',
            LogLevel.DEBUG
          )

          if (type === 'auth') {
            if (data === WS_PASSWORD) {
              ws.authenticated = true
              ws.send(
                JSON.stringify({
                  type: 'auth',
                  data: 'Authenticated'
                })
              )
            } else {
              ws.send(
                JSON.stringify({
                  type: 'error',
                  data: 'Unauthorized'
                })
              )
            }
          }

          if (!ws.authenticated)
            return ws.send(
              JSON.stringify({
                type: 'error',
                data: 'Unauthorized'
              })
            )

          const handler = handlers.find(h => h.name === type)
          if (!handler) return

          if (!handler.hasActions) {
            await handler.handle(ws, data)
          } else {
            if (!action && handler.handle) {
              await handler.handle(ws, data)
            } else {
              const actionHandler = handler.actions.find(
                a => a.action === action
              )
              if (!actionHandler) return
              await actionHandler.handle(ws, data)
            }
          }
        })
      })

      this.wss.on('close', async () => {
        await cleanup()

        this.wss = null
        this.http = null
        this.emit('status', {
          running: false,
          port: null
        })

        log('Closed', 'WebSocketServer')
      })

      this.http.listen(this.port!, () => {
        log(`Started on port ${this.port}`, 'WebSocketServer')

        this.emit('status', {
          running: true,
          port: this.port
        })
        resolve()
      })
    })
  }

  async stop() {
    if (!this.wss) return

    await new Promise<void>(r => {
      const listener = (status: ServerInfo) => {
        if (!status.running) {
          r()
          this.off('status', listener)
        }
      }

      this.on('status', listener)
      this.wss?.clients.forEach(ws => ws.close())
      this.http?.close()
      this.wss!.close()
    })
  }

  async restart() {
    log('Restarting server', 'Server')
    await this.stop()
    await this.start()
  }

  getServerInfo(): ServerInfo {
    return {
      running: !!this.wss,
      port: this.port
    }
  }

  getServer(): WebSocketServer | null {
    return this.wss
  }

  broadcast(payload: unknown) {
    const data = JSON.stringify(payload)
    this.wss?.clients.forEach(client => {
      const ws = client as AuthenticatedWebSocket
      if (ws.authenticated && ws.readyState === WebSocket.OPEN)
        ws.send(data)
    })
  }
}

export const serverManager = new ServerManager()
