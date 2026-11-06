/**
 * Typed wrapper around chrome.i18n. Every UI string goes through `t()`; the
 * key type is derived from the default (zh_CN) catalog, so a typo is a
 * type error. The JSON is only referenced in a type position, so it is not
 * bundled — the browser serves the catalog itself.
 */
export type MessageKey = keyof typeof import('../../_locales/zh_CN/messages.json')

export function t(key: MessageKey, substitutions?: string | string[]): string {
  return chrome.i18n.getMessage(key, substitutions)
}
