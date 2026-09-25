import React from 'react'
import styles from './YouTubeMusic.module.css'

interface YouTubeMusicProps {
  onStepComplete: () => void
}

const YouTubeMusic: React.FC<YouTubeMusicProps> = ({ onStepComplete }) => {
  return (
    <div className={styles.provider}>
      <p>
        Controls the YouTube Music desktop app, including seek, shuffle,
        repeat, volume and album art.
      </p>
      <ol>
        <li>
          Install{' '}
          <a
            href="https://github.com/th-ch/youtube-music"
            target="_blank"
            rel="noreferrer"
          >
            YouTube Music Desktop
          </a>
          .
        </li>
        <li>
          In its menu, open Plugins and turn on <b>API Server</b>. Keep the
          default port, 26538.
        </li>
        <li>
          When YouTube Music asks whether to allow “glancething”, click
          Allow.
        </li>
      </ol>
      <div className={styles.buttons}>
        <button onClick={onStepComplete}>Continue</button>
      </div>
    </div>
  )
}

export default YouTubeMusic
