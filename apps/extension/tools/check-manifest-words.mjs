// Fails if anything the browser shows on the extensions / shortcuts pages
// (name, description, toolbar title, command descriptions) gives away what
// Nightstand is for. Runs as part of `pnpm lint`.
import {readdirSync, readFileSync} from 'node:fs'
import {dirname, join} from 'node:path'
import {fileURLToPath} from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(join(root, 'src/manifest.json'), 'utf8'))

const forbidden = [
  'private', 'privacy', 'hide', 'hidden', 'secret', 'incognito', 'stealth',
  'porn', 'adult', 'nsfw', 'vault',
  '隐私', '隐藏', '私密', '秘密', '无痕', '保密'
]

// Collect every user-visible manifest string, resolving __MSG_x__ per locale.
const visible = [
  manifest.name,
  manifest.description,
  manifest.action?.default_title,
  ...Object.values(manifest.commands ?? {}).map((c) => c.description)
].filter(Boolean)

const problems = []
const localesDir = join(root, '_locales')
for (const locale of readdirSync(localesDir)) {
  const messages = JSON.parse(
    readFileSync(join(localesDir, locale, 'messages.json'), 'utf8')
  )
  for (const raw of visible) {
    const key = /^__MSG_(\w+)__$/.exec(raw)?.[1]
    const text = key ? messages[key]?.message : raw
    if (text === undefined) {
      problems.push(`${locale}: missing message "${key}"`)
      continue
    }
    const lower = text.toLowerCase()
    for (const word of forbidden) {
      if (lower.includes(word)) problems.push(`${locale}: "${text}" contains "${word}"`)
    }
  }
}

if (problems.length) {
  console.error('check-manifest-words: visible manifest strings are not neutral:')
  for (const p of problems) console.error(`  - ${p}`)
  process.exit(1)
}
console.log('check-manifest-words: ok')
