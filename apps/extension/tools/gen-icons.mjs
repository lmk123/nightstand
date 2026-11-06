// Renders every icons-src/<name>.svg to public/icons/<name>/<size>.png.
// Chromium rejects SVG for action/manifest icons, so the PNGs are generated
// once and committed; re-run `pnpm icons` after editing an SVG.
import {mkdirSync, readdirSync, readFileSync, writeFileSync} from 'node:fs'
import {basename, dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Resvg} from '@resvg/resvg-js'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const sizes = [16, 32, 48, 128]

for (const file of readdirSync(join(root, 'icons-src'))) {
  if (!file.endsWith('.svg')) continue
  const name = basename(file, '.svg')
  const svg = readFileSync(join(root, 'icons-src', file))
  const outDir = join(root, 'public', 'icons', name)
  mkdirSync(outDir, {recursive: true})
  for (const size of sizes) {
    const png = new Resvg(svg, {fitTo: {mode: 'width', value: size}})
      .render()
      .asPng()
    writeFileSync(join(outDir, `${size}.png`), png)
  }
  console.log(`icons: ${name} → public/icons/${name}/{${sizes.join(',')}}.png`)
}
