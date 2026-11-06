import {addressVariants, hostCandidates, hostOf, isEntryIcon, type VaultEntry} from '@nightstand/core'
import {isChromiumLike} from '@/lib/browser'
import {historySince} from './history'

/**
 * Site icons, read from Chrome's own local icon cache through the extension
 * `_favicon` endpoint (`favicon` permission). Nothing goes over the network:
 * a site the browser has no icon for simply has none here, and the UI shows
 * a letter. Firefox has no such endpoint, so there it is always a letter.
 *
 * Chrome drops a page's cached icon together with its history, so vault
 * entries get their icon captured at save time (before the purge) and stored
 * encrypted with the entry. A later visit to a protected site caches its icon
 * again, and that one stays even though the visit's history is deleted right
 * away (both checked in e2e), so entries still without an icon are looked up
 * again on unlock. Quick Links are ordinary sites whose history stays, so
 * they are looked up live.
 *
 * Chrome falls back to any cached page of the same host, but the host must
 * match exactly: `www.example.com` and `example.com` are different.
 */

/** Pixels per side of a stored icon: crisp at 16 CSS px on a 2× screen. */
const SIZE = 32
/** Most addresses tried per entry before giving up. */
const MAX_TRIES = 16
/** How long unlocking waits for icons of entries that have none, in ms. */
const REFRESH_BUDGET_MS = 1500
/** An address no profile has an icon for: what Chrome answers with then. */
const NO_ICON_PAGE = 'https://nightstand.invalid/'

interface Rendered {
  dataUrl: string
  pixels: Uint8ClampedArray
}

function endpoint(pageUrl: string): string {
  const url = new URL(chrome.runtime.getURL('/_favicon/'))
  url.searchParams.set('pageUrl', pageUrl)
  url.searchParams.set('size', String(SIZE))
  return url.href
}

function loadImage(src: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => resolve(null)
    img.src = src
  })
}

/** Chrome's icon for `pageUrl`, drawn at SIZE×SIZE (Chrome's grey globe when it has none). */
async function render(pageUrl: string): Promise<Rendered | null> {
  const img = await loadImage(endpoint(pageUrl))
  if (!img) return null
  const canvas = document.createElement('canvas')
  canvas.width = SIZE
  canvas.height = SIZE
  const ctx = canvas.getContext('2d')
  if (!ctx) return null
  ctx.drawImage(img, 0, 0, SIZE, SIZE)
  return {dataUrl: canvas.toDataURL('image/png'), pixels: ctx.getImageData(0, 0, SIZE, SIZE).data}
}

let placeholder: Promise<Rendered | null> | undefined

function samePixels(a: Uint8ClampedArray, b: Uint8ClampedArray): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

/** The site's own cached icon as a PNG `data:` URL, or null when Chrome only has its placeholder. */
async function cachedIcon(pageUrl: string): Promise<string | null> {
  placeholder ??= render(NO_ICON_PAGE)
  const [icon, none] = await Promise.all([render(pageUrl), placeholder])
  if (!icon || (none && samePixels(icon.pixels, none.pixels))) return null
  return isEntryIcon(icon.dataUrl) ? icon.dataUrl : null
}

/** Quick Links: the cached icon of an ordinary site, looked up each time the list is shown. */
export function lookupIcon(pageUrl: string): Promise<string | null> {
  if (!isChromiumLike || !hostOf(pageUrl)) return Promise.resolve(null)
  return cachedIcon(pageUrl).catch(() => null)
}

/**
 * The entry's address and its site root, each over http(s) and with and
 * without `www.`: one of them shares the host of whatever page Chrome cached
 * the icon for, in the common cases.
 */
function siteAddresses(entry: VaultEntry): string[] {
  const host = hostOf(entry.url)
  if (!host) return []
  return [...new Set([...addressVariants(entry.url), ...addressVariants(`https://${host}/`)])]
}

/**
 * Pages of the entry's own host (or its subdomains) that Chrome may hold an
 * icon for: the entry's site addresses first, then what history has, newest
 * first. Extra hosts are left out — the icon is the site's own.
 */
async function* candidates(entry: VaultEntry): AsyncGenerator<string> {
  const host = hostOf(entry.url)
  if (!host) return
  yield* siteAddresses(entry)
  for await (const item of historySince(0, host)) {
    const itemHost = item.url ? hostOf(item.url) : null
    if (item.url && itemHost && hostCandidates(itemHost).includes(host)) yield item.url
  }
}

/**
 * Vault entries: captures the site's icon to store with the entry. Call it
 * before the entry's history is purged. Undefined when there is none.
 */
export async function captureIcon(entry: VaultEntry): Promise<string | undefined> {
  if (!isChromiumLike) return undefined
  try {
    const tried = new Set<string>()
    for await (const url of candidates(entry)) {
      if (tried.has(url)) continue
      tried.add(url)
      const icon = await cachedIcon(url)
      if (icon) return icon
      if (tried.size >= MAX_TRIES) break
    }
  } catch (error) {
    console.error(error)
  }
  return undefined
}

/**
 * On unlock: icons for entries that have none, found since they were saved
 * (a visit after saving caches the site's icon again). Only the site
 * addresses are tried — a protected site has no history left to search —
 * and only for `REFRESH_BUDGET_MS`; whatever is found by then is returned,
 * by entry id.
 */
export async function findMissingIcons(entries: readonly VaultEntry[]): Promise<Map<string, string>> {
  const found = new Map<string, string>()
  if (!isChromiumLike) return found
  const lookups = entries
    .filter((entry) => !entry.icon)
    .map(async (entry) => {
      for (const url of siteAddresses(entry)) {
        const icon = await cachedIcon(url).catch(() => null)
        if (icon) return void found.set(entry.id, icon)
      }
    })
  await Promise.race([Promise.all(lookups), new Promise((resolve) => setTimeout(resolve, REFRESH_BUDGET_MS))])
  return new Map(found)
}

/** `entry` with a captured icon when it has none yet and one is cached. */
export async function withIcon(entry: VaultEntry): Promise<VaultEntry> {
  if (entry.icon) return entry
  const icon = await captureIcon(entry)
  return icon ? {...entry, icon} : entry
}
