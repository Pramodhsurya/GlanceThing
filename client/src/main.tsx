import { createRoot } from 'react-dom/client'

import { AppBlurContextProvider } from '@/contexts/AppBlurContext.tsx'
import { SocketContextProvider } from '@/contexts/SocketContext.tsx'
import { SleepContextProvider } from '@/contexts/SleepContext.tsx'
import { AppsContextProvider } from '@/contexts/AppsContext.tsx'
import { MediaContextProvider } from './contexts/MediaContext.tsx'

import App from '@/App.tsx'

import './index.css'
import '@fontsource-variable/open-sans'
import '@fontsource/material-icons'

const root = createRoot(document.getElementById('root')!)

root.render(
  <SocketContextProvider>
    <AppBlurContextProvider>
      <SleepContextProvider>
        <MediaContextProvider>
          <AppsContextProvider>
            <App />
          </AppsContextProvider>
        </MediaContextProvider>
      </SleepContextProvider>
    </AppBlurContextProvider>
  </SocketContextProvider>
)
