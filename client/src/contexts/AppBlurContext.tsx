import React, { createContext, useState } from 'react'

interface AppBlurContextProps {
  blurred: boolean
  setBlurred: (blurred: boolean) => void
}

const AppBlurContext = createContext<AppBlurContextProps>({
  blurred: false,
  setBlurred: () => {}
})

interface AppBlurContextProviderProps {
  children: React.ReactNode
}

const AppBlurContextProvider = ({
  children
}: AppBlurContextProviderProps) => {
  const [blurred, setBlurred] = useState(false)

  return (
    <AppBlurContext.Provider
      value={{
        blurred,
        setBlurred
      }}
    >
      {children}
    </AppBlurContext.Provider>
  )
}

export { AppBlurContext, AppBlurContextProvider }
