import {execFileSync, spawn} from 'node:child_process'
import {existsSync, readFileSync, realpathSync} from 'node:fs'
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
  if (process.platform !== 'darwin') {
    const browser = await puppeteer.launch({
      browser: 'firefox',
      executablePath: FIREFOX_PATH,
      headless: true,
      userDataDir: profile,
      extraPrefsFirefox: prefs
    })
    return {browser, close: () => browser.close()}
  }

  // `open -a` needs the bundle; a symlink such as Homebrew's bin/firefox
  // resolves into one.
  const app = /^.+?\.app(?=\/)/.exec(realpathSync(FIREFOX_PATH))?.[0]
  if (!app) throw new Error(`FIREFOX_PATH must point into a .app bundle on macOS: ${FIREFOX_PATH}`)

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
  let gone: string | undefined
  const exited = new Promise<void>((resolve) => {
    opener.once('exit', (code, signal) => {
      gone ??= `open exited with ${code ?? signal}`
      resolve()
    })
    opener.once('error', (error) => {
      gone ??= `open failed: ${error.message}`
      resolve()
    })
  })
  const exitsWithin = (ms: number) => Promise.race([exited.then(() => true), sleep(ms).then(() => false)])
  const kill = () => {
    // Firefox runs under launchd, so there's no child pid; `--` because macOS
    // pkill reads a pattern starting with `--profile` as options. Also matches
    // the `open` waiting on it.
    const pattern = `--profile ${profile.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`
    try {
      execFileSync('pkill', ['-f', '--', pattern], {stdio: 'ignore'})
    } catch (error) {
      // 1: nothing matched, it's already gone.
      if ((error as {status?: number}).status !== 1) throw error
    }
  }
  try {
    const port = await bidiPort(profile, () => gone)
    const browser = await puppeteer.connect({browserWSEndpoint: `ws://127.0.0.1:${port}/session`, protocol: 'webDriverBiDi'})
    return {
      browser,
      async close() {
        try {
          await browser.close()
        } catch {
          kill()
        }
        if (await exitsWithin(10_000)) return
        kill()
        if (!(await exitsWithin(5_000))) throw new Error('Firefox did not exit')
      }
    }
  } catch (error) {
    try {
      kill()
    } catch {
      // Keep the launch error: it says why.
    }
    throw error
  }
}

/** Firefox writes the port it picked for `--remote-debugging-port=0` into the profile. */
async function bidiPort(profile: string, gone: () => string | undefined, timeout = 30_000): Promise<number> {
  const file = join(profile, 'WebDriverBiDiServer.json')
  for (const start = Date.now(); Date.now() - start < timeout; await sleep(200)) {
    const why = gone()
    if (why) throw new Error(`Firefox quit before opening its WebDriver BiDi port (${why})`)
    if (!existsSync(file)) continue
    try {
      return (JSON.parse(readFileSync(file, 'utf8')) as {ws_port: number}).ws_port
    } catch {
      // Caught mid-write: try again.
    }
  }
  throw new Error(`Firefox did not open its WebDriver BiDi port within ${timeout / 1000} s`)
}
