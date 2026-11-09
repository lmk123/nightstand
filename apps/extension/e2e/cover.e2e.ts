import type {Page, Protocol} from 'puppeteer-core'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {launchChrome, openPopup, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {addEntry, clearAndType, clickText, hasText, onboard, sleep, submitUnlock, waitText} from './support/popup'
import {startTestServer} from './support/server'
import {cleanupTemp} from './support/temp'

/** The page script's cover: a modal dialog it appends to the root element (page dialogs live in the body). */
const COVER = ':root > dialog:modal'

/** Whether the page script's cover is up. */
function covered(page: Page): Promise<boolean> {
  return page.evaluate((selector) => document.querySelector(selector) !== null, COVER)
}

async function waitCovered(page: Page, expected: boolean): Promise<void> {
  await page.waitForFunction(
    (selector, expected) => (document.querySelector(selector) !== null) === expected,
    {timeout: 5000},
    COVER,
    expected
  )
}

/** The page is not held invisible (the page script hides everything until it has decided). */
function painted(page: Page): Promise<boolean> {
  return page.evaluate(() => getComputedStyle(document.documentElement).opacity === '1')
}

async function muted(s: ChromeSession, url: string): Promise<boolean | undefined> {
  // Give the background a moment: mute/unmute follow tab events and messages.
  await sleep(300)
  return s.sw.evaluate(async (url) => (await chrome.tabs.query({url}))[0]?.mutedInfo?.muted, url)
}

/** The test server's title for a page: its Host header and request line (Chrome sends absolute URLs here). */
function serverTitle(url: string): string {
  return new URL(url).host + url
}

/** The Show button sits in the middle of the cover (inside a closed shadow root). */
async function clickShow(page: Page): Promise<void> {
  const {w, h} = await page.evaluate(() => ({w: innerWidth, h: innerHeight}))
  await page.mouse.click(w / 2, h / 2)
}

/**
 * The cover's button, read through CDP because it sits in a closed shadow
 * root: its tooltip and the fill colours its icon draws (none until the icon
 * has loaded).
 */
async function coverButton(page: Page): Promise<{title: string | null; fills: string[]}> {
  const cdp = await page.createCDPSession()
  try {
    const {root} = await cdp.send('DOM.getDocument', {depth: -1, pierce: true})
    const attribute = (node: Protocol.DOM.Node, name: string) => {
      const list = node.attributes ?? []
      const i = list.findIndex((value, index) => index % 2 === 0 && value === name)
      return i === -1 ? null : (list[i + 1] ?? null)
    }
    const children = (node: Protocol.DOM.Node) => [...(node.shadowRoots ?? []), ...(node.children ?? [])]
    const find = (node: Protocol.DOM.Node, test: (n: Protocol.DOM.Node) => boolean): Protocol.DOM.Node[] =>
      [...(test(node) ? [node] : []), ...children(node).flatMap((child) => find(child, test))]
    // The cover is the dialog under the root element; page dialogs live in the body.
    const html = find(root, (n) => n.nodeName === 'HTML')[0]
    const cover = html?.children?.find((n) => n.nodeName === 'DIALOG')
    const button = cover && find(cover, (n) => n.nodeName === 'BUTTON')[0]
    if (!button) return {title: null, fills: []}
    const fills = find(button, (n) => n.nodeName === 'rect' || n.nodeName === 'path')
      .map((n) => attribute(n, 'fill'))
      .filter((fill) => fill !== null)
    return {title: attribute(button, 'title'), fills}
  } finally {
    await cdp.detach()
  }
}

/** Waits until the cover's icon draws this colour. */
async function waitIconFill(page: Page, fill: string): Promise<void> {
  const deadline = Date.now() + 5000
  while (!(await coverButton(page)).fills.includes(fill)) {
    if (Date.now() > deadline) throw new Error(`cover icon never drew ${fill}: ${JSON.stringify(await coverButton(page))}`)
    await sleep(100)
  }
}

/** A colour only the "nightstand" icon uses, and one only "book" uses. */
const NIGHTSTAND_FILL = '#4f7264'
const BOOK_FILL = '#3f5f8a'

describe.skipIf(!hasChrome)('covering and muting protected pages (Chrome)', () => {
  let s: ChromeSession
  let server: Awaited<ReturnType<typeof startTestServer>>

  beforeAll(async () => {
    server = await startTestServer()
    s = await launchChrome({serverPort: server.port})
    const p = await openPopup(s)
    await onboard(p, 'notes')
    await addEntry(p, 'example.com')
    await p.close()
  })
  afterAll(async () => {
    await s?.browser.close()
    await server?.close()
    cleanupTemp()
  })

  it('opens a protected page covered, muted and with a neutral title', async () => {
    const page = await s.browser.newPage()
    await page.goto('http://www.example.com/a')
    await waitCovered(page, true)
    expect(await page.title()).toBe('新标签页')
    expect(await painted(page)).toBe(true)
    expect(await muted(s, 'http://www.example.com/a')).toBe(true)
    await page.close()
  })

  it('also matches on secure pages, where the page script hashes by itself', async () => {
    const p = await openPopup(s)
    await submitUnlock(p, 'notes')
    await addEntry(p, 'localhost')
    await p.close()
    const page = await s.browser.newPage()
    await page.goto(`http://localhost:${server.port}/secure`)
    expect(await page.evaluate(() => isSecureContext)).toBe(true)
    await waitCovered(page, true)
    expect(await page.title()).toBe('新标签页')
    await page.close()
  })

  it('leaves other sites alone, look-alikes included', async () => {
    for (const url of ['http://example.org/b', 'http://evil-example.com/c']) {
      const page = await s.browser.newPage()
      await page.goto(url)
      await sleep(300)
      expect(await covered(page)).toBe(false)
      expect(await painted(page)).toBe(true)
      expect(await page.title()).toBe(serverTitle(url))
      expect(await muted(s, url)).toBe(false)
      await page.close()
    }
  })

  it('shows the page and its sound on click, and stays shown along links on protected pages', async () => {
    const page = await s.browser.newPage()
    await page.goto('http://example.com/a')
    await waitCovered(page, true)
    await clickShow(page)
    await waitCovered(page, false)
    expect(await page.title()).toBe(serverTitle('http://example.com/a'))
    expect(await muted(s, 'http://example.com/a')).toBe(false)

    await page.goto('http://sub.example.com/next')
    await sleep(300)
    expect(await covered(page)).toBe(false)
    expect(await page.title()).toBe(serverTitle('http://sub.example.com/next'))
    expect(await muted(s, 'http://sub.example.com/next')).toBe(false)

    // Leaving protected pages and coming back starts covered again.
    await page.goto('http://example.org/elsewhere')
    await page.goto('http://example.com/back')
    await waitCovered(page, true)
    expect(await muted(s, 'http://example.com/back')).toBe(true)
    await page.close()
  })

  it('covers and mutes again when the tab is switched away from', async () => {
    const page = await s.browser.newPage()
    await page.goto('http://example.com/switch')
    await waitCovered(page, true)
    await clickShow(page)
    await waitCovered(page, false)

    const other = await s.browser.newPage()
    await other.goto('http://example.org/other')
    await page.bringToFront()
    await waitCovered(page, true)
    expect(await muted(s, 'http://example.com/switch')).toBe(true)
    await other.close()
    await page.close()
  })

  it('covers and mutes again when the browser window loses focus', async () => {
    const page = await s.browser.newPage()
    await page.goto('http://example.com/focus')
    await waitCovered(page, true)
    await clickShow(page)
    await waitCovered(page, false)
    // Same event Chrome fires when another application takes focus.
    await s.sw.evaluate(() => {
      ;(chrome.windows.onFocusChanged as unknown as {dispatch: (id: number) => void}).dispatch(chrome.windows.WINDOW_ID_NONE)
    })
    await waitCovered(page, true)
    expect(await page.title()).toBe('新标签页')
    expect(await muted(s, 'http://example.com/focus')).toBe(true)
    await page.close()
  })

  it('follows the settings: turning mute off unmutes, and muting goes with the cover', async () => {
    const page = await s.browser.newPage()
    await page.goto('http://example.com/mute-off')
    await waitCovered(page, true)
    expect(await muted(s, 'http://example.com/mute-off')).toBe(true)
    await s.sw.evaluate(() => chrome.storage.local.set({prefs: {cover: true, mute: false}}))
    expect(await muted(s, 'http://example.com/mute-off')).toBe(false)
    expect(await covered(page)).toBe(true)
    // Muting back on: a page still covered is muted again at once.
    await s.sw.evaluate(() => chrome.storage.local.set({prefs: {cover: true, mute: true}}))
    expect(await muted(s, 'http://example.com/mute-off')).toBe(true)
    await page.close()

    const open = await s.browser.newPage()
    await open.goto('http://example.com/cover-off')
    await waitCovered(open, true)
    expect(await muted(s, 'http://example.com/cover-off')).toBe(true)

    // Covering off: an open page is uncovered and unmuted at once (it would
    // never be shown, so its mute would never end), and new pages neither.
    await s.sw.evaluate(() => chrome.storage.local.set({prefs: {cover: false, mute: true}}))
    await waitCovered(open, false)
    expect(await open.title()).toBe(serverTitle('http://example.com/cover-off'))
    expect(await muted(s, 'http://example.com/cover-off')).toBe(false)

    const plain = await s.browser.newPage()
    await plain.goto('http://example.com/uncovered')
    await sleep(300)
    expect(await covered(plain)).toBe(false)
    expect(await muted(s, 'http://example.com/uncovered')).toBe(false)

    await s.sw.evaluate(() => chrome.storage.local.set({prefs: {cover: true, mute: true}}))
    await open.close()
    await plain.close()
  })

  it('uncovers and unmutes an open page as soon as its site is no longer protected', async () => {
    const page = await s.browser.newPage()
    await page.goto('http://example.com/removed')
    await waitCovered(page, true)
    expect(await muted(s, 'http://example.com/removed')).toBe(true)

    // Same storage change as removing the last entry (the table goes away).
    const index = await s.sw.evaluate(async () => {
      const {index} = await chrome.storage.local.get('index')
      await chrome.storage.local.remove('index')
      return index as unknown
    })
    await waitCovered(page, false)
    expect(await muted(s, 'http://example.com/removed')).toBe(false)

    await s.sw.evaluate((index) => chrome.storage.local.set({index}), index)
    await page.close()
  })

  it('stays clickable over a modal dialog the page opens', async () => {
    const page = await s.browser.newPage()
    await page.evaluateOnNewDocument(() => {
      addEventListener('DOMContentLoaded', () => {
        const dialog = document.createElement('dialog')
        dialog.textContent = 'page dialog'
        document.body.append(dialog)
        dialog.showModal()
      })
    })
    await page.goto('http://example.com/dialog')
    await waitCovered(page, true)
    await page.waitForFunction(() => document.querySelector('body > dialog')?.matches('[open]') === true)
    // The cover is raised above the page's dialog, which would otherwise make it inert.
    await waitCovered(page, true)
    await clickShow(page)
    await waitCovered(page, false)
    expect(await page.evaluate(() => document.querySelector('body > dialog')?.matches(':modal'))).toBe(true)
    await page.close()
  })

  it('mutes a page covered on reload after its site was added while it was open', async () => {
    const page = await s.browser.newPage()
    await page.goto('http://example.net/reload')
    await sleep(300)
    expect(await covered(page)).toBe(false)

    const p = await openPopup(s)
    await submitUnlock(p, 'notes')
    await addEntry(p, 'example.net')
    await p.close()
    // Added while open: left as it is until it loads again.
    await sleep(300)
    expect(await covered(page)).toBe(false)

    await page.reload()
    await waitCovered(page, true)
    expect(await muted(s, 'http://example.net/reload')).toBe(true)
    await page.close()
  })

  it('shows the toolbar icon on the button, follows a change of icon, and says who covered the page on hover', async () => {
    const page = await s.browser.newPage()
    await page.goto('http://example.com/icon')
    await waitCovered(page, true)
    await waitIconFill(page, NIGHTSTAND_FILL)
    expect((await coverButton(page)).title).toBe('Nightstand 暂时遮住了这个页面')

    // The decoy settings write `links`; the open cover follows, and so does a page loaded after.
    const links = await s.sw.evaluate(async () => (await chrome.storage.local.get('links')).links as Record<string, unknown>)
    const next = await s.browser.newPage()
    try {
      await s.sw.evaluate((links) => chrome.storage.local.set({links: {...links, icon: 'book'}}), links)
      await waitIconFill(page, BOOK_FILL)
      expect((await coverButton(page)).fills).not.toContain(NIGHTSTAND_FILL)
      await next.goto('http://example.com/icon-next')
      await waitCovered(next, true)
      await waitIconFill(next, BOOK_FILL)
    } finally {
      await next.close()
      await page.close()
      await s.sw.evaluate((links) => chrome.storage.local.set({links}), links)
    }
  })

  describe('the save notice', () => {
    const cover = '打开它的网页时会先遮住页面，点“显示页面”后才显示（可在设置里关闭）'
    const coverMute = '打开它的网页时会先遮住页面并静音，点“显示页面”后才显示（可在设置里关闭）'
    let savedPrefs: unknown

    beforeAll(async () => {
      savedPrefs = await s.sw.evaluate(async () => (await chrome.storage.local.get('prefs')).prefs)
    })

    afterAll(async () => {
      await s.sw.evaluate(async (prefs) => {
        if (prefs === undefined) await chrome.storage.local.remove('prefs')
        else await chrome.storage.local.set({prefs})
      }, savedPrefs)
    })

    it('mentions the cover (and the mute) only when they are on', async () => {
      const p = await openPopup(s)
      try {
        await submitUnlock(p, 'notes')
        await clickText(p, '手动添加')
        await p.type('#url', 'example.org')
        for (const [prefs, expected] of [
          [{cover: true, mute: true}, coverMute],
          [{cover: true, mute: false}, cover],
          [{cover: false, mute: true}, null]
        ] as const) {
          await s.sw.evaluate((prefs) => chrome.storage.local.set({prefs}), prefs)
          await clickText(p, '保存')
          await waitText(p, '确认保存')
          expect(await hasText(p, cover)).toBe(expected === cover)
          expect(await hasText(p, coverMute)).toBe(expected === coverMute)
          await clickText(p, '返回修改')
          await p.waitForFunction(() => !document.body.textContent?.includes('确认保存'))
        }
      } finally {
        await p.close()
      }
    })

    it('leaves the cover out when an edit protects nothing new', async () => {
      // A bookmark under every protected site, so a title-only edit still gets the notice.
      const urls = ['http://example.com/bm', 'http://example.net/bm', 'http://localhost/bm']
      const ids = await s.sw.evaluate(
        async (urls) => Promise.all(urls.map(async (url) => (await chrome.bookmarks.create({title: 'bm', url})).id)),
        urls
      )
      const p = await openPopup(s)
      try {
        await s.sw.evaluate(() => chrome.storage.local.set({prefs: {cover: true, mute: true}}))
        await submitUnlock(p, 'notes')
        const [firstEdit] = await p.$$('button[aria-label="编辑"]')
        if (!firstEdit) throw new Error('no 编辑 button in the list')
        await firstEdit.click()
        await clearAndType(p, '#title', 'Renamed')
        await clickText(p, '保存')
        await waitText(p, '确认保存')
        expect(await hasText(p, '1 个书签')).toBe(true)
        expect(await hasText(p, coverMute)).toBe(false)
        expect(await hasText(p, cover)).toBe(false)
      } finally {
        await p.close()
        await s.sw.evaluate(async (ids) => Promise.all(ids.map((id) => chrome.bookmarks.remove(id))), ids)
      }
    })
  })
})
