import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import {launchChrome, openPopup, storageSnapshot, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {clearAndType, clickText, hasText, listItems, onboard, sleep, submitUnlock, waitText} from './support/popup'
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

  it('silently ignores even the right passphrase during back-off', async () => {
    const p = await openPopup(s)
    for (let i = 0; i < 4; i++) await submitUnlock(p, `nope${i}`, 300)
    expect((await storageSnapshot(s)).throttle).toMatchObject({failures: 4})
    expect(await submitUnlock(p, 'notes', 300)).toBe(false)
    await sleep(1200)
    await p.keyboard.press('Enter')
    await waitText(p, '添加当前页')
    await p.close()
  })

  it('a recovery code in the filter box leads to choosing a new passphrase', async () => {
    const p = await openPopup(s)
    await submitUnlock(p, recoveryCode)
    await waitText(p, '设置新口令')
    await p.close()
  })

  it('decoy settings edit links and the toolbar icon without unlocking', async () => {
    const p = await openPopup(s)
    await p.click('button[aria-label="快捷链接设置"]')
    await p.type('input[placeholder="名称"]', 'Wiki')
    await p.type('input[placeholder="网址"]', 'wikipedia.org')
    await clickText(p, '添加')
    await sleep(200)
    const icons = await p.$$('button[aria-pressed]')
    await icons[2]?.click()
    await sleep(300)
    const links = (await storageSnapshot(s)).links as {links: {title: string}[]; icon: string}
    expect(links.links.map((l) => l.title)).toContain('Wiki')
    expect(links.icon).toBe('star')
    await p.close()
  })

  it('turning the disguise off shows a classic passphrase screen', async () => {
    let p = await openPopup(s)
    expect(await submitUnlock(p, 'notes')).toBe(true)
    await p.click('button[aria-label="设置"]')
    await waitText(p, '快速收起快捷键')
    await p.click('[data-slot=switch]')
    await sleep(300)
    await p.close()
    p = await openPopup(s)
    expect(await hasText(p, '忘记口令？')).toBe(true)
    await p.close()
  })
})
