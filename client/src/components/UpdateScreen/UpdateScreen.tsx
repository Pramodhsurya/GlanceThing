import React, { useContext, useEffect, useState } from 'react'
import styles from './UpdateScreen.module.css'
import Loader from '../Loading/Loader.tsx'
import { AppBlurContext } from '@/contexts/AppBlurContext.tsx'
import { SocketContext } from '@/contexts/SocketContext.tsx'

const UpdateScreen: React.FC = () => {
  const { setBlurred } = useContext(AppBlurContext)
  const { ready, socket } = useContext(SocketContext)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    if (!ready) return

    const listener = (e: MessageEvent) => {
      const { type, data } = JSON.parse(e.data)

      if (type !== 'version') return

      if (data !== __VERSION__) {
        socket!.send(JSON.stringify({ type: 'update' }))
        setShown(true)
      }
    }

    socket!.addEventListener('message', listener)

    socket!.send(JSON.stringify({ type: 'version' }))

    return () => {
      socket!.removeEventListener('message', listener)
    }
  }, [ready, socket, setBlurred])

  useEffect(() => {
    setBlurred(shown)
  }, [shown, setBlurred])
  return shown ? (
    <div className={styles.update}>
      <div className={styles.background}></div>
      <Loader />
      <p>Updating...</p>
    </div>
  ) : null
}

export default UpdateScreen
