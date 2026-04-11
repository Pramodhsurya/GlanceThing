import { createContext, useEffect, useState } from 'react'

interface DevModeContextType {
  devMode: boolean
  checkDevMode: () => void
  setDevMode: (devMode: boolean) => void
}

const DevModeContext = createContext<DevModeContextType>({
  devMode: false,
  checkDevMode: () => {},
  setDevMode: () => {}
})

interface DevModeContextProviderProps {
  children: React.ReactNode
}

const DevModeContextProvider = ({
  children
}: DevModeContextProviderProps) => {
  const [devMode, _setDevMode] = useState(false)

  async function checkDevMode() {
    const isDev = await window.api.isDevMode()
    _setDevMode(isDev)
  }

  async function setDevMode(dev: boolean) {
    await window.api.setStorageValue('devMode', dev)
    await checkDevMode()
  }

  useEffect(() => {
    checkDevMode()
  }, [])

  return (
    <DevModeContext.Provider
      value={{
        devMode,
        checkDevMode,
        setDevMode
      }}
    >
      {children}
    </DevModeContext.Provider>
  )
}

export { DevModeContext, DevModeContextProvider }
