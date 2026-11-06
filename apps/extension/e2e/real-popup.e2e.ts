import {readdirSync} from 'node:fs'
import type {Page, Target} from 'puppeteer-core'
import {afterEach, describe, expect, it} from 'vitest'
import {launchChrome, type ChromeSession} from './support/chrome'
import {hasChrome, headed} from './support/env'
import {sleep} from './support/popup'
import {cleanupTemp} from './support/temp'

/**
 * Focus-related behaviour of the *real* action popup, which only a visible
 * window shows. Opt in: `E2E_HEADED=1 pnpm test:e2e`. These pin down the
 * findings the UI is designed around (see CLAUDE.md).
 */
describe.skipIf(!hasChrome || !headed)('real action popup (Chrome, headed)', () => {
  let s: ChromeSession | undefined

  afterEach(async () => {
    await s?.browser.close()
    s = undefined
    cleanupTemp()
  })

  async function openRealPopup(session: ChromeSession): Promise<{target: Target; page: Page}> {
    await session.sw.evaluate(async () => {
      const [win] = await chrome.windows.getAll({windowTypes: ['normal']})
      if (win?.id === undefined) throw new Error('no window')
      await chrome.windows.update(win.id, {focused: true})
      await chrome.action.openPopup({windowId: win.id})
    })
    const target = await session.browser.waitForTarget((t) =>
      t.url().startsWith(`chrome-extension://${session.extId}/action/`)
    )
    const page = await target.asPage()
    await page.waitForSelector('#root > *')
    return {target, page}
  }

  async function isOpen(session: ChromeSession, target: Target) {
    return session.browser.targets().includes(target)
  }

  it('a file chooser does not close the popup', async () => {
    s = await launchChrome({headless: false})
    const {target, page} = await openRealPopup(s)
    await page.evaluate(() => {
      const input = document.createElement('input')
      input.type = 'file'
      input.id = 'probe'
      document.body.prepend(input)
    })
    await page.click('#probe')
    await sleep(2500)
    expect(await isOpen(s, target)).toBe(true)
  })

  it('a download finishes after the popup closes', async () => {
    s = await launchChrome({headless: false})
    const {page} = await openRealPopup(s)
    await page.evaluate(() => {
      const a = document.createElement('a')
      a.href = URL.createObjectURL(new Blob(['x'.repeat(200_000)], {type: 'application/json'}))
      a.download = 'probe.nightstand'
      a.id = 'probe'
      a.textContent = 'probe'
      document.body.prepend(a)
    })
    await page.click('#probe')
    await page.evaluate(() => window.close())
    await sleep(2000)
    expect(readdirSync(s.downloads)).toContain('probe.nightstand')
  })
})
