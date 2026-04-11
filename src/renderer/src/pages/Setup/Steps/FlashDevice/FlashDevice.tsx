import React, { useEffect, useState } from 'react'

import Loader from '@/components/Loader/Loader.js'

import styles from './FlashDevice.module.css'

interface FlashDeviceProps {
  onStepComplete: () => void
}

enum State {
  Pending,
  Finding,
  Found,
  NotFound,
  Error
}

const errors = {
  adb_download_failed:
    'Failed to download ADB. Make sure you have an active internet connection.',
  adb_extract_failed: 'Failed to extract ADB.'
}

const FlashDevice: React.FC<FlashDeviceProps> = ({ onStepComplete }) => {
  const [state, setState] = useState<State>(0)
  const [error, setError] = useState<string | null>(null)

  async function findCarThing() {
    setState(State.Finding)
    const found = await window.api.findCarThing()
    if (typeof found !== 'boolean') {
      setError(errors[found] || 'An unexpected error has occurred!')
      setState(State.Error)
      return
    }
    setState(found ? State.Found : State.NotFound)
  }

  useEffect(() => {
    window.api.findCarThing().then(found => {
      if (found === true) setState(State.Found)
    })
  }, [])

  return (
    <div className={styles.flash}>
      <p className={styles.step}>Step 1</p>
      <h1>Flash your device</h1>
      <p>
        First, you have to flash your device with a custom firmware.
        <br />
        This can easily be done with ThingFlash, which provides a guided
        process for flashing your CarThing.
      </p>
      <p>The current recommended image is Thing Labs 8.9.2.</p>
      <button
        onClick={() =>
          window.open(
            'https://github.com/BluDood/ThingFlash/releases/latest'
          )
        }
      >
        Download ThingFlash
      </button>
      <p>
        Once you have completed the flash, press &quot;Find Car Thing&quot;
      </p>
      {state === State.Finding ? (
        <div className={styles.state} key={'finding'}>
          <Loader />
          <p>Finding CarThing...</p>
        </div>
      ) : state === State.Found ? (
        <div className={styles.state} key={'found'}>
          <span className="material-icons">check_circle</span>
          <p>Found CarThing!</p>
        </div>
      ) : state === State.NotFound ? (
        <div className={styles.state} key={'notfound'}>
          <span className="material-icons" data-type="error">
            error
          </span>
          <p>Could not find CarThing!</p>
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
        {[State.Pending, State.NotFound, State.Error].includes(state) ? (
          <button onClick={findCarThing}>Find Car Thing</button>
        ) : state === State.Found ? (
          <button onClick={onStepComplete}>Continue</button>
        ) : null}
      </div>
    </div>
  )
}

export default FlashDevice
