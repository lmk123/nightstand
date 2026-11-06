import {existsSync} from 'node:fs'
import {fileURLToPath} from 'node:url'

export const CHROME_PATH =
  process.env.CHROME_PATH ?? '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
export const FIREFOX_PATH = process.env.FIREFOX_PATH ?? '/Applications/Firefox.app/Contents/MacOS/firefox'

export const DIST_CHROMIUM = fileURLToPath(new URL('../../dist/chromium', import.meta.url))
export const DIST_FIREFOX = fileURLToPath(new URL('../../dist/firefox', import.meta.url))

export const hasChrome = existsSync(CHROME_PATH) && existsSync(DIST_CHROMIUM)
export const hasFirefox = existsSync(FIREFOX_PATH) && existsSync(DIST_FIREFOX)
/** The real-popup checks need a visible window; opt in with E2E_HEADED=1. */
export const headed = process.env.E2E_HEADED === '1'
