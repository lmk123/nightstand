/**
 * Typed wrapper around chrome.i18n. Every UI string goes through `t()`; the
 * key type is derived from the default (en) catalog, so a typo is a type
 * error. `tools/check-locales.mjs` (in `lint`) keeps the other catalogs in
 * step with it. The JSON is only referenced in a type position, so it is not
 * bundled — the browser serves the catalog itself.
 */
export type MessageKey = keyof typeof import('../../_locales/en/messages.json')

export function t(key: MessageKey, ...substitutions: string[]): string {
  return chrome.i18n.getMessage(key, substitutions)
}
