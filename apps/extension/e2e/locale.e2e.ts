import {afterAll, describe, expect, it} from 'vitest'
import {launchChrome, openPopup} from './support/chrome'
import {hasChrome} from './support/env'
import {clickText, waitText} from './support/popup'
import {cleanupTemp} from './support/temp'

// The rest of the suite drives the zh_CN UI. This checks which catalog each
// browser language gets: en is the default, so anything without its own
// catalog falls back to English. Chrome has no zh-HK UI language (it runs a
// Hong Kong browser as zh-TW) and skips the zh_HK catalog, so in Chrome
// Traditional Chinese gets English too.
const english = {htmlLang: 'en', title: 'Quick Links', intro: 'Welcome to Nightstand', start: 'Get started', next: 'Choose a passphrase'}
const cases = [
  {lang: 'en-US', ...english},
  {lang: 'zh-TW', ...english},
  {lang: 'zh-HK', ...english},
  {lang: 'zh-CN', htmlLang: 'zh-CN', title: '快捷链接', intro: '欢迎使用 Nightstand', start: '开始设置', next: '设置解锁口令'}
]

describe.skipIf(!hasChrome)('UI language (Chrome)', () => {
  afterAll(() => cleanupTemp())

  it.each(cases)('$lang browser gets the $htmlLang UI', async (c) => {
    const s = await launchChrome({lang: c.lang})
    try {
      const p = await openPopup(s)
      await waitText(p, c.intro)
      expect(await p.evaluate(() => [document.documentElement.lang, document.title])).toEqual([c.htmlLang, c.title])
      await clickText(p, c.start)
      await waitText(p, c.next)
    } finally {
      await s.browser.close()
    }
  })
})
