// Page script: runs at document_start in the top frame of every http(s) page.
//
// On a protected page it draws an opaque cover over everything and gives the
// tab a neutral title until the user clicks "Show"; the background keeps the
// tab muted until then. A shown page is covered again when its tab is hidden,
// when the browser window loses focus (the background says so) or after a
// minute without input on the page.
//
// It only reads the hashed match table and the cover/mute preferences, never
// the vault, and sends nothing anywhere except "shown"/"covered" for its own
// tab to the background. On any other page it removes its pre-load hiding as
// soon as the lookup answers and then stays idle.
import {createMatcher, parseMatchTable, parsePrefs, type UrlMatcher} from '@nightstand/core'
import {t} from '@/platform/i18n'
import {isPageNotice, type PageRequest} from '@/platform/messages'
import {STORAGE_KEYS} from '@/platform/storage'

/** A shown page is covered again after this long without input on it. */
const IDLE_MS = 60_000

/** Input that counts as using the page. */
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/** Covers the host itself: page styles can't reach inside the shadow root, and these win over theirs. */
const HOST_STYLE = [
  'all:initial',
  'position:fixed',
  'inset:0',
  'width:100vw',
  'height:100vh',
  'max-width:none',
  'max-height:none',
  'margin:0',
  'padding:0',
  'border:0',
  'background:transparent',
  'display:block',
  'overflow:hidden',
  'z-index:2147483647',
  'visibility:visible',
  'opacity:1',
  'pointer-events:auto'
]
  .map((rule) => `${rule}!important`)
  .join(';')

const SHADOW_CSS = `
.cover {
  position: fixed; inset: 0; display: grid; place-items: center;
  background: #f4f4f5; color: #3f3f46; color-scheme: light dark;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
button {
  font: inherit; color: inherit; cursor: pointer;
  padding: 6px 14px; border-radius: 8px;
  border: 1px solid #d4d4d8; background: #fff;
}
button:hover { background: #fafafa; }
button:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .cover { background: #18181b; color: #d4d4d8; }
  button { border-color: #3f3f46; background: #27272a; }
  button:hover { background: #303034; }
}
`

type State = 'deciding' | 'off' | 'covered' | 'shown'

function send(request: PageRequest): Promise<unknown> {
  try {
    return chrome.runtime.sendMessage(request).catch(() => undefined)
  } catch {
    // Extension updated or removed since this page loaded.
    return Promise.resolve(undefined)
  }
}

export default function main(): (() => void) | undefined {
  if (window.top !== window) return undefined
  const firstRoot = document.documentElement
  if (!(firstRoot instanceof HTMLElement)) return undefined

  let state: State = 'deciding'

  // Hide everything until the lookup answers: on a protected page nothing may
  // paint before the cover is up. `opacity` on the root can't be undone by
  // any descendant (unlike `visibility`). The lookup is one storage read and
  // a few hashes, normally done before the first paint anyway.
  const hold = document.createElement('style')
  hold.textContent = 'html{opacity:0!important}'
  firstRoot.append(hold)
  const release = () => hold.remove()

  // The cover: a top-layer popover, so it sits above the page's own stacking
  // contexts; raised again whenever the page puts something in the top layer.
  const host = document.createElement('div')
  host.setAttribute('popover', 'manual')
  host.setAttribute('style', HOST_STYLE)
  const shadow = host.attachShadow({mode: 'closed'})
  const style = document.createElement('style')
  style.textContent = SHADOW_CSS
  const cover = document.createElement('div')
  cover.className = 'cover'
  const button = document.createElement('button')
  button.type = 'button'
  button.textContent = t('coverShow')
  button.addEventListener('click', () => show(true))
  cover.append(button)
  shadow.append(style, cover)

  function raise(): void {
    if (!host.isConnected) (document.documentElement ?? document).append(host)
    try {
      if (host.matches(':popover-open')) host.hidePopover()
      host.showPopover()
    } catch {
      // Not an HTML document any more (document.open), or no popover support:
      // the fixed, max z-index host still covers the page.
    }
  }

  // Tab title: the page's own while shown, a neutral one while covered.
  const neutralTitle = t('coverTitle')
  let pageTitle: string | null = null
  let ownTitle: HTMLTitleElement | null = null

  function maskTitle(): void {
    const current = document.title
    if (current === neutralTitle) return
    pageTitle = current
    const existing = document.querySelector('title')
    document.title = neutralTitle
    // With no <title> yet, the setter creates one (once there is a <head>).
    if (!existing) ownTitle = document.querySelector('title')
  }

  function restoreTitle(): void {
    if (ownTitle) {
      ownTitle.remove()
      ownTitle = null
    } else if (pageTitle !== null && document.title === neutralTitle) {
      document.title = pageTitle
    }
    pageTitle = null
  }

  // While covered: keep the title masked and the cover attached, whatever
  // the page (or its parser) does to the document.
  const watcher = new MutationObserver(() => {
    if (state !== 'covered') return
    if (!host.isConnected) raise()
    maskTitle()
  })

  function onTopLayer(event: Event): void {
    if (state !== 'covered' || event.target === host) return
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    raise()
  }
  document.addEventListener('toggle', onTopLayer, true)
  document.addEventListener('fullscreenchange', onTopLayer, true)

  // Idle: a shown page is covered again after IDLE_MS without input.
  let lastInput = Date.now()
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  const onActivity = () => {
    lastInput = Date.now()
  }
  function checkIdle(): void {
    idleTimer = undefined
    if (state !== 'shown') return
    const left = lastInput + IDLE_MS - Date.now()
    if (left > 0) idleTimer = setTimeout(checkIdle, left)
    else coverPage(true)
  }
  function startIdle(): void {
    lastInput = Date.now()
    clearTimeout(idleTimer)
    idleTimer = setTimeout(checkIdle, IDLE_MS)
  }
  for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, {capture: true, passive: true})

  function coverPage(report: boolean): void {
    clearTimeout(idleTimer)
    state = 'covered'
    raise()
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    maskTitle()
    watcher.observe(document, {childList: true, subtree: true, characterData: true})
    release()
    if (report) void send({type: 'pageCovered'})
  }

  function uncover(): void {
    watcher.disconnect()
    try {
      if (host.matches(':popover-open')) host.hidePopover()
    } catch {
      // Already gone with its document.
    }
    host.remove()
    restoreTitle()
  }

  function show(report: boolean): void {
    if (state === 'covered') uncover()
    state = 'shown'
    release()
    startIdle()
    if (report) void send({type: 'pageShown'})
  }

  function off(): void {
    if (state === 'covered') uncover()
    clearTimeout(idleTimer)
    state = 'off'
    release()
  }

  async function lookup(): Promise<{cover: boolean; matcher: UrlMatcher | null}> {
    const stored = await chrome.storage.local.get([STORAGE_KEYS.index, STORAGE_KEYS.prefs])
    const {cover} = parsePrefs(stored[STORAGE_KEYS.prefs])
    let matcher: UrlMatcher | null = null
    try {
      matcher = createMatcher(parseMatchTable(stored[STORAGE_KEYS.index]))
    } catch {
      // No vault yet, or a damaged table: nothing is protected.
    }
    return {cover, matcher}
  }

  /**
   * Matches the URL here when possible: true / false, or null when this page
   * can't hash (plain http is not a secure context, so no `crypto.subtle`)
   * and the background has to answer instead.
   */
  async function matchHere(): Promise<boolean | null> {
    const {cover, matcher} = await lookup()
    if (!cover || !matcher || matcher.isEmpty) return false
    if (!globalThis.crypto?.subtle) return null
    return matcher.matches(location.href)
  }

  /**
   * Decides for the current URL. Entering a protected page asks the
   * background whether this tab was already shown (a link followed from a
   * shown page stays shown); `onlyRelease` (preferences or the list changed
   * while the page is open) never covers, it only uncovers a page that is no
   * longer protected.
   */
  async function evaluate(onlyRelease = false): Promise<void> {
    let local: boolean | null = false
    try {
      local = await matchHere()
    } catch (error) {
      console.error(error)
    }
    if (local === false) {
      off()
      return
    }
    const settled = state === 'covered' || state === 'shown'
    if (local === true && (onlyRelease || settled)) return
    const reply = (await send({type: 'pageQuery'})) as {inside?: unknown; shown?: unknown} | undefined
    if (local === null && reply?.inside !== true) {
      off()
      return
    }
    if (onlyRelease || settled) return
    if (reply?.shown === true && document.visibilityState === 'visible') show(false)
    else coverPage(false)
  }

  // One evaluation at a time: a URL change can arrive while the first is running.
  let pending: Promise<void> = Promise.resolve()
  const queueEvaluate = (onlyRelease?: boolean) => {
    pending = pending.then(() => evaluate(onlyRelease)).catch(console.error)
  }

  // Leaving the page also turns it hidden; that must not count as switching
  // away, or the next page in this tab would open covered. `pagehide` comes
  // first. A page restored from the back/forward cache asks again.
  let leaving = false
  const onVisibility = () => {
    if (!leaving && document.visibilityState === 'hidden' && state === 'shown') coverPage(true)
  }
  const onPageHide = () => {
    leaving = true
  }
  const onPageShow = (event: PageTransitionEvent) => {
    leaving = false
    if (!event.persisted || state !== 'shown') return
    pending = pending
      .then(async () => {
        const reply = (await send({type: 'pageQuery'})) as {shown?: unknown} | undefined
        if (state === 'shown' && (reply?.shown !== true || document.visibilityState !== 'visible')) coverPage(false)
      })
      .catch(console.error)
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)

  const onNotice = (message: unknown) => {
    if (!isPageNotice(message)) return
    if (message.type === 'cover') {
      if (state === 'shown') coverPage(false)
    } else {
      queueEvaluate()
    }
  }
  chrome.runtime.onMessage.addListener(onNotice)

  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return
    if (STORAGE_KEYS.index in changes || STORAGE_KEYS.prefs in changes) queueEvaluate(true)
  }
  chrome.storage.onChanged.addListener(onStorage)

  queueEvaluate()

  return () => {
    off()
    clearTimeout(idleTimer)
    document.removeEventListener('toggle', onTopLayer, true)
    document.removeEventListener('fullscreenchange', onTopLayer, true)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, {capture: true})
    chrome.runtime.onMessage.removeListener(onNotice)
    chrome.storage.onChanged.removeListener(onStorage)
  }
}
