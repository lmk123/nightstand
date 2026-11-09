import type {Page} from 'puppeteer-core'
import {afterAll, beforeAll, describe, expect, it, vi} from 'vitest'
import {launchChrome, openPopup, storageSnapshot, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {
  addEntry,
  clearAndType,
  clickText,
  hasText,
  listItems,
  onboard,
  openSettings,
  sleep,
  submitUnlock,
  waitText
} from './support/popup'
import {cleanupTemp} from './support/temp'

/** Keys that only appear once onboarding completed (the background's own `state` may exist earlier). */
async function vaultKeys(s: ChromeSession): Promise<string[]> {
  const keys = Object.keys(await storageSnapshot(s))
  return keys.filter((k) => ['shelf', 'index', 'links'].includes(k)).sort()
}

describe.skipIf(!hasChrome)('onboarding and vault (Chrome)', () => {
  let s: ChromeSession
  let recoveryCode = ''

  beforeAll(async () => {
    s = await launchChrome()
  })
  afterAll(async () => {
    await s?.browser.close()
    cleanupTemp()
  })

  it('stores nothing when onboarding is abandoned', async () => {
    const p = await openPopup(s)
    await clickText(p, '开始设置')
    await p.type('#pass', 'notes')
    await p.close()
    expect(await vaultKeys(s)).toEqual([])
  })

  it('validates the passphrase, then writes everything only at the last step', async () => {
    const p = await openPopup(s)
    expect(await hasText(p, '欢迎使用 Nightstand')).toBe(true)
    await clickText(p, '开始设置')
    await p.type('#pass', 'abc')
    await p.type('#pass2', 'abc')
    // Only the length is checked; no strength rating is shown.
    expect(await hasText(p, '口令强度')).toBe(false)
    await clickText(p, '下一步')
    await waitText(p, '口令至少需要 4 个字符')
    await clearAndType(p, '#pass', 'notes')
    await clearAndType(p, '#pass2', 'other')
    await clickText(p, '下一步')
    await waitText(p, '两次输入的口令不一致')
    await clearAndType(p, '#pass2', 'notes')
    await clickText(p, '下一步')
    await waitText(p, '保存恢复码')
    expect(await vaultKeys(s)).toEqual([])
    await p.close()
    // Closing at the recovery-code step also leaves nothing behind.
    expect(await vaultKeys(s)).toEqual([])

    const p2 = await openPopup(s)
    recoveryCode = await onboard(p2, 'notes')
    expect(recoveryCode).toMatch(/^([0-9A-Z]{4}-){7}[0-9A-Z]{4}$/)
    expect(await vaultKeys(s)).toEqual(['index', 'links', 'shelf'])
    await p2.close()
  })

  it('adds, de-duplicates, searches, edits and deletes entries; storage holds no plaintext', async () => {
    const p = await openPopup(s)
    expect(await submitUnlock(p, 'notes')).toBe(true)
    await addEntry(p, 'www.Example.com/foo')
    // Same site under another spelling is a duplicate…
    await clickText(p, '手动添加')
    await p.type('#url', 'http://WWW.example.com/bar')
    await clickText(p, '保存')
    await waitText(p, '已经收藏过')
    await clickText(p, '取消')
    // …but the same host as an exact entry is not.
    await addEntry(p, 'example.org/page?q=1', 'exact')
    // Saved without a title: the list shows a neutral name, never the domain.
    expect(await listItems(p)).toEqual(['未未命名', '未未命名'])
    expect(await hasText(p, 'example')).toBe(false)

    const stored = await storageSnapshot(s)
    expect(JSON.stringify(stored.shelf)).not.toContain('example')
    expect(JSON.stringify(stored.index)).not.toContain('example')
    const index = stored.index as {site: string[]; exact: string[]}
    expect([index.site.length, index.exact.length]).toEqual([1, 1])

    await p.type('input[placeholder="搜索…"]', 'org')
    await sleep(50)
    expect(await listItems(p)).toHaveLength(1)
    await clearAndType(p, 'input[placeholder="搜索…"]', '')

    const [firstEdit] = await p.$$('button[aria-label="编辑"]')
    await firstEdit?.click()
    await clickText(p, '删除')
    await clickText(p, '确认删除')
    await sleep(300)
    expect(await listItems(p)).toHaveLength(1)
    await p.close()
  })

  it('locks on close and resets with the recovery code', async () => {
    let p = await openPopup(s)
    expect(await hasText(p, '添加当前页')).toBe(false)
    await p.close()

    p = await openPopup(s)
    expect(await submitUnlock(p, recoveryCode.toLowerCase().replace(/-/g, ' '))).toBe(false)
    await waitText(p, '设置新口令')
    await p.type('#np1', 'shelf')
    await p.type('#np2', 'shelf')
    await clickText(p, '保存')
    await waitText(p, '添加当前页')
    await p.close()

    p = await openPopup(s)
    expect(await submitUnlock(p, 'notes')).toBe(false)
    expect(await submitUnlock(p, 'shelf')).toBe(true)
    await openSettings(p)
    await waitText(p, '快速收起快捷键')
    await p.close()
  })

  it('explains the match modes from the entry form (keeping the draft) and lists the FAQ in settings', async () => {
    const p = await openPopup(s)
    expect(await submitUnlock(p, 'shelf')).toBe(true)
    await clickText(p, '手动添加')
    await p.type('#url', 'example.net/a/')
    await clickText(p, '两种范围有什么区别？')
    await waitText(p, '访问的网址')
    // The entry form stays mounted (hidden) underneath, with its own back button.
    const backs = await p.$$('button[aria-label="返回"]')
    await backs.at(-1)?.click()
    expect(await hasText(p, '访问的网址')).toBe(false)
    expect(await p.$eval('#url', (el) => (el as HTMLInputElement).value)).toBe('example.net/a/')
    await clickText(p, '取消')
    await openSettings(p, '常见问题')
    await waitText(p, '数据是怎么保存的？会被破解吗？')
    // Only one answer is open at a time.
    await clickText(p, '数据是怎么保存的？会被破解吗？')
    await waitText(p, '所有数据只保存在这台电脑的浏览器里')
    await clickText(p, '口令和恢复码保存在哪里？')
    await waitText(p, '哪里都不保存')
    expect(await hasText(p, '所有数据只保存在这台电脑的浏览器里')).toBe(false)
    expect(await p.$$eval('button[aria-expanded="true"]', (els) => els.length)).toBe(1)
    await p.close()
  })

  it('asks before a save wipes history until "don’t show again"; settings bring it back', async () => {
    const p = await openPopup(s)
    expect(await submitUnlock(p, 'shelf')).toBe(true)
    const before = (await listItems(p)).length
    await clickText(p, '手动添加')
    await p.type('#url', 'www.example.net/a')
    await clickText(p, '保存')
    await waitText(p, '会立即删除这个网站（含所有子域名）的')
    // Backing out keeps the draft and saves nothing.
    await clickText(p, '返回修改')
    expect(await p.$eval('#url', (el) => (el as HTMLInputElement).value)).toBe('www.example.net/a')
    expect(await hasText(p, '确认保存')).toBe(false)
    await clickText(p, '保存')
    // The notice shows once the counts are in.
    await (await p.waitForSelector('[role=alertdialog] [data-slot=checkbox]'))?.click()
    await clickText(p, '确认保存')
    await waitText(p, '添加当前页')
    expect(await listItems(p)).toHaveLength(before + 1)

    // Opted out: the next save goes straight through.
    await addEntry(p, 'example.info/x', 'exact', {notice: false})
    expect(await listItems(p)).toHaveLength(before + 2)

    // Turning the switch back on restores the notice (exact wording this time).
    await openSettings(p)
    await waitText(p, '保存网址')
    const toggle = '[data-slot=switch]'
    expect(await p.$eval(toggle, (el) => el.getAttribute('aria-checked'))).toBe('false')
    await p.click(toggle)
    await p.waitForFunction((sel) => document.querySelector(sel)?.getAttribute('aria-checked') === 'true', {}, toggle)
    await p.click('button[aria-label="返回"]')
    await clickText(p, '手动添加')
    await p.type('#url', 'example.biz/only')
    const radios = await p.$$('[data-slot=radio-group-item]')
    await radios[1]?.click()
    await clickText(p, '保存')
    await waitText(p, '会立即删除这个网址的')
    await clickText(p, '返回修改')
    await clickText(p, '取消')

    // Editing only the title wipes nothing new, so no notice.
    const [firstEdit] = await p.$$('button[aria-label="编辑"]')
    await firstEdit?.click()
    await clearAndType(p, '#title', 'renamed')
    await clickText(p, '保存')
    await waitText(p, '添加当前页')
    expect(await hasText(p, 'renamed')).toBe(true)
    await p.close()
  })

  it('a click only selects a row; its Open button or Enter opens it', async () => {
    // Tabs the vault opened. No test server here, so the visit fails and the
    // tab's URL goes blank: count every tab that is neither a popup page nor
    // the browser's start tab.
    const siteTabs = () =>
      s.sw.evaluate(
        async () =>
          (await chrome.tabs.query({})).filter((t) => {
            const url = t.pendingUrl ?? t.url ?? ''
            return !url.startsWith('chrome-extension://') && url !== 'about:blank'
          }).length
      )
    const selectedRow = (page: Page) =>
      page.$$eval('ul li', (items) => items.findIndex((li) => li.getAttribute('aria-current') === 'true'))
    let p = await openPopup(s)
    expect(await submitUnlock(p, 'shelf')).toBe(true)
    const before = await siteTabs()
    expect((await listItems(p)).length).toBeGreaterThanOrEqual(3)

    // Enter with nothing selected opens nothing.
    await p.keyboard.press('Enter')
    await sleep(300)
    expect(await selectedRow(p)).toBe(-1)

    // Clicking a row, even twice, only selects it.
    const rows = await p.$$('ul li > button:first-child')
    await rows[1]?.click()
    await rows[1]?.click()
    await sleep(300)
    expect(await selectedRow(p)).toBe(1)
    expect(await siteTabs()).toBe(before)

    // The arrow keys move the selection from the search box.
    await p.focus('input[placeholder="搜索…"]')
    await p.keyboard.press('ArrowDown')
    expect(await selectedRow(p)).toBe(2)
    await p.keyboard.press('ArrowUp')
    await p.keyboard.press('ArrowUp')
    expect(await selectedRow(p)).toBe(0)
    expect(await siteTabs()).toBe(before)

    await clickText(p, '打开')
    await vi.waitFor(async () => expect(await siteTabs()).toBe(before + 1))

    // While searching, the first match is selected and Enter opens it.
    p = await openPopup(s)
    expect(await submitUnlock(p, 'shelf')).toBe(true)
    await p.type('input[placeholder="搜索…"]', 'info')
    await p.waitForSelector('ul li[aria-current="true"]')
    await p.keyboard.press('Enter')
    await vi.waitFor(async () => expect(await siteTabs()).toBe(before + 2))

    // Enter right after a click opens the clicked row (focus goes back to the search box).
    p = await openPopup(s)
    expect(await submitUnlock(p, 'shelf')).toBe(true)
    const [, , third] = await p.$$('ul li > button:first-child')
    await third?.click()
    expect(await selectedRow(p)).toBe(2)
    expect(await siteTabs()).toBe(before + 2)
    await p.keyboard.press('Enter')
    await vi.waitFor(async () => expect(await siteTabs()).toBe(before + 3))
  })

  it('settings scroll down to their last link, nothing squeezed or cut off', async () => {
    const p = await openPopup(s)
    expect(await submitUnlock(p, 'shelf')).toBe(true)
    await openSettings(p)
    await waitText(p, '从浏览器书签导入')
    const layout = await p.$eval('header + div', (body) => ({
      scrolls: body.scrollHeight > body.clientHeight,
      // A child shorter than its own content has been squeezed by the flex column.
      clipped: [...body.children].filter((el) => el.scrollHeight > el.clientHeight + 1).map((el) => el.textContent?.slice(0, 20))
    }))
    expect(layout.clipped).toEqual([])
    expect(layout.scrolls).toBe(true)
    // The last link can be scrolled to and is fully inside the scroll area.
    const lastVisible = await p.$eval('header + div', (body) => {
      const links = body.querySelectorAll('nav button')
      const last = links[links.length - 1]!
      last.scrollIntoView({block: 'end'})
      const a = body.getBoundingClientRect()
      const b = last.getBoundingClientRect()
      return links.length === 5 && b.top >= a.top && b.bottom <= a.bottom + 0.5
    })
    expect(lastVisible).toBe(true)
    await p.close()
  })
})
