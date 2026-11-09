import type {Page} from 'puppeteer-core'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {launchChrome, openPopup, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {addEntry, onboard, sleep, submitUnlock} from './support/popup'
import {startTestServer} from './support/server'
import {cleanupTemp} from './support/temp'

/** Whether the page script's cover is up (it lives in the top layer as an open popover). */
function covered(page: Page): Promise<boolean> {
  return page.evaluate(() => document.querySelector(':popover-open') !== null)
}

async function waitCovered(page: Page, expected: boolean): Promise<void> {
  await page.waitForFunction((expected) => (document.querySelector(':popover-open') !== null) === expected, {timeout: 5000}, expected)
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

  it('follows the settings: no cover when off, and turning mute off unmutes', async () => {
    const page = await s.browser.newPage()
    await page.goto('http://example.com/kept-muted')
    await waitCovered(page, true)

    await s.sw.evaluate(() => chrome.storage.local.set({prefs: {cover: false, mute: true}}))
    // An open page is uncovered as soon as the setting changes.
    await waitCovered(page, false)
    expect(await page.title()).toBe(serverTitle('http://example.com/kept-muted'))

    const plain = await s.browser.newPage()
    await plain.goto('http://example.com/uncovered')
    await sleep(300)
    expect(await covered(plain)).toBe(false)
    expect(await muted(s, 'http://example.com/uncovered')).toBe(true)

    await s.sw.evaluate(() => chrome.storage.local.set({prefs: {cover: false, mute: false}}))
    expect(await muted(s, 'http://example.com/uncovered')).toBe(false)
    expect(await muted(s, 'http://example.com/kept-muted')).toBe(false)

    await s.sw.evaluate(() => chrome.storage.local.set({prefs: {cover: true, mute: true}}))
    await page.close()
    await plain.close()
  })
})
