import {existsSync} from 'node:fs'
import puppeteer, {type Browser, type Page, type WebWorker} from 'puppeteer-core'
import {CHROME_PATH, DIST_CHROMIUM} from './env'
import {patchedCopy, tempDir} from './temp'

export interface ChromeSession {
  browser: Browser
  extId: string
  /** The extension's service worker: `sw.evaluate(() => chrome.…)`. */
  sw: WebWorker
  downloads: string
}

let zhBuild: string | undefined

/**
 * The suite finds buttons by their zh_CN labels, so it runs a copy of the
 * build whose only (and default) catalog is zh_CN: the machine's language
 * can't switch it to English. One copy per test file, so a relaunch with the
 * same profile gets the same extension id.
 */
function zhOnlyBuild(): string {
  if (!zhBuild || !existsSync(zhBuild)) zhBuild = patchedCopy(DIST_CHROMIUM, {onlyLocale: 'zh_CN'})
  return zhBuild
}

/**
 * Chrome on macOS ignores --lang and follows the system languages; the Cocoa
 * argument domain overrides them for this process. Chrome also takes the
 * "(xx)" value for a startup URL and opens a stray tab, which is why only the
 * language checks set `lang`. Linux reads LANGUAGE (set in `launchChrome`).
 */
function languageArgs(lang: string | undefined): string[] {
  if (!lang) return []
  return process.platform === 'darwin' ? ['-AppleLanguages', `(${lang})`] : [`--lang=${lang}`]
}

export async function launchChrome(
  options: {
    extension?: string
    serverPort?: number
    headless?: boolean
    userDataDir?: string
    /**
     * Browser UI language, for checking which catalog the real build picks.
     * Without it the build is pinned to zh_CN (see `zhOnlyBuild`).
     */
    lang?: string
    /**
     * Lets pages produce sound, so tabs can turn `audible` (puppeteer passes
     * --mute-audio, which keeps every tab silent). Tests keep the volume far
     * below hearing.
     */
    audible?: boolean
  } = {}
): Promise<ChromeSession> {
  const {lang} = options
  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    ...languageArgs(lang),
    // Chrome 157 turns on balanced HTTPS-First by default: an http:// visit to a
    // public name (example.com) is tried over https first, and when the test
    // server (plain http) fails that, Chrome shows its warning page instead —
    // puppeteer sees net::ERR_BLOCKED_BY_CLIENT and nothing reaches history.
    '--disable-features=HttpsFirstBalancedModeAutoEnable'
  ]
  if (options.serverPort) args.push(`--host-resolver-rules=MAP * 127.0.0.1:${options.serverPort}`)
  const browser = await puppeteer.launch({
    executablePath: CHROME_PATH,
    headless: options.headless ?? true,
    pipe: true,
    ignoreDefaultArgs: options.audible ? ['--mute-audio'] : undefined,
    enableExtensions: [options.extension ?? (lang ? DIST_CHROMIUM : zhOnlyBuild())],
    userDataDir: options.userDataDir ?? tempDir('chrome'),
    args,
    env: lang ? {...process.env, LANGUAGE: lang.replace('-', '_')} : process.env
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

/** Waits (polling the background) until the stored data satisfies `done`. */
export async function waitStorage(
  session: ChromeSession,
  done: (snapshot: Record<string, unknown>) => boolean,
  timeout = 5000
): Promise<Record<string, unknown>> {
  const deadline = Date.now() + timeout
  for (;;) {
    const snapshot = await storageSnapshot(session)
    if (done(snapshot)) return snapshot
    if (Date.now() > deadline) throw new Error(`storage did not reach the expected state: ${JSON.stringify(snapshot)}`)
    await new Promise((r) => setTimeout(r, 100))
  }
}
