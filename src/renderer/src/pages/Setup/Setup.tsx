import React, { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'

import Welcome from './Steps/Welcome/Welcome.js'
import FlashDevice from './Steps/FlashDevice/FlashDevice.js'
import InstallApp from './Steps/InstallApp/InstallApp.js'
import Playback from './Steps/Playback/Playback.js'
import Connect from './Steps/Connect/Connect.js'
import Done from './Steps/Done/Done.js'

import styles from './Setup.module.css'

enum Steps {
  Welcome,
  FlashDevice,
  InstallApp,
  Playback,
  Connect,
  Complete
}

const Setup: React.FC = () => {
  const [params] = useSearchParams()
  const [step, setStep] = useState<Steps>(0)
  const [hasStep, setHasStep] = useState(false)

  useEffect(() => {
    const stepParam = params.get('step')
    if (stepParam) {
      setStep(parseInt(stepParam))
      setHasStep(true)
    }
  }, [])

  function changeStep(newStep: Steps) {
    if (hasStep) setStep(Steps.Complete)
    setStep(newStep)
  }

  return (
    <div className={styles.setup}>
      {step === Steps.Welcome ? (
        <Welcome onStepComplete={() => changeStep(Steps.FlashDevice)} />
      ) : step === Steps.FlashDevice ? (
        <FlashDevice onStepComplete={() => changeStep(Steps.InstallApp)} />
      ) : step === Steps.InstallApp ? (
        <InstallApp onStepComplete={() => changeStep(Steps.Playback)} />
      ) : step === Steps.Playback ? (
        <Playback onStepComplete={() => changeStep(Steps.Connect)} />
      ) : step === Steps.Connect ? (
        <Connect onStepComplete={() => changeStep(Steps.Complete)} />
      ) : step === Steps.Complete ? (
        <Done />
      ) : null}
    </div>
  )
}

export default Setup
