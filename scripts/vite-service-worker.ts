import { createHash } from 'node:crypto'
import { readFileSync, readdirSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { build } from 'vite'
import type { Plugin } from 'vite'
import { SHELL_URL, shouldPrecache } from '../src/pwa/policy.ts'

const ENTRY = 'src/pwa/serviceWorker.ts'

const listFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) =>
    entry.isDirectory() ? listFiles(join(dir, entry.name)) : [join(dir, entry.name)],
  )

/**
 * Builds the service worker to /sw.js once the app is built, with the list of
 * files it saves on the device written into it. The list is every built file
 * and every file in public/ that `shouldPrecache` accepts; the version is a
 * hash of their names and the public files' contents, so any change to the
 * app makes a new worker, which is how browsers notice an update.
 *
 * Skipped for `npm run build:static`, whose copy opens from a folder, where
 * service workers cannot run.
 */
export function serviceWorker(): Plugin {
  let root = ''
  let publicDir = ''
  let enabled = true

  return {
    name: 'open-dam:service-worker',
    apply: 'build',
    configResolved(config) {
      root = config.root
      publicDir = config.publicDir
      enabled = config.mode !== 'static'
    },
    async generateBundle(_options, bundle) {
      if (!enabled) return
      const publicFiles = publicDir ? listFiles(publicDir) : []
      const names = new Set([
        ...Object.values(bundle).map((file) => file.fileName),
        ...publicFiles.map((file) => relative(publicDir, file).split(sep).join('/')),
      ])
      names.delete('index.html')
      const precache = [SHELL_URL, ...[...names].filter(shouldPrecache).map((name) => `/${name}`)].sort()

      const hash = createHash('sha256').update(precache.join('\n'))
      for (const file of publicFiles) hash.update(readFileSync(file))
      const version = hash.digest('hex').slice(0, 12)

      const output = await build({
        configFile: false,
        root,
        publicDir: false,
        logLevel: 'warn',
        define: { __PRECACHE__: JSON.stringify(precache), __VERSION__: JSON.stringify(version) },
        build: {
          write: false,
          emptyOutDir: false,
          minify: true,
          lib: { entry: join(root, ENTRY), formats: ['iife'], name: 'openDamServiceWorker', fileName: () => 'sw.js' },
        },
      })
      const chunk = [output]
        .flat()
        .flatMap((result) => ('output' in result ? result.output : []))
        .find((file) => file.type === 'chunk')
      if (!chunk || chunk.type !== 'chunk') throw new Error('The service worker did not build.')
      this.emitFile({ type: 'asset', fileName: 'sw.js', source: chunk.code })
    },
  }
}
