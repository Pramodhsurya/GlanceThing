import { useApps } from '@/contexts/AppsContext.tsx'

import styles from './CommunityApp.module.css'

const CommunityApp: React.FC<{ id: string }> = ({ id }) => {
  const { closeApp, communityApps } = useApps()
  const app = communityApps.find(item => item.id === id)
  const src = 'http://localhost:1337/community/' + encodeURIComponent(id) + '/'

  return (
    <div className={styles.shell}>
      <div className={styles.header}>
        <button type="button" className={styles.iconBtn} onClick={closeApp}>
          <span className="material-icons">keyboard_arrow_down</span>
        </button>
        <div className={styles.title}>{app ? app.name : id}</div>
      </div>
      <iframe
        className={styles.frame}
        src={src}
        title={app ? app.name : id}
      />
    </div>
  )
}

export default CommunityApp
