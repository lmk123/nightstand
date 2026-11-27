import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {historyUrls, launchChrome, openPopup, storageSnapshot, visit, waitStorage, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {addEntry, clearAndType, clickText, hasText, onboard, sleep, submitUnlock, waitText} from './support/popup'
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

  it('cleans visits while locked: subdomains, www, case, fragments, exact URLs (with or without a trailing slash) — not look-alikes', async () => {
    for (const url of [
      'http://sub.example.com/c',
      'http://WWW.EXAMPLE.COM/d#frag',
      'http://evil-example.com/again',
      'http://example.org/x?q=1#h',
      'http://example.org/x/?q=1',
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

  it('a paused entry is not cleaned; resuming it cleans what it left', async () => {
    const p = await openPopup(s)
    expect(await submitUnlock(p, 'notes')).toBe(true)
    // Newest first: the exact example.org entry, then example.com.
    const pause = await p.$$('button[aria-label^="暂停"]')
    expect(pause).toHaveLength(2)
    const index = ((await storageSnapshot(s)).index as {site: string[]}).site
    await pause[1]!.click()
    await waitStorage(s, (snap) => (snap.index as {site: string[]}).site.length < index.length)
    await waitText(p, '已暂停')
    await visit(s, 'http://example.com/paused')
    expect(await historyUrls(s)).toContain('http://example.com/paused')
    const bookmarks = () => s.sw.evaluate(async () => (await chrome.bookmarks.search({url: 'http://example.com/kept'})).length)
    await s.sw.evaluate(() => chrome.bookmarks.create({url: 'http://example.com/kept', title: 'kept'}))

    // Editing a paused entry keeps it paused and deletes nothing, so no notice and no check.
    const edit = await p.$$('button[aria-label="编辑"]')
    await edit[1]!.click()
    await clearAndType(p, '#title', 'Renamed while paused')
    await clickText(p, '保存')
    await waitText(p, '添加当前页')
    expect(await hasText(p, 'Renamed while paused')).toBe(true)
    expect(await hasText(p, '已暂停')).toBe(true)
    expect(await hasText(p, '请马上检查一下地址栏')).toBe(false)
    expect(await historyUrls(s)).toContain('http://example.com/paused')
    expect(await bookmarks()).toBe(1)

    // Resuming wipes the history and bookmarks left meanwhile, then asks for the check.
    await p.click('button[aria-label^="恢复"]')
    await waitStorage(s, (snap) => (snap.index as {site: string[]}).site.length === index.length)
    await waitText(p, '请马上检查一下地址栏')
    expect(await historyUrls(s)).not.toContain('http://example.com/paused')
    expect(await bookmarks()).toBe(0)
    expect(await hasText(p, '已暂停')).toBe(false)
    await visit(s, 'http://example.com/resumed')
    expect(await historyUrls(s)).not.toContain('http://example.com/resumed')
    await p.close()
  })

  it('says when other entries still protect a paused site, and stops once they are paused too', async () => {
    const p = await openPopup(s)
    expect(await submitUnlock(p, 'notes')).toBe(true)
    await addEntry(p, 'http://example.com/page', 'exact')
    await addEntry(p, 'sub.example.com')
    type Index = {site: string[]; exact: string[]}
    // Newest first: sub.example.com, the exact example.com/page, example.org (exact), example.com.
    let pause = await p.$$('button[aria-label^="暂停"]')
    expect(pause).toHaveLength(4)
    // The whole site: both newer entries still cover part of it.
    await pause[3]!.click()
    await waitText(p, '仍在保护这个网站')
    // The page overlaps nothing active now, but sub.example.com still covers
    // part of example.com: that notice stays.
    pause = await p.$$('button[aria-label^="暂停"]')
    await pause[1]!.click()
    await waitStorage(s, (snap) => (snap.index as Index).exact.length === 1)
    await sleep(300)
    expect(await hasText(p, '仍在保护这个网站')).toBe(true)
    // Pausing sub.example.com too: nothing active overlaps example.com any more.
    pause = await p.$$('button[aria-label^="暂停"]')
    await pause[0]!.click()
    await waitStorage(s, (snap) => (snap.index as Index).site.length === 0)
    await sleep(300)
    expect(await hasText(p, '仍在保护这个网站')).toBe(false)
    // Back as the later tests expect: example.com protected, the extra entries left paused.
    const resume = await p.$$('button[aria-label^="恢复"]')
    expect(resume).toHaveLength(3)
    await resume[2]!.click()
    await waitStorage(s, (snap) => (snap.index as Index).site.length === 1)
    await p.close()
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
