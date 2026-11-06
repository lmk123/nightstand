import type Browser from 'webextension-polyfill'

const target = import.meta.env.EXTENSION_PUBLIC_BROWSER

/**
 * True when building for Firefox or any other Gecko-based target that
 * Extension.js accepts for `--browser` (these all get the `firefox:` manifest
 * keys). Use this (not a direct `EXTENSION_PUBLIC_BROWSER` comparison) so every
 * extension context agrees on which runtime code path to take.
 *
 * Keep it a chain of literal comparisons: the bundler folds it to a constant,
 * so the other browser's branch is dropped from each build.
 */
export const isFirefoxLike =
  target === 'firefox' ||
  target === 'firefox-based' ||
  target === 'gecko-based' ||
  target === 'waterfox' ||
  target === 'librewolf' ||
  target === 'zen' ||
  target === 'floorp'

/**
 * True when building for Chrome or any other Chromium-based target that
 * Extension.js accepts for `--browser` (these all get the `chromium:` manifest
 * keys). This is not simply `!isFirefoxLike`: WebKit targets (`safari`,
 * `webkit-based`) are neither.
 *
 * Same rule as `isFirefoxLike`: keep it a chain of literal comparisons.
 */
export const isChromiumLike =
  target === 'chrome' ||
  target === 'chromium' ||
  target === 'chromium-based' ||
  target === 'chromium-emulator' ||
  target === 'edge' ||
  target === 'brave' ||
  target === 'opera' ||
  target === 'vivaldi' ||
  target === 'yandex'

/**
 * The global `browser`, typed as the WebExtension (Firefox) API.
 *
 * @types/chrome (>= 0.3) declares `var browser: typeof chrome`, which collides
 * with Extension.js's `const browser: typeof import('webextension-polyfill')`
 * (the conflict is only hidden by `skipLibCheck`) and wins, so the global has
 * no Firefox-only API typings. This is the single place that
 * re-types it; call it only inside an `isFirefoxLike` branch.
 *
 * It is a function rather than a constant so that importing this module never
 * touches `browser` at load time.
 */
export function firefoxBrowser(): Browser.Browser {
  return browser as unknown as Browser.Browser
}
