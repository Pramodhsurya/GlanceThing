import os from 'node:os'

import { HandlerFunction } from '../../types/WebSocketHandler.js'
import { execAsync } from '../utils.js'

export const name = 'system'

export const hasActions = false

type CpuTimes = { idle: number; total: number }[]

let lastTimes: CpuTimes | null = null

function readTimes(): CpuTimes {
  return os.cpus().map(cpu => {
    const { user, nice, sys, idle, irq } = cpu.times
    return { idle, total: user + nice + sys + idle + irq }
  })
}

function cpuUsage() {
  const now = readTimes()
  const prev = lastTimes
  lastTimes = now

  const cores = now.map((core, i) => {
    const before = prev?.[i]
    const total = before ? core.total - before.total : core.total
    const idle = before ? core.idle - before.idle : core.idle
    if (total <= 0) return 0
    return Math.round((1 - idle / total) * 100)
  })

  const overall = cores.length
    ? Math.round(cores.reduce((a, b) => a + b, 0) / cores.length)
    : 0

  return { overall, cores }
}

// os.freemem() on macOS excludes file cache, so memory always looks full.
async function availableMemory() {
  if (process.platform !== 'darwin') return os.freemem()
  const out = await execAsync('vm_stat', 3000).catch(() => null)
  if (!out) return os.freemem()
  const pageSize = Number(out.match(/page size of (\d+)/)?.[1] ?? 4096)
  const pages = (label: string) =>
    Number(out.match(new RegExp(`${label}:\\s+(\\d+)`))?.[1] ?? 0)
  return (
    (pages('Pages free') +
      pages('Pages speculative') +
      pages('Pages purgeable') +
      pages('File-backed pages')) *
    pageSize
  )
}

export const handle: HandlerFunction = async ws => {
  const cpu = cpuUsage()
  const total = os.totalmem()
  const free = Math.min(total, await availableMemory())

  ws.send(
    JSON.stringify({
      type: 'system',
      data: {
        hostname: os.hostname(),
        platform: os.platform(),
        cpuModel: os.cpus()[0]?.model ?? 'Unknown CPU',
        cpu,
        load: os.loadavg(),
        memory: { total, used: total - free },
        uptime: os.uptime()
      }
    })
  )
}
