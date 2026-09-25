import { copyFileSync, existsSync } from 'fs'
import { execFileSync } from 'child_process'
import { createRequire } from 'module'
import { dirname, join } from 'path'

const require = createRequire(import.meta.url)

if (process.platform !== 'darwin') process.exit(0)

const electronRoot = dirname(require.resolve('electron/package.json'))
const appPath = join(electronRoot, 'dist', 'Electron.app')
const plistPath = join(appPath, 'Contents', 'Info.plist')
const iconDest = join(appPath, 'Contents', 'Resources', 'electron.icns')
const iconSrc = join(process.cwd(), 'build', 'stable', 'icon.icns')

if (!existsSync(plistPath)) process.exit(0)

function plistString(key) {
  try {
    return execFileSync('plutil', ['-extract', key, 'raw', plistPath], {
      encoding: 'utf8'
    }).trim()
  } catch {
    return ''
  }
}

function setPlist(key, value) {
  execFileSync('plutil', ['-replace', key, '-string', value, plistPath])
}

const name = 'GlanceThing'
if (plistString('CFBundleName') !== name) setPlist('CFBundleName', name)
if (plistString('CFBundleDisplayName') !== name)
  setPlist('CFBundleDisplayName', name)

if (existsSync(iconSrc)) {
  copyFileSync(iconSrc, iconDest)
  copyFileSync(
    iconSrc,
    join(appPath, 'Contents', 'Resources', 'icon.icns')
  )
}

try {
  execFileSync('touch', [appPath, plistPath, iconDest])
} catch {
  // timestamp bump is best-effort
}

try {
  execFileSync(
    '/System/Library/Frameworks/CoreServices.framework/Frameworks/LaunchServices.framework/Support/lsregister',
    ['-f', '-R', appPath]
  )
} catch {
  // Launch Services cache is best-effort
}
