export interface SetupHandler {
  name: string
  setup: SetupFunction
}

export type CleanupFunction = () => Promise<void>

export type SetupFunction = () => Promise<CleanupFunction>
