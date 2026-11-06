import puppeteer, {type Browser, type Page, type WebWorker} from 'puppeteer-core'
import {CHROME_PATH, DIST_CHROMIUM} from './env'
import {tempDir} from './temp'

export interface ChromeSession {
  browser: Browser
  extId: string
  /** The extension's service worker: `sw.evaluate(() => chrome.…)`. */
  sw: WebWorker
  downloads: string
}

export async function launchChrome(
  options: {extension?: string; serverPort?: number; headless?: boolean; userDataDir?: string} = {}
): Promise<ChromeSession> {
  const args = ['--no-first-run', '--no-default-browser-check', '--lang=zh-CN']
  if (options.serverPort) args.push(`--host-resolver-rules=MAP * 127.0.0.1:${options.serverPort}`)
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: options.headless ?? true,
    pipe: true,
    enableExtensions: [options.extension ?? DIST_CHROMIUM],
    userDataDir: options.userDataDir ?? tempDir('chrome'),
    args
  })
  const target = await browser.waitForTarget(
    (t) => t.type() === 'service_worker' && t.url().startsWith('chrome-extension://')
  )
  const sw = await target.worker()
  if (!sw) throw new Error('extension service worker not found')
  const downloads = tempDir('downloads')
  const cdp = await browser.target().createCDPSession()
  await cdp.send('Browser.setDownloadBehavior', {behavior: 'allow', downloadPath: downloads})
  return {browser, extId: new URL(target.url()).host, sw, downloads}
}

/**
 * The popup UI loaded in a tab. Fine for flows: closing the tab is the same
 * as closing the popup (the page and its in-memory key are gone).
 */
export async function openPopup(session: ChromeSession): Promise<Page> {
  const page = await session.browser.newPage()
  await page.setViewport({width: 360, height: 600})
  await page.goto(`chrome-extension://${session.extId}/action/index.html`)
  await page.waitForSelector('#root > *')
  return page
}

/** Visits a URL in a throwaway tab so it lands in history. */
export async function visit(session: ChromeSession, url: string): Promise<void> {
  const page = await session.browser.newPage()
  await page.goto(url)
  await page.close()
}

/** Every URL in history, sorted, after giving background listeners a moment. */
export async function historyUrls(session: ChromeSession, settleMs = 800): Promise<string[]> {
  await new Promise((r) => setTimeout(r, settleMs))
  const items = await session.sw.evaluate(() =>
    chrome.history.search({text: '', startTime: 0, maxResults: 1000})
  )
  return items.map((i) => i.url ?? '').sort()
}

export function storageSnapshot(session: ChromeSession): Promise<Record<string, unknown>> {
  return session.sw.evaluate(() => chrome.storage.local.get(null))
}
