import PropTypes from 'prop-types'

import styles from './Loader.module.css'

interface LoaderProps {
  size?: number
}

const Loader: React.FC<LoaderProps> = ({ size = 32 }) => {
  return <div className={styles.loader} style={{ width: size }} />
}

Loader.propTypes = {
  size: PropTypes.number
}

export default Loader
