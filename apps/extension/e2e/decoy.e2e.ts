import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {launchChrome, openPopup, storageSnapshot, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {clearAndType, clickText, hasText, listItems, onboard, sleep, submitUnlock, waitIcons, waitText} from './support/popup'
import {cleanupTemp} from './support/temp'

describe.skipIf(!hasChrome)('decoy launcher (Chrome)', () => {
  let s: ChromeSession
  let recoveryCode = ''

  beforeAll(async () => {
    s = await launchChrome()
    const p = await openPopup(s)
    recoveryCode = await onboard(p, 'notes')
    await p.close()
  })
  afterAll(async () => {
    await s?.browser.close()
    cleanupTemp()
  })

  it('shows only ordinary quick links while locked, and filters them', async () => {
    const p = await openPopup(s)
    // A fresh profile has no cached icons: letter tiles.
    await waitIcons(p)
    expect(await listItems(p)).toEqual([
      'GGitHubgithub.com',
      'MMDN Web Docsdeveloper.mozilla.org',
      'GGoogle Docsdocs.google.com',
      'GGmailmail.google.com'
    ])
    await p.type('input', 'goo')
    await sleep(50)
    expect(await listItems(p)).toHaveLength(2)
    await p.close()
  })

  it('a wrong passphrase changes nothing on screen; the right one unlocks', async () => {
    const p = await openPopup(s)
    await clearAndType(p, 'input', 'wrong')
    const before = await p.evaluate(() => document.getElementById('root')?.innerHTML)
    await p.keyboard.press('Enter')
    await sleep(1500)
    expect(await p.evaluate(() => document.getElementById('root')?.innerHTML)).toBe(before)
    expect(await submitUnlock(p, 'notes')).toBe(true)
    await p.close()
  })

  it('the right passphrase still unlocks right after many wrong ones', async () => {
    const p = await openPopup(s)
    for (let i = 0; i < 6; i++) await submitUnlock(p, `nope${i}`, 300)
    expect(await submitUnlock(p, 'notes')).toBe(true)
    expect(await storageSnapshot(s)).not.toHaveProperty('throttle')
    await p.close()
  })

  it('a recovery code in the filter box leads to choosing a new passphrase', async () => {
    const p = await openPopup(s)
    await submitUnlock(p, recoveryCode)
    await waitText(p, '设置新口令')
    await p.close()
  })

  it('decoy settings edit links without unlocking, but not the toolbar icon', async () => {
    const p = await openPopup(s)
    await p.click('button[aria-label="快捷链接设置"]')
    await p.type('input[placeholder="名称"]', 'Wiki')
    await p.type('input[placeholder="网址"]', 'wikipedia.org')
    await clickText(p, '添加')
    await sleep(200)
    expect(await p.$$('button[aria-pressed]')).toHaveLength(0)
    const links = (await storageSnapshot(s)).links as {links: {title: string}[]}
    expect(links.links.map((l) => l.title)).toContain('Wiki')
    await p.close()
  })

  it('the toolbar icon is chosen in the unlocked settings', async () => {
    const p = await openPopup(s)
    expect(await submitUnlock(p, 'notes')).toBe(true)
    await p.click('button[aria-label="设置"]')
    await waitText(p, '快速收起快捷键')
    const icons = await p.$$('button[aria-pressed]')
    expect(icons).toHaveLength(4)
    await icons[2]?.click()
    await sleep(300)
    const links = (await storageSnapshot(s)).links as {icon: string}
    expect(links.icon).toBe('star')
    await p.close()
  })

  // Last on purpose: it leaves the stored vault unreadable.
  it('an unreadable vault shows a neutral notice and never falls back to onboarding', async () => {
    const shelf = (await storageSnapshot(s)).shelf as Record<string, unknown>
    await s.sw.evaluate((shelf) => chrome.storage.local.set({shelf: {...shelf, version: 999}}), shelf)
    const p = await openPopup(s)
    await waitText(p, '请更新扩展，不要卸载')
    expect(await hasText(p, '口令')).toBe(false)
    expect(await listItems(p)).toHaveLength(5)
    expect(await submitUnlock(p, 'notes')).toBe(false)
    expect(((await storageSnapshot(s)).shelf as {version: number}).version).toBe(999)
    await p.close()
  })
})
