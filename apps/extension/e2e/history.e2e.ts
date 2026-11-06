import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {historyUrls, launchChrome, openPopup, storageSnapshot, visit, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {addEntry, onboard, sleep} from './support/popup'
import {startTestServer} from './support/server'
import {cleanupTemp} from './support/temp'

describe.skipIf(!hasChrome)('history cleanup and panic (Chrome)', () => {
  let s: ChromeSession
  let server: Awaited<ReturnType<typeof startTestServer>>

  beforeAll(async () => {
    server = await startTestServer()
    s = await launchChrome({serverPort: server.port})
  })
  afterAll(async () => {
    await s?.browser.close()
    await server?.close()
    cleanupTemp()
  })

  it('purges existing history when entries are added', async () => {
    for (const url of [
      'http://example.com/a',
      'http://www.example.com/b',
      'http://evil-example.com/',
      'http://example.org/x?q=1',
      'http://example.org/y'
    ]) {
      await visit(s, url)
    }
    const p = await openPopup(s)
    await onboard(p, 'notes')
    await addEntry(p, 'example.com')
    expect(await historyUrls(s)).toEqual([
      'http://evil-example.com/',
      'http://example.org/x?q=1',
      'http://example.org/y'
    ])
    await addEntry(p, 'http://example.org/x?q=1', 'exact')
    expect(await historyUrls(s)).toEqual(['http://evil-example.com/', 'http://example.org/y'])
    await p.close()
  })

  it('cleans visits while locked: subdomains, www, case, fragments, exact URLs — not look-alikes', async () => {
    for (const url of [
      'http://sub.example.com/c',
      'http://WWW.EXAMPLE.COM/d#frag',
      'http://evil-example.com/again',
      'http://example.org/x?q=1#h',
      'http://example.org/z'
    ]) {
      await visit(s, url)
    }
    expect(await historyUrls(s)).toEqual([
      'http://evil-example.com/',
      'http://evil-example.com/again',
      'http://example.org/y',
      'http://example.org/z'
    ])
  })

  it("never leaves the extension's own pages in history", async () => {
    const urls = await historyUrls(s)
    expect(urls.filter((u) => u.startsWith('chrome-extension://'))).toEqual([])
  })

  it('schedules the incremental scan and records full scans', async () => {
    const alarms = await s.sw.evaluate(() => chrome.alarms.getAll())
    expect(alarms.map((a) => [a.name, a.periodInMinutes])).toEqual([['scan', 15]])
    const state = (await storageSnapshot(s)).state as {lastScanAt: number}
    expect(state.lastScanAt).toBeGreaterThan(0)
  })

  it('panic closes protected tabs and the popup, keeps others', async () => {
    for (const url of ['http://example.com/open', 'http://example.org/x?q=1', 'http://example.org/keep']) {
      const tab = await s.browser.newPage()
      await tab.goto(url)
    }
    await openPopup(s)
    // Same event the keyboard shortcut fires.
    await s.sw.evaluate(() => {
      ;(chrome.commands.onCommand as unknown as {dispatch: (c: string) => void}).dispatch('panic')
    })
    await sleep(1500)
    const open = (await s.browser.pages()).map((pg) => pg.url())
    expect(open).toContain('http://example.org/keep')
    expect(open).not.toContain('http://example.com/open')
    expect(open).not.toContain('http://example.org/x?q=1')
    expect(open.some((u) => u.startsWith('chrome-extension://'))).toBe(false)
  })
})
