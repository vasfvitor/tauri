// Copyright 2019-2023 Tauri Programme within The Commons Conservancy
// SPDX-License-Identifier: Apache-2.0
// SPDX-License-Identifier: MIT

import { defineConfig, Plugin } from 'rollup'
import typescript from '@rollup/plugin-typescript'
import terser from '@rollup/plugin-terser'
import fg from 'fast-glob'
import { basename, join } from 'path'
import {
  writeFileSync,
  copyFileSync,
  opendirSync,
  rmSync,
  Dir,
  readFileSync
} from 'fs'
import { fileURLToPath } from 'url'

// cleanup dist dir
const __dirname = fileURLToPath(new URL('.', import.meta.url))
cleanDir(join(__dirname, './dist'))

const modules = fg.sync(['!./src/*.d.ts', './src/*.ts'])

export default defineConfig([
  {
    input: Object.fromEntries(modules.map((p) => [basename(p, '.ts'), p])),
    output: [
      {
        format: 'esm',
        dir: './dist',
        preserveModules: true,
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name.includes('node_modules')) {
            return chunkInfo.name.replace('node_modules', 'external') + '.js'
          }

          return '[name].js'
        }
      },
      {
        format: 'cjs',
        dir: './dist',
        preserveModules: true,
        entryFileNames: (chunkInfo) => {
          if (chunkInfo.name.includes('node_modules')) {
            return chunkInfo.name.replace('node_modules', 'external') + '.cjs'
          }

          return '[name].cjs'
        }
      }
    ],
    plugins: [
      typescript({
        declaration: true,
        declarationDir: './dist',
        rootDir: 'src'
      }),
      makeFlatPackageInDist()
    ]
  },

  {
    input: 'src/index.ts',
    output: {
      format: 'iife',
      name: '__TAURI_IIFE__',
      file: '../../core/tauri/scripts/bundle.global.js',
      footer: 'window.__TAURI__ = __TAURI_IIFE__'
    },
    plugins: [typescript(), terser()]
  }
])

function makeFlatPackageInDist(): Plugin {
  return {
    name: 'makeFlatPackageInDist',
    writeBundle() {
      // append our api modules to `exports` in `package.json` then write it to `./dist`
      const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
      const mods = modules.map((p) => basename(p).split('.')[0])

      const outputPkg = {
        ...pkg,
        devDependencies: {},
        exports: Object.assign(
          {},
          ...mods.map((mod) => {
            let temp: Record<string, { import: string; require: string }> = {}
            let key = `./${mod}`
            if (mod === 'index') {
              key = '.'
            }

            temp[key] = {
              import: `./${mod}.js`,
              require: `./${mod}.cjs`
            }
            return temp
          }),
          // if for some reason in the future we manually add something in the `exports` field
          // this will ensure it doesn't get overwritten by the logic above
          { ...(pkg.exports || {}) }
        )
      }
      writeFileSync(
        'dist/package.json',
        JSON.stringify(outputPkg, undefined, 2)
      )

      // copy necessary files like `CHANGELOG.md` , `README.md` and Licenses to `./dist`
      fg.sync('(LICENSE*|*.md)').forEach((f) => copyFileSync(f, `dist/${f}`))
    }
  }
}

function cleanDir(path: string) {
  let dir: Dir
  try {
    dir = opendirSync(path)
  } catch (err: any) {
    switch (err.code) {
      case 'ENOENT':
        return // Noop when directory don't exists.
      case 'ENOTDIR':
        throw new Error(`'${path}' is not a directory.`)
      default:
        throw err
    }
  }

  let file = dir.readSync()
  while (file) {
    const filePath = join(path, file.name)
    rmSync(filePath, { recursive: true })
    file = dir.readSync()
  }
  dir.closeSync()
}
