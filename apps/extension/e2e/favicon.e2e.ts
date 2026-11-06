import type {Page} from 'puppeteer-core'
import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {historyUrls, launchChrome, openPopup, storageSnapshot, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {clickText, listItems, onboard, rowIcons, sleep, submitUnlock, waitText} from './support/popup'
import {startTestServer} from './support/server'
import {cleanupTemp} from './support/temp'

// Site icons come from Chrome's local icon cache only (`_favicon`). Chrome
// drops a page's icon together with its history, so a vault entry's icon is
// captured at save time, before the purge, and stored inside the encrypted
// vault; Quick Links are looked up live.

/** Visits a page and stays until Chrome has fetched and cached its icon. */
async function visitWithIcon(s: ChromeSession, url: string) {
  const page = await s.browser.newPage()
  await page.goto(url)
  await sleep(1500)
  await page.close()
}

/** The colour at the centre of an icon `data:` URL. */
function centre(page: Page, src: string): Promise<number[]> {
  return page.evaluate(async (src) => {
    const img = new Image()
    img.src = src
    await img.decode()
    const canvas = document.createElement('canvas')
    canvas.width = img.naturalWidth
    canvas.height = img.naturalHeight
    const ctx = canvas.getContext('2d')!
    ctx.drawImage(img, 0, 0)
    return [...ctx.getImageData(canvas.width >> 1, canvas.height >> 1, 1, 1).data]
  }, src)
}

/** Whether Chrome's icon cache has a non-placeholder icon for this page. */
function chromeHasIcon(page: Page, pageUrl: string): Promise<boolean> {
  return page.evaluate(async (pageUrl) => {
    const bytes = async (u: string) => {
      const url = new URL(chrome.runtime.getURL('/_favicon/'))
      url.searchParams.set('pageUrl', u)
      url.searchParams.set('size', '32')
      return new Uint8Array(await (await fetch(url)).arrayBuffer()).join()
    }
    return (await bytes(pageUrl)) !== (await bytes('https://nightstand.invalid/'))
  }, pageUrl)
}

async function addManually(p: Page, url: string, title: string) {
  await clickText(p, '手动添加')
  await p.type('#url', url)
  await p.type('#title', title)
  await clickText(p, '保存')
  await clickText(p, '确认保存')
  await waitText(p, '添加当前页')
}

describe.skipIf(!hasChrome)('site icons (Chrome)', () => {
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

  it('a saved entry keeps its site icon after its history is gone', async () => {
    // Under www. and over http: the entry is typed as `example.com`, so
    // its icon is found through the history of its host.
    await visitWithIcon(s, 'http://www.example.com/iconic')
    await visitWithIcon(s, 'http://example.org/plain')
    const p = await openPopup(s)
    await onboard(p, 'notes')
    await addManually(p, 'example.com', 'Red')
    await addManually(p, 'example.org', 'Plain')
    expect(await listItems(p)).toEqual(['PPlain', 'Red']) // a letter tile, then an icon
    const [plain, red] = await rowIcons(p)
    expect(plain).toBeNull()
    expect(red).toMatch(/^data:image\/png;base64,/)
    expect(await centre(p, red!)).toEqual([255, 0, 0, 255])
    await p.close()
    expect(await historyUrls(s)).toEqual([])

    // Stored encrypted with the entry: still there after locking, though
    // Chrome no longer has it (the history it hung on is deleted).
    expect(JSON.stringify(await storageSnapshot(s))).not.toContain('data:image')
    const q = await openPopup(s)
    expect(await chromeHasIcon(q, 'http://www.example.com/iconic')).toBe(false)
    expect(await submitUnlock(q, 'notes')).toBe(true)
    await waitText(q, '添加当前页')
    const [, again] = await rowIcons(q)
    expect(again).toBe(red)
    await q.close()
  })

  it('an entry saved without an icon gets one on the next unlock after a visit', async () => {
    // Plain (example.org) had no icon when it was saved. Visiting it now
    // caches one under www. The visit's history is deleted as soon as it is
    // recorded, before the icon arrives over the network, so Chrome keeps
    // the icon. (With an instant icon it is a race: written first, the icon
    // goes with the history, and the lookup just finds nothing this time.)
    const visited = 'http://www.example.org/iconic?rgb=0,255,0&delay=300'
    await visitWithIcon(s, visited)
    expect(await historyUrls(s)).toEqual([])
    const p = await openPopup(s)
    expect(await chromeHasIcon(p, visited)).toBe(true)
    expect(await submitUnlock(p, 'notes')).toBe(true)
    await waitText(p, '添加当前页')
    const [green, red] = await rowIcons(p)
    expect(await centre(p, green!)).toEqual([0, 255, 0, 255])
    expect(await centre(p, red!)).toEqual([255, 0, 0, 255])
    await p.close()
    // Stored: the next unlock has it without looking it up again.
    const q = await openPopup(s)
    expect(await submitUnlock(q, 'notes')).toBe(true)
    await waitText(q, '添加当前页')
    expect((await rowIcons(q))[0]).toBe(green)
    await q.close()
  })

  it('quick links show the icon Chrome has cached, a letter otherwise', async () => {
    await visitWithIcon(s, 'http://example.net/iconic?rgb=0,0,255')
    const p = await openPopup(s)
    await p.click('button[aria-label="快捷链接设置"]')
    await p.type('input[placeholder="名称"]', 'Blue')
    await p.type('input[placeholder="网址"]', 'http://example.net/iconic?rgb=0,0,255')
    await clickText(p, '添加')
    await p.close()

    const q = await openPopup(s)
    expect(await chromeHasIcon(q, 'http://example.net/iconic?rgb=0,0,255')).toBe(true)
    const items = await listItems(q)
    const icons = await rowIcons(q)
    const blue = icons[items.findIndex((item) => item.startsWith('Blue'))]
    expect(blue).toMatch(/^data:image\/png;base64,/)
    expect(await centre(q, blue!)).toEqual([0, 0, 255, 255])
    // The defaults (GitHub, …) were never visited in this profile.
    expect(icons.filter((icon) => icon === null)).toHaveLength(4)
    await q.close()
  })
})
