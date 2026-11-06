import {afterAll, beforeAll, describe, expect, it} from 'vitest'
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

  it('rates the passphrase and opens the FAQ without losing onboarding input or writing anything', async () => {
    const p = await openPopup(s)
    await clickText(p, '开始设置')
    await p.type('#pass', 'notes')
    await waitText(p, '口令强度：弱')
    await clearAndType(p, '#pass', 'tide lamp quiver 47')
    await waitText(p, '口令强度：强')
    await clickText(p, '口令长度有什么影响？')
    await waitText(p, '全部猜一遍约需')
    await p.click('button[aria-label="返回"]')
    expect(await hasText(p, '全部猜一遍约需')).toBe(false)
    expect(await p.$eval('#pass', (el) => (el as HTMLInputElement).value)).toBe('tide lamp quiver 47')
    await p.close()
    expect(await vaultKeys(s)).toEqual([])
  })

  it('validates the passphrase, then writes everything only at the last step', async () => {
    const p = await openPopup(s)
    expect(await hasText(p, '欢迎使用 Nightstand')).toBe(true)
    await clickText(p, '开始设置')
    await p.type('#pass', 'abc')
    await p.type('#pass2', 'abc')
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
    await sleep(1100) // let the silent back-off window pass
    expect(await submitUnlock(p, 'shelf')).toBe(true)
    await openSettings(p)
    await waitText(p, '打开方式')
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
})
