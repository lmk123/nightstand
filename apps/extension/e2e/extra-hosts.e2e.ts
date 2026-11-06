import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {historyUrls, launchChrome, openPopup, visit, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {addEntry, clearAndType, clickText, hasText, listItems, onboard, openSettings, submitUnlock, waitText} from './support/popup'
import {startTestServer} from './support/server'
import {cleanupTemp} from './support/temp'

// An entry's extra hosts (the video CDN a site plays from, the payment page
// it hands off to) are cleaned like the entry's own site: existing history
// and bookmarks on save, every later visit while locked.

describe.skipIf(!hasChrome)('extra hosts (Chrome)', () => {
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

  it('saving cleans the extra hosts and their subdomains, not their neighbours', async () => {
    for (const url of [
      'http://example.com/a',
      'http://video.example.net/v.mp4',
      'http://cdn.video.example.net/w.mp4',
      'http://example.net/keep',
      'http://pay.example.org/checkout?o=1',
      'http://example.org/keep'
    ]) {
      await visit(s, url)
    }
    await s.sw.evaluate(() => chrome.bookmarks.create({title: 'v', url: 'http://video.example.net/'}))
    const p = await openPopup(s)
    await onboard(p, 'notes')
    await clickText(p, '手动添加')
    await p.type('#url', 'example.com')
    await p.type('#title', 'Videos')
    await clickText(p, '附加域名（0）')
    // The FAQ explains where to find the hosts; going back keeps the form.
    await clickText(p, '附加域名是什么？怎么找？')
    await waitText(p, '在地址栏打开 chrome://history')
    await clickText(p, '常见问题')
    await p.type('#extra-hosts', 'ftp://nope')
    await clickText(p, '保存')
    await waitText(p, '无法识别的域名：ftp://nope')
    await clearAndType(p, '#extra-hosts', 'video.example.net\nhttps://pay.example.org/checkout?o=1')
    await waitText(p, '附加域名（2）')
    await clickText(p, '保存')
    await waitText(p, '会立即删除这个网站和 2 个附加域名（都含所有子域名）的')
    await waitText(p, '1 个书签')
    await clickText(p, '确认保存')
    await waitText(p, '添加当前页')
    // Domains are never shown, not even in a tooltip: some are revealing on their own.
    expect(await listItems(p)).toEqual(['VVideos']) // letter avatar + title, nothing else
    // A save that protects something new asks for a look at the address bar.
    await waitText(p, '已保存。请马上检查一下地址栏')
    await waitText(p, '输入这个网站域名开头的几个字母')
    expect(await hasText(p, 'example')).toBe(false)
    await p.click('button[title="知道了"]')
    expect(await hasText(p, '请马上检查一下地址栏')).toBe(false)
    // Changing only the title protects nothing new: no notice, no check.
    await p.click('button[title="编辑"]')
    await clearAndType(p, '#title', 'Renamed')
    await clickText(p, '保存')
    await waitText(p, '添加当前页')
    expect((await listItems(p)).some((item) => item.includes('Renamed'))).toBe(true)
    expect(await hasText(p, '请马上检查一下地址栏')).toBe(false)
    await p.close()
    expect(await historyUrls(s)).toEqual(['http://example.net/keep', 'http://example.org/keep'])
    expect(await s.sw.evaluate(async () => (await chrome.bookmarks.search({url: 'http://video.example.net/'})).length)).toBe(0)
  })

  it('cleans later visits to the extra hosts while locked', async () => {
    for (const url of ['http://a.video.example.net/x', 'http://pay.example.org/again', 'http://example.org/still']) {
      await visit(s, url)
    }
    expect(await historyUrls(s)).toEqual([
      'http://example.net/keep',
      'http://example.org/keep',
      'http://example.org/still'
    ])
  })

  it('the address-bar check can be turned off with "don’t show again", and back on in settings', async () => {
    const p = await openPopup(s)
    expect(await submitUnlock(p, 'notes')).toBe(true)
    await addEntry(p, 'example.info/one')
    await waitText(p, '请马上检查一下地址栏')
    await p.click('[role=status] [data-slot=checkbox]')
    await clickText(p, '知道了')
    // Saving the opt-out takes a moment (it re-encrypts the vault) before the notice goes.
    await p.waitForFunction(() => !document.body.textContent?.includes('请马上检查一下地址栏'))

    // Opted out: the next save that protects something new goes without it.
    await addEntry(p, 'example.info/two', 'exact')
    expect(await hasText(p, '请马上检查一下地址栏')).toBe(false)

    // The second switch under "保存网址" brings it back.
    await openSettings(p)
    await waitText(p, '保存后提醒')
    const toggles = await p.$$('[data-slot=switch]')
    expect(await toggles[1]?.evaluate((el) => el.getAttribute('aria-checked'))).toBe('false')
    await toggles[1]?.click()
    await p.waitForFunction(() => document.querySelectorAll('[data-slot=switch]')[1]?.getAttribute('aria-checked') === 'true')
    await p.click('button[aria-label="返回"]')
    await addEntry(p, 'example.info/three', 'exact')
    await waitText(p, '请马上检查一下地址栏')
    await p.close()
  })
})
