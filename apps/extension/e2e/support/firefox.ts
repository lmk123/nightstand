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

  // `open -a` needs the bundle: the path may be the bundle itself, a file in
  // it, or a symlink (such as Homebrew's bin/firefox) resolving into one.
  const app = /^.+?\.app(?=\/|$)/.exec(realpathSync(FIREFOX_PATH))?.[0]
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
  /** Kills Firefox and waits for it to exit; if it won't, stops `open` from holding the test process open. */
  const stop = async () => {
    // Firefox runs under launchd, so there's no child pid. Anchored on the
    // bundle so only Firefox is killed, never the `open` we wait on: `open -W`
    // exits once Firefox has.
    const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = `^${escape(app)}/.* --profile ${escape(profile)}( |$)`
    let failed: unknown
    try {
      execFileSync('pkill', ['-f', pattern], {stdio: 'ignore'})
    } catch (error) {
      // 1: nothing matched, it's already gone.
      if ((error as {status?: number}).status !== 1) failed = error
    }
    if (await exitsWithin(5_000)) return
    opener.unref()
    throw new Error('Firefox did not exit', {cause: failed})
  }
  try {
    const browserWSEndpoint = await bidiEndpoint(profile, () => gone)
    const browser = await puppeteer.connect({browserWSEndpoint, protocol: 'webDriverBiDi'})
    return {
      browser,
      async close() {
        // close() swallows its own errors, so a lost connection shows here instead.
        if (!browser.connected) return stop()
        await browser.close()
        if (await exitsWithin(10_000)) return
        return stop()
      }
    }
  } catch (error) {
    // Keep the launch error: it says why.
    await stop().catch(() => {})
    throw error
  }
}

/** Firefox writes the address it picked for `--remote-debugging-port=0` into the profile. */
async function bidiEndpoint(profile: string, gone: () => string | undefined, timeout = 30_000): Promise<string> {
  const file = join(profile, 'WebDriverBiDiServer.json')
  for (const start = Date.now(); Date.now() - start < timeout; await sleep(200)) {
    const why = gone()
    if (why) throw new Error(`Firefox quit before opening its WebDriver BiDi port (${why})`)
    if (!existsSync(file)) continue
    let server: {ws_host?: unknown; ws_port?: unknown}
    try {
      server = JSON.parse(readFileSync(file, 'utf8')) as typeof server
    } catch {
      continue // Caught mid-write: try again.
    }
    const {ws_host: host = '127.0.0.1', ws_port: port} = server
    if (typeof host !== 'string' || typeof port !== 'number') continue
    return `ws://${host.includes(':') ? `[${host}]` : host}:${port}/session`
  }
  throw new Error(`Firefox did not open its WebDriver BiDi port within ${timeout / 1000} s`)
}
