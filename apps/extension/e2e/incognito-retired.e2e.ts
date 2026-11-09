import {afterAll, beforeAll, describe, expect, it} from 'vitest'
import fixture from '../../../packages/core/test/fixtures/v1.json' with {type: 'json'}
import {launchChrome, openPopup, type ChromeSession} from './support/chrome'
import {hasChrome} from './support/env'
import {hasText, submitUnlock} from './support/popup'
import {cleanupTemp} from './support/temp'

// The frozen v1 vault opens entries in an incognito window, an option since
// retired: the first unlock after the update says so once, then never again.
const NOTICE = '不再支持用无痕窗口打开'

describe.skipIf(!hasChrome)('retired incognito open mode (Chrome)', () => {
  let s: ChromeSession

  beforeAll(async () => {
    s = await launchChrome()
    await s.sw.evaluate((shelf) => chrome.storage.local.set({shelf}), fixture.vault)
  })
  afterAll(async () => {
    await s?.browser.close()
    cleanupTemp()
  })

  it('tells a user who opened sites in incognito once, on the next unlock', async () => {
    let p = await openPopup(s)
    expect(await submitUnlock(p, fixture.passphrase)).toBe(true)
    expect(await hasText(p, NOTICE)).toBe(true)
    await p.close()

    p = await openPopup(s)
    expect(await submitUnlock(p, fixture.passphrase)).toBe(true)
    expect(await hasText(p, NOTICE)).toBe(false)
    await p.close()
  })
})
