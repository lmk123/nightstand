import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {launchChrome, openPopup, visit, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {clickText, onboard, sleep, waitText} from './support/popup'
import {startTestServer} from './support/server'
import {cleanupTemp, tempDir} from './support/temp'

// Chrome keeps the hops of a redirect chain (the http→https upgrade of a
// typed domain, the https attempt before an http fallback) as visits without
// the chain-end flag. `history.search` never returns them, but the address
// bar keeps suggesting their URLs — a typed `example.cc` came back after
// "0 pages" were deleted. Only the History database shows what is left, so
// this file seeds it and reads it with the sqlite3 CLI while Chrome is closed.

function hasSqlite(): boolean {
  try {
    execFileSync('sqlite3', ['-version'])
    return true
  } catch {
    return false
  }
}

/** Microseconds since 1601, Chrome's history clock. */
const chromeNow = () => BigInt(Date.now()) * 1000n + 11_644_473_600_000_000n
const TYPED_FROM_ADDRESS_BAR = 0x02000001
const CHAIN_START = 0x10000000
const SERVER_REDIRECT = 0x80000000

describe.skipIf(!hasChrome || !hasSqlite())('redirect hops hidden from history.search (Chrome)', () => {
  let s: ChromeSession | undefined
  let server: Awaited<ReturnType<typeof startTestServer>>
  let profile: string
  let historyDb: string

  const sql = (query: string) => execFileSync('sqlite3', [historyDb, query], {encoding: 'utf8'})

  beforeAll(async () => {
    server = await startTestServer()
    profile = tempDir('chrome')
    historyDb = join(profile, 'Default', 'History')
    // First run creates the History database; then seed what a typed
    // `example.cc` that was upgraded to https left behind: two hops, neither
    // flagged as the end of its chain.
    const first = await launchChrome({serverPort: server.port, userDataDir: profile})
    await visit(first, 'http://example.net/')
    await first.browser.close()
    const now = chromeNow()
    sql(`
      insert into urls (url, title, visit_count, typed_count, last_visit_time, hidden) values
        ('http://example.cc/', 'cc', 1, 0, ${now}, 0),
        ('https://example.cc/', 'cc', 1, 1, ${now}, 0);
      insert into visits (url, visit_time, from_visit, transition, segment_id, visit_duration) values
        ((select id from urls where url = 'http://example.cc/'), ${now}, 0, ${TYPED_FROM_ADDRESS_BAR | CHAIN_START}, 0, 0),
        ((select id from urls where url = 'https://example.cc/'), ${now}, 0, ${(TYPED_FROM_ADDRESS_BAR | SERVER_REDIRECT) | 0}, 0, 0);
    `)
    s = await launchChrome({serverPort: server.port, userDataDir: profile})
  })
  afterAll(async () => {
    await s?.browser.close()
    await server?.close()
    cleanupTemp()
  })

  it('the hops are in history but no search finds them', async () => {
    const session = s!
    await visit(session, 'http://example.org/a')
    await sleep(500)
    const probe = await session.sw.evaluate(async () => ({
      search: (await chrome.history.search({text: '', startTime: 0, maxResults: 100})).map((i) => i.url),
      visits: await Promise.all(
        ['http://example.cc/', 'https://example.cc/', 'https://example.org/a'].map(
          async (url) => (await chrome.history.getVisits({url})).length
        )
      )
    }))
    expect(probe.search.sort()).toEqual(['http://example.net/', 'http://example.org/a'])
    // The cc hops were seeded; https://example.org/a is the https attempt
    // Chrome makes before falling back to the plain-http test server.
    expect(probe.visits.every((n) => n > 0)).toBe(true)
  })

  it('saving counts and deletes them; later visits leave no hops either', async () => {
    const session = s!
    const p = await openPopup(session)
    await onboard(p, 'notes')
    for (const url of ['https://example.cc/', 'example.org']) {
      await clickText(p, '手动添加')
      await p.type('#url', url)
      await clickText(p, '保存')
      await waitText(p, '2 个网页的浏览记录')
      await clickText(p, '确认保存')
      await waitText(p, '添加当前页')
    }
    await p.close()
    // Locked: the background alone cleans this visit and its https attempt.
    await visit(session, 'http://example.org/b')
    await sleep(1000)
    await session.browser.close()
    s = undefined
    expect(sql("select url from urls where url like '%example.%' order by url;").trim().split('\n')).toEqual([
      'http://example.net/',
      'https://example.net/'
    ])
  })
})
