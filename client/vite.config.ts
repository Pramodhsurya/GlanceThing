import { defineConfig } from 'vite'
import { resolve } from 'path'
import fs from 'fs/promises'

import react from '@vitejs/plugin-react'
import legacy from '@vitejs/plugin-legacy'
import type { Declaration, Plugin } from 'postcss'

const pkg = JSON.parse(await fs.readFile('./package.json', 'utf8'))

// Car Thing runs Chrome 69: no `inset` (87+) and no flexbox `gap` (84+).
// The extra class keeps gap margins above `.parent button { all: unset }`.
const GAP_BOOST = ':not(.__gap)'
const chrome69Css: Plugin = {
  postcssPlugin: 'chrome69-css',
  Declaration: {
    'margin-left': decl => {
      if (decl.value === 'auto') decl.important = true
    },
    'margin-top': decl => {
      if (decl.value === 'auto') decl.important = true
    },
    inset: decl => {
      const [top, right = top, bottom = top, left = right] =
        decl.value.split(/\s+/)
      decl.cloneBefore({ prop: 'top', value: top })
      decl.cloneBefore({ prop: 'right', value: right })
      decl.cloneBefore({ prop: 'bottom', value: bottom })
      decl.cloneBefore({ prop: 'left', value: left })
      decl.remove()
    }
  },
  Rule: rule => {
    let display = ''
    let direction = 'row'
    let wrap = false
    let gapDecl: Declaration | null = null
    rule.each(node => {
      if (node.type !== 'decl') return
      if (node.prop === 'display') display = node.value
      if (node.prop === 'flex-direction') direction = node.value
      if (node.prop === 'flex-wrap' && node.value !== 'nowrap') wrap = true
      if (node.prop === 'gap') gapDecl = node
    })
    if (!gapDecl || !display.includes('flex')) return
    const decl = gapDecl as Declaration
    const [rowGap, columnGap = rowGap] = decl.value.split(/\s+/)
    const selectors = rule.selectors

    decl.remove()

    if (wrap) {
      rule.append({
        prop: 'margin',
        value: `calc(${rowGap} / -2) calc(${columnGap} / -2)`
      })
      rule
        .cloneAfter({ selectors: selectors.map(s => `${s} > *${GAP_BOOST}`) })
        .removeAll()
        .append({
          prop: 'margin',
          value: `calc(${rowGap} / 2) calc(${columnGap} / 2)`
        })
    } else {
      const vertical = direction.startsWith('column')
      rule
        .cloneAfter({
          selectors: selectors.map(s => `${s} > * + *${GAP_BOOST}`)
        })
        .removeAll()
        .append({
          prop: vertical ? 'margin-top' : 'margin-left',
          value: vertical ? rowGap : columnGap
        })
    }
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    legacy({
      targets: ['Chrome 69'],
      renderModernChunks: false
    })
  ],
  css: {
    postcss: {
      plugins: [chrome69Css]
    }
  },
  base: '/usr/share/qt-superbird-app/webapp/',
  resolve: {
    alias: {
      '@': resolve('src')
    }
  },
  define: {
    __VERSION__: JSON.stringify(pkg.version)
  }
})
