// Keeps the cover's icon shapes (src/content/cover-icons.ts, drawn with
// createElementNS so the page script loads nothing) identical to
// icons-src/*.svg, which the toolbar PNGs are rendered from. Runs in `pnpm lint`.
// Imports the .ts module directly: Node strips its types (22.18+, hence
// `engines` in the root package.json).
import {readdirSync, readFileSync} from 'node:fs'
import {basename, dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {SHAPES, VIEW_BOX} from '../src/content/cover-icons.ts'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const problems = []

/** Attribute order doesn't matter. */
const sorted = (attributes) => Object.fromEntries(Object.entries(attributes).sort(([a], [b]) => a.localeCompare(b)))

/** The drawing elements of an SVG, in order, as [tag, attributes]. */
function shapesOf(svg) {
  const body = svg.replace(/^[\s\S]*?<svg\b[^>]*>/, '').replace(/<\/svg>[\s\S]*$/, '')
  return [...body.matchAll(/<([a-zA-Z]+)\b([^>]*?)\/?>/g)].map(([, tag, attrs]) => [
    tag,
    sorted(Object.fromEntries([...attrs.matchAll(/([\w:-]+)="([^"]*)"/g)].map(([, name, value]) => [name, value])))
  ])
}

const sources = readdirSync(join(root, 'icons-src'))
  .filter((file) => file.endsWith('.svg'))
  .map((file) => basename(file, '.svg'))

for (const name of sources) {
  if (!(name in SHAPES)) {
    problems.push(`icons-src/${name}.svg has no shapes in cover-icons.ts`)
    continue
  }
  const svg = readFileSync(join(root, 'icons-src', `${name}.svg`), 'utf8')
  // createIcon draws every set on VIEW_BOX; another canvas would crop or shrink it.
  const viewBox = /<svg\b[^>]*?\bviewBox="([^"]*)"/.exec(svg)?.[1]
  if (viewBox !== VIEW_BOX) problems.push(`icons-src/${name}.svg has viewBox "${viewBox}", the cover draws on "${VIEW_BOX}"`)
  const want = JSON.stringify(shapesOf(svg))
  const got = JSON.stringify(SHAPES[name].map(([tag, attributes]) => [tag, sorted(attributes)]))
  if (want !== got) problems.push(`${name}: cover-icons.ts differs from icons-src/${name}.svg\n      svg:   ${want}\n      cover: ${got}`)
}
for (const name of Object.keys(SHAPES)) {
  if (!sources.includes(name)) problems.push(`cover-icons.ts has "${name}" but there is no icons-src/${name}.svg`)
}

if (problems.length) {
  console.error('check-cover-icons: the cover button would not show the toolbar icon:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('check-cover-icons: ok')
