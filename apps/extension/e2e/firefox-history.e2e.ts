import {execFileSync} from 'node:child_process'
import {join} from 'node:path'
import {buildMatchTable} from '@nightstand/core'
import puppeteer from 'puppeteer-core'
import {afterAll, describe, expect, it} from 'vitest'
import {DIST_FIREFOX, FIREFOX_PATH, hasFirefox} from './support/env'
import {sleep} from './support/popup'
import {startTestServer} from './support/server'
import {cleanupTemp, patchedCopy, tempDir} from './support/temp'

function hasSqlite(): boolean {
  try {
    execFileSync('sqlite3', ['-version'])
    return true
  } catch {
    return false
  }
}

/**
 * Firefox's WebDriver BiDi refuses to open or expose moz-extension:// pages,
 * so the popup can't be driven here. This checks the background instead: a
 * test copy seeds the match table at startup, real visits go through a local
 * proxy, and the profile's places.sqlite shows what history is left.
 */
describe.skipIf(!hasFirefox || !hasSqlite())('history cleanup (Firefox background)', () => {
  afterAll(() => cleanupTemp())

  it('removes protected sites from the real history database', async () => {
    const table = await buildMatchTable([
      {url: 'https://example.com/', matchMode: 'site'},
      {url: 'https://example.org/p?q=1', matchMode: 'exact'}
    ])
    const extension = patchedCopy(DIST_FIREFOX, {
      manifest: (m) => {
        const bss = m.browser_specific_settings as {gecko: Record<string, unknown>}
        bss.gecko.id = 'nightstand-e2e@local.invalid'
      },
      backgroundFile: 'background/scripts.js',
      appendToBackground: `browser.storage.local.set({index: ${JSON.stringify(table)}});`
    })
    const server = await startTestServer()
    const profile = tempDir('firefox')
    const browser = await puppeteer.launch({
      browser: 'firefox',
      executablePath: FIREFOX_PATH,
      headless: true,
      userDataDir: profile,
      extraPrefsFirefox: {
        'network.proxy.type': 1,
        'network.proxy.http': '127.0.0.1',
        'network.proxy.http_port': server.port,
        'network.proxy.allow_hijacking_localhost': true
      }
    })
    try {
      await browser.installExtension(extension)
      await sleep(1500)
      const [page] = await browser.pages()
      for (const url of [
        'http://example.com/a',
        'http://www.example.com/b',
        'http://sub.example.com/c',
        'http://evil-example.com/',
        'http://example.org/p?q=1',
        'http://example.org/other'
      ]) {
        await page!.goto(url)
        await sleep(400)
      }
      await sleep(2500)
    } finally {
      await browser.close()
      await server.close()
    }
    const rows = execFileSync(
      'sqlite3',
      [
        join(profile, 'places.sqlite'),
        'select p.url from moz_places p join moz_historyvisits v on v.place_id = p.id group by p.url order by p.url;'
      ],
      {encoding: 'utf8'}
    )
    expect(rows.trim().split('\n')).toEqual(['http://evil-example.com/', 'http://example.org/other'])
  })
})
