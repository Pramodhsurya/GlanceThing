import { execFileSync, spawnSync } from 'child_process'
import { existsSync, readdirSync, rmSync, statSync } from 'fs'
import { homedir } from 'os'
import { join } from 'path'

const dest = join(homedir(), 'Applications', 'GlanceThing.app')

function findAllApps(root) {
  const matches = []
  function walk(dir, depth) {
    if (depth > 4 || !existsSync(dir)) return
    for (const name of readdirSync(dir)) {
      const full = join(dir, name)
      if (name === 'GlanceThing.app' && statSync(full).isDirectory()) {
        matches.push(full)
        continue
      }
      try {
        if (statSync(full).isDirectory()) walk(full, depth + 1)
      } catch {
        // skip
      }
    }
  }
  walk(root, 0)
  return matches
}

function findBuiltApp(root) {
  const matches = findAllApps(root)
  matches.sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)
  return matches[0]
}

function quitApps() {
  spawnSync('osascript', ['-e', 'quit app "GlanceThing"'])
  spawnSync('osascript', ['-e', 'quit app "Electron"'])
  spawnSync('pkill', [
    '-f',
    'node_modules/electron/dist/Electron.app/Contents/MacOS/Electron'
  ])
}

quitApps()
execFileSync('npm', ['run', 'build:unpack'], {
  stdio: 'inherit',
  cwd: process.cwd()
})

const built = findBuiltApp(join(process.cwd(), 'dist'))
if (!built) {
  console.error('No GlanceThing.app found under dist/')
  process.exit(1)
}

quitApps()
if (existsSync(dest)) rmSync(dest, { recursive: true, force: true })
execFileSync('ditto', [built, dest], { stdio: 'inherit' })

// Spotlight indexes every .app it finds. After install, keep only the
// one in ~/Applications so Command-Space does not list build leftovers.
for (const extra of findAllApps(join(process.cwd(), 'dist'))) {
  rmSync(extra, { recursive: true, force: true })
}
const stray = join(process.cwd(), '..', 'GlanceThing.app')
if (existsSync(stray)) rmSync(stray, { recursive: true, force: true })

console.log(`Installed ${built} → ${dest}`)
spawnSync('open', [dest])
