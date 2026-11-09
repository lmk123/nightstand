// Keeps popup grids from widening past the 360px popup (see CLAUDE.md): a
// bare `grid` gets an implicit `auto` column that a long unbroken string
// (file name, URL used as a title) stretches even inside `truncate`, and a
// bare `fr` in a custom track list has the same `auto` minimum. Flags, in
// every class string under src/popup:
//   - `grid` without `grid-cols-*` (or an inline `gridTemplateColumns` on the
//     same element, or `place-items-*`/`place-content-*` for a grid that only
//     centers one child);
//   - a `grid-cols-[…]` track that is a bare `fr` instead of `minmax(0,…fr)`.
// shadcn primitives (src/components/ui) stay as generated, so a single-column
// one is fixed at its call site by passing `grid-cols-1`. Runs in `pnpm lint`.
import {readdirSync, readFileSync} from 'node:fs'
import {dirname, join, relative} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const scanDir = join(root, 'src/popup')

function* files(dir) {
  for (const entry of readdirSync(dir, {withFileTypes: true})) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* files(path)
    else if (/\.[jt]sx?$/.test(entry.name)) yield path
  }
}

const problems = []
const literal = /(["'`])((?:\\.|(?!\1)[^\\])*)\1/g

for (const file of files(scanDir)) {
  const source = readFileSync(file, 'utf8')
  for (const match of source.matchAll(literal)) {
    const classes = match[2].split(/\s+/)
    const line = source.slice(0, match.index).split('\n').length
    const where = `${relative(root, file)}:${line}`
    if (classes.includes('grid')) {
      const sized = classes.some((c) => /^(grid-cols-|place-items-|place-content-)/.test(c))
      // An inline track list on the same element (the next few lines of JSX).
      const inline = /gridTemplateColumns/.test(source.slice(match.index + match[0].length, match.index + match[0].length + 200))
      if (!sized && !inline) problems.push(`${where}: bare \`grid\` — add \`grid-cols-1\` (or explicit columns)`)
    }
    for (const c of classes) {
      const tracks = /^grid-cols-\[(.+)\]$/.exec(c)?.[1]
      if (tracks && tracks.split('_').some((t) => /^[\d.]+fr$/.test(t))) {
        problems.push(`${where}: \`${c}\` has a bare \`fr\` track — write \`minmax(0,Nfr)\``)
      }
    }
  }
}

if (problems.length) {
  console.error('check-grid: grids that long text can widen past the popup:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('check-grid: ok')
