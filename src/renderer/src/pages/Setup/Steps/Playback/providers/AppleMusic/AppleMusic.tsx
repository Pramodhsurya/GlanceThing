import React from 'react'
import styles from './AppleMusic.module.css'

interface AppleMusicProps {
  onStepComplete: () => void
}

const AppleMusic: React.FC<AppleMusicProps> = ({ onStepComplete }) => {
  return (
    <div className={styles.provider}>
      <p>
        Controls the Music app on this Mac: play, pause, skip, seek,
        shuffle, repeat, volume and album art. The first time, macOS asks
        whether GlanceThing may control Music. Click OK.
      </p>
      <div className={styles.buttons}>
        <button onClick={onStepComplete}>Continue</button>
      </div>
    </div>
  )
}

export default AppleMusic
