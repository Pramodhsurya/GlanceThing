import React from 'react'

import styles from './Switch.module.css'

interface SwitchProps {
  defaultValue?: boolean
  value?: boolean
  onChange: (value: boolean) => void
}

const Switch: React.FC<SwitchProps> = ({
  defaultValue,
  value,
  onChange
}) => {
  return (
    <label className={styles.switch}>
      <input
        type="checkbox"
        defaultChecked={defaultValue}
        checked={value}
        onChange={e => onChange(e.target.checked)}
      />
      <span className={styles.slider}></span>
    </label>
  )
}

export default Switch
