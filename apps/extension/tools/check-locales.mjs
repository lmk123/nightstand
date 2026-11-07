// Keeps every _locales/<locale>/messages.json in step with the default (en)
// catalog. The `MessageKey` type only catches keys missing from en; this
// catches a key missing from another locale, a stray extra key, mismatched
// placeholders, and $NAME$ references nothing declares. Runs in `pnpm lint`.
import {readdirSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'))
const base = manifest.default_locale
const localesDir = join(root, '_locales')
const load = (locale) =>
  JSON.parse(readFileSync(join(localesDir, locale, 'messages.json'), 'utf8'))

const problems = []
const reference = load(base)

/** Placeholder name (lower-cased, as Chrome matches them) → content. */
function placeholders(entry) {
  return Object.fromEntries(
    Object.entries(entry.placeholders ?? {}).map(([name, p]) => [name.toLowerCase(), p.content])
  )
}

function checkEntry(locale, key, entry) {
  if (typeof entry?.message !== 'string' || entry.message.trim() === '') {
    problems.push(`${locale}: "${key}" has an empty message`)
    return
  }
  const declared = placeholders(entry)
  for (const [, name] of entry.message.matchAll(/\$([A-Za-z0-9_@]+)\$/g)) {
    if (!(name.toLowerCase() in declared)) {
      problems.push(`${locale}: "${key}" uses $${name}$ but does not declare it`)
    }
  }
}

for (const [key, entry] of Object.entries(reference)) checkEntry(base, key, entry)

for (const locale of readdirSync(localesDir)) {
  if (locale === base) continue
  const messages = load(locale)
  for (const key of Object.keys(reference)) {
    if (!(key in messages)) problems.push(`${locale}: missing "${key}"`)
  }
  for (const [key, entry] of Object.entries(messages)) {
    if (!(key in reference)) {
      problems.push(`${locale}: "${key}" is not in ${base}`)
      continue
    }
    checkEntry(locale, key, entry)
    const want = JSON.stringify(placeholders(reference[key]))
    const got = JSON.stringify(placeholders(entry))
    if (want !== got) {
      problems.push(`${locale}: "${key}" placeholders ${got} differ from ${base} ${want}`)
    }
  }
}

if (problems.length) {
  console.error('check-locales: catalogs are out of step:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('check-locales: ok')
