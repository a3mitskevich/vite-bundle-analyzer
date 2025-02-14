import path from 'path'
import fsp from 'fs/promises'
import type { Plugin } from 'vite'
import { name } from '../../package.json'
import { renderView } from './render'
import type { AnalyzerPluginOptions, AnalyzerPluginOptionsWithServer } from './interface'
import { createAnalyzerModule } from './analyzer-module'
import { createServer } from './server'

const isCI = !!process.env.CI

async function openBrowser(address: string) {
  await import('open').then((module) => module.default(address, { newInstance: true })).catch(() => {})
}

const defaultAnalyzerOptions: AnalyzerPluginOptionsWithServer = {
  analyzerMode: 'server'
}

function analyzer(opts: AnalyzerPluginOptions = defaultAnalyzerOptions): Plugin {
  const { reportTitle = name } = opts
  const analyzerModule = createAnalyzerModule(opts?.gzipOptions)
  let defaultWd = process.cwd()

  const plugin = <Plugin>{
    name,
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      defaultWd = config.build.outDir ?? config.root
    },
    generateBundle(_, outputBundle) {
      // After consider. I trust process chunk is enougth. (If you don't think it's right. PR welcome.)
      for (const bundleName in outputBundle) {
        const bundle = outputBundle[bundleName]
        if (bundle.type !== 'chunk') continue
        analyzerModule.addModule(bundleName, bundle)
      }
    },
    async closeBundle() {
      switch (opts.analyzerMode) {
        case 'json': {
          const p = path.join(defaultWd, opts.fileName ? `${opts.fileName}.json` : 'stats.json')
          const foamModule = await analyzerModule.processfoamModule()
          fsp.writeFile(p, JSON.stringify(foamModule, null, 2), 'utf8')
          break
        }
        case 'static': {
          const p = path.join(defaultWd, opts.fileName ? `${opts.fileName}.html` : 'stats.html')
          const foamModule = await analyzerModule.processfoamModule()
          const html = await renderView(foamModule, { title: reportTitle, mode: 'stat' })
          fsp.writeFile(p, html, 'utf8')
          break
        }
        case 'server': {
          const foamModule = await analyzerModule.processfoamModule()
          const { setup, port } = createServer((opts.analyzerPort === 'atuo' ? 0 : opts.analyzerPort) ?? 8888)
          setup(foamModule, { title: reportTitle, mode: 'stat' })
          if ((opts.openAnalyzer ?? true) && !isCI) {
            const address = `http://localhost:${port}`
            await openBrowser(address)
          }
          break
        }
        default:
          throw new Error('Invalidate Option `analyzerMode`')
      }
    }
  }

  return plugin
}

export { analyzer }

export { analyzer as default }
export { AnalyzerPluginOptions } from './interface'
