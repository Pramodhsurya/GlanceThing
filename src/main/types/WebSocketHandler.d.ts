export interface HandlerWithoutActions {
  name: string
  hasActions: false
  handle: HandlerFunction
}

export interface HandlerWithActions {
  name: string
  hasActions: true
  actions: HandlerAction[]
  handle?: HandlerFunction
}

export type HandlerAction = {
  action: string
  handle: HandlerFunction
}

export type Handler = HandlerWithoutActions | HandlerWithActions

export type HandlerFunction = (
  ws: AuthenticatedWebSocket,
  data: unknown
) => Promise<void>
