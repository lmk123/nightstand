import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {historyUrls, launchChrome, openPopup, visit, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {clearAndType, clickText, listItems, onboard, waitText} from './support/popup'
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
    await waitText(p, '会立即删除 example.com、video.example.net、pay.example.org（含所有子域名）的')
    await waitText(p, '1 个书签')
    await clickText(p, '确认保存')
    await waitText(p, '添加当前页')
    expect((await listItems(p)).some((item) => item.includes('example.com+2'))).toBe(true)
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
})
