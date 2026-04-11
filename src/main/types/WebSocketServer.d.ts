import WebSocket from 'ws'

interface AuthenticatedWebSocket extends WebSocket {
  authenticated?: boolean
}
