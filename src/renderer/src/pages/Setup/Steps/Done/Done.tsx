import React, { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import party from 'party-js'

import styles from './Done.module.css'

import icon from '@/assets/icon.png'

const Done: React.FC = () => {
  const navigate = useNavigate()

  useEffect(() => {
    celebrate()
  }, [])

  function celebrate() {
    party.confetti(document.body, {
      count: 30,
      spread: 40,
      size: 1
    })
  }

  async function complete() {
    await window.api.setStorageValue('setupComplete', true)
    navigate('/')
  }

  return (
    <div className={styles.done}>
      <img src={icon} alt="" onClick={() => celebrate()} />
      <h1>Setup Complete!</h1>
      <p>Congratulations! Your GlanceThing is ready to use. Enjoy!</p>
      <div className={styles.buttons}>
        <button onClick={complete}>Complete</button>
      </div>
    </div>
  )
}

export default Done
