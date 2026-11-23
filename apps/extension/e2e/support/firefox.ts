import {execFileSync, spawn} from 'node:child_process'
import {existsSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {Browser as BrowserKind, createProfile} from '@puppeteer/browsers'
import puppeteer, {type Browser} from 'puppeteer-core'
import {FIREFOX_PATH} from './env'
import {sleep} from './popup'

export interface FirefoxSession {
  browser: Browser
  /** Closes Firefox and waits for it to exit, so the profile's files are final. */
  close(): Promise<void>
}

/**
 * Headless Firefox on `profile`, driven over WebDriver BiDi. On macOS it is
 * started through `open` (by launchd): started from inside Claude Code it
 * hangs on a "profile missing" dialog (see .context/e2e/harness.md).
 */
export async function launchFirefox(profile: string, prefs: Record<string, unknown>): Promise<FirefoxSession> {
  const app = /^.+?\.app(?=\/)/.exec(FIREFOX_PATH)?.[0]
  if (process.platform !== 'darwin' || !app) {
    const browser = await puppeteer.launch({
      browser: 'firefox',
      executablePath: FIREFOX_PATH,
      headless: true,
      userDataDir: profile,
      extraPrefsFirefox: prefs
    })
    return {browser, close: () => browser.close()}
  }

  // The profile puppeteer.launch would write: its automation defaults (no
  // first-run pages, updates or telemetry) plus ours, plus its own extra pref.
  await createProfile(BrowserKind.FIREFOX, {
    path: profile,
    preferences: {...prefs, 'fission.webContentIsolationStrategy': 0}
  })
  // -W: `open` exits when Firefox does. -n: a new instance even if one is running.
  const opener = spawn(
    'open',
    ['-W', '-n', '-g', '-a', app, '--args', '--headless', '--no-remote', '--profile', profile, '--remote-debugging-port=0', 'about:blank'],
    {stdio: 'ignore'}
  )
  const exited = new Promise<void>((resolve) => opener.once('exit', () => resolve()))
  const kill = () => {
    try {
      execFileSync('pkill', ['-f', `--profile ${profile}`])
    } catch {
      // Already gone.
    }
  }
  try {
    const port = await bidiPort(profile)
    const browser = await puppeteer.connect({browserWSEndpoint: `ws://127.0.0.1:${port}/session`, protocol: 'webDriverBiDi'})
    return {
      browser,
      async close() {
        try {
          await browser.close()
        } catch {
          kill()
        }
        await exited
      }
    }
  } catch (error) {
    kill()
    throw error
  }
}

/** Firefox writes the port it picked for `--remote-debugging-port=0` into the profile. */
async function bidiPort(profile: string, timeout = 30_000): Promise<number> {
  const file = join(profile, 'WebDriverBiDiServer.json')
  for (const start = Date.now(); Date.now() - start < timeout; await sleep(200)) {
    if (!existsSync(file)) continue
    try {
      return (JSON.parse(readFileSync(file, 'utf8')) as {ws_port: number}).ws_port
    } catch {
      // Caught mid-write: try again.
    }
  }
  throw new Error(`Firefox did not open its WebDriver BiDi port within ${timeout / 1000} s`)
}
