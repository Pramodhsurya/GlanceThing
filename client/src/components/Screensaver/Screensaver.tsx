import React, {
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState
} from 'react'

import { SleepState } from '@/contexts/SleepContext.tsx'
import { SocketContext } from '@/contexts/SocketContext.tsx'

import styles from './Screensaver.module.css'

interface ScreensaverProps {
  type: SleepState
}

const DEFAULT_ROTATE_MS = 30000

const Screensaver: React.FC<ScreensaverProps> = ({ type }) => {
  const { ready, socket } = useContext(SocketContext)
  const [loaded, setLoaded] = useState(false)
  const [photoIds, setPhotoIds] = useState<string[]>([])
  const [images, setImages] = useState<Record<string, string>>({})
  const [index, setIndex] = useState(0)
  const [rotateMs, setRotateMs] = useState(DEFAULT_ROTATE_MS)
  const [shuffle, setShuffle] = useState(false)
  const [fitIds, setFitIds] = useState<Record<string, boolean>>({})
  const [showClock, setShowClock] = useState(false)
  const [clock, setClock] = useState<{
    time: string
    date: string
  } | null>(null)
  const indexRef = useRef(0)

  const validateImage = useCallback(
    (imageUrl: string): Promise<boolean> => {
      return new Promise(resolve => {
        if (!imageUrl || imageUrl.indexOf('data:image/') !== 0) {
          resolve(false)
          return
        }

        const img = new Image()
        img.onload = () => resolve(true)
        img.onerror = () => resolve(false)
        img.src = imageUrl
      })
    },
    []
  )

  const requestAlbum = useCallback(() => {
    if (socket && socket.readyState === 1) {
      socket.send(
        JSON.stringify({
          type: 'screensaver',
          action: 'getAlbum'
        })
      )
    }
  }, [socket])

  const requestImage = useCallback(
    (id: string) => {
      if (socket && socket.readyState === 1) {
        socket.send(
          JSON.stringify({
            type: 'screensaver',
            action: 'getImage',
            data: { id }
          })
        )
      }
    },
    [socket]
  )

  useEffect(() => {
    if (!ready || !socket) return

    const listener = (e: MessageEvent) => {
      const data = JSON.parse(e.data)
      if (data.type === 'time' && data.data && data.data.time) {
        setClock({ time: data.data.time, date: data.data.date || '' })
        return
      }
      if (data.type !== 'screensaver') return

      switch (data.action) {
        case 'album': {
          const photos = (data.data && data.data.photos) || []
          const ids: string[] = []
          const nextFits: Record<string, boolean> = {}
          for (let i = 0; i < photos.length; i++) {
            if (photos[i] && photos[i].id) {
              const id = String(photos[i].id)
              ids.push(id)
              nextFits[id] = photos[i].fit === 'fit'
            }
          }
          setFitIds(nextFits)
          const nextRotate = Number(data.data && data.data.rotateMs)
          if (
            nextRotate === 30000 ||
            nextRotate === 60000 ||
            nextRotate === 300000
          ) {
            setRotateMs(nextRotate)
          } else {
            setRotateMs(DEFAULT_ROTATE_MS)
          }
          setShuffle(Boolean(data.data && data.data.shuffle))
          setShowClock(Boolean(data.data && data.data.clock))
          setPhotoIds(ids)
          setIndex(0)
          indexRef.current = 0
          if (ids.length === 0) {
            setImages({})
          } else {
            for (let i = 0; i < ids.length; i++) {
              requestImage(ids[i])
            }
          }
          break
        }

        case 'image':
          if (data.data && data.data.id && data.data.image) {
            validateImage(data.data.image).then(isValid => {
              if (!isValid) return
              setImages(prev => {
                const next = Object.assign({}, prev)
                next[data.data.id] = data.data.image
                return next
              })
            })
          }
          break

        case 'update':
          requestAlbum()
          break

        case 'removed':
          setPhotoIds([])
          setImages({})
          setIndex(0)
          indexRef.current = 0
          break
      }
    }

    socket.addEventListener('message', listener)
    requestAlbum()
    socket.send(JSON.stringify({ type: 'time' }))

    const retryInterval = setInterval(() => {
      if (socket.readyState === 1 && photoIds.length === 0) {
        requestAlbum()
      }
    }, 5000)

    return () => {
      socket.removeEventListener('message', listener)
      clearInterval(retryInterval)
    }
  }, [
    ready,
    socket,
    photoIds.length,
    requestAlbum,
    requestImage,
    validateImage
  ])

  useEffect(() => {
    if (type === 'screensaver') {
      setLoaded(true)
    } else {
      const t = setTimeout(() => {
        setLoaded(false)
      }, 500)
      return () => clearTimeout(t)
    }
  }, [type])

  useEffect(() => {
    if (type !== 'screensaver' || photoIds.length < 2) return

    const timer = setInterval(() => {
      let next = (indexRef.current + 1) % photoIds.length
      if (shuffle) {
        next = Math.floor(Math.random() * (photoIds.length - 1))
        if (next >= indexRef.current) next++
      }
      indexRef.current = next
      setIndex(next)
    }, rotateMs)

    return () => clearInterval(timer)
  }, [type, photoIds, rotateMs, shuffle])

  const currentId = photoIds[index]
  const customImage = currentId ? images[currentId] : null

  return (
    <div className={styles.screensaver} data-active={type !== 'off'}>
      {loaded && (
        <>
          {customImage ? (
            <div
              key={currentId + '-' + index}
              className={styles.customImage}
              style={{
                backgroundImage: 'url(' + customImage + ')',
                backgroundSize: fitIds[currentId] ? 'contain' : 'cover',
                backgroundRepeat: 'no-repeat'
              }}
            />
          ) : (
            <>
              <div className={styles.circle1}></div>
              <div className={styles.circle2}></div>
              <div className={styles.circle3}></div>
            </>
          )}
          {showClock && clock && (
            <div className={styles.clock}>
              <span className={styles.clockTime}>{clock.time}</span>
              <span className={styles.clockDate}>{clock.date}</span>
            </div>
          )}
        </>
      )}
    </div>
  )
}

export default Screensaver
