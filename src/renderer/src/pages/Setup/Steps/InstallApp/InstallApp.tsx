import React, { useEffect, useState } from 'react'

import Loader from '@/components/Loader/Loader.js'

import styles from './InstallApp.module.css'

interface InstallAppProps {
  onStepComplete: () => void
}

enum State {
  Pending,
  Installing,
  Complete,
  Error
}

const errors = {
  adb_download_failed:
    'Failed to download ADB. Make sure you have an active internet connection.',
  adb_extract_failed: 'Failed to extract ADB.',
  webapp_download_failed:
    'Failed to download the GlanceThing client. Make sure you have an active internet connection.',
  webapp_extract_failed: 'Failed to extract the GlanceThing client.'
}

const InstallApp: React.FC<InstallAppProps> = ({ onStepComplete }) => {
  const [state, setState] = useState<State>(0)
  const [error, setError] = useState<string | null>(null)

  async function install() {
    setState(State.Installing)
    const res = await window.api.installApp()
    if (res !== true) {
      setError(errors[res] || 'An unexpected error has occurred!')
      setState(State.Error)
      return
    }
    setState(State.Complete)
  }

  useEffect(() => {
    window.api.findSetupCarThing().then(state => {
      if (state === 'ready') setState(State.Complete)
    })
  }, [])

  return (
    <div className={styles.flash}>
      <p className={styles.step}>Step 2</p>
      <h1>Install GlanceThing</h1>
      <p>
        Now that you have shell access to the Car Thing, you can install
        GlanceThing.
      </p>
      <p>
        This will not overwrite the original Spotify software, it will only
        temporarily mount it.
      </p>
      {state === State.Installing ? (
        <div className={styles.state} key={'installing'}>
          <Loader />
          <p>Installing...</p>
        </div>
      ) : state === State.Complete ? (
        <div className={styles.state} key={'complete'}>
          <span className="material-icons">check_circle</span>
          <p>Installed!</p>
        </div>
      ) : state === State.Error ? (
        <div className={styles.state} key={'error'}>
          <span className="material-icons" data-type={'error'}>
            error
          </span>
          <p>{error}</p>
        </div>
      ) : null}
      <div className={styles.buttons}>
        {[State.Pending, State.Error].includes(state) ? (
          <button onClick={install}>Install</button>
        ) : state === State.Complete ? (
          <button onClick={onStepComplete}>Continue</button>
        ) : null}
      </div>
    </div>
  )
}

export default InstallApp
