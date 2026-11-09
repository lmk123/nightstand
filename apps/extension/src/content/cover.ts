// Page script: runs at document_start in the top frame of every http(s) page.
//
// On a protected page it draws an opaque cover over everything and gives the
// tab a neutral title until the user clicks "Show"; the background keeps the
// tab muted until then. A shown page is covered again when its tab is hidden,
// when the browser window loses focus (the background says so) or after a
// minute without input on the page.
//
// It only reads the hashed match table, the cover/mute preferences and the
// toolbar icon (shown on the button, so the user sees what covered the page),
// never the vault, and sends nothing anywhere except "shown"/"covered" for its own
// tab to the background. On any other page it removes its pre-load hiding as
// soon as the lookup answers and then stays idle.
import {createMatcher, parseDecoyConfig, type IconSet, type UrlMatcher} from '@nightstand/core'
import {t} from '@/platform/i18n'
import {isPageNotice, type PageReply, type PageRequest} from '@/platform/messages'
import {loadPageConfig, STORAGE_KEYS} from '@/platform/storage'
import {createIcon} from './cover-icons'

/** A shown page is covered again after this long without input on it. */
const IDLE_MS = 60_000

/** Input that counts as using the page. */
const ACTIVITY_EVENTS = ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart'] as const

/**
 * Styles the host (a `<dialog>`) itself: page styles can't reach inside the
 * shadow root, and these inline `!important` rules win over theirs.
 */
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
  display: inline-flex; align-items: center; gap: 8px;
  padding: 6px 14px 6px 10px; border-radius: 8px;
  border: 1px solid #d4d4d8; background: #fff;
}
svg { width: 16px; height: 16px; flex: none; }
button:hover { background: #fafafa; }
button:focus-visible { outline: 2px solid #a1a1aa; outline-offset: 2px; }
@media (prefers-color-scheme: dark) {
  .cover { background: #18181b; color: #d4d4d8; }
  button { border-color: #3f3f46; background: #27272a; }
  button:hover { background: #303034; }
}
`

type State = 'deciding' | 'off' | 'covered' | 'shown'

/** The background's answer, or undefined when there was none. */
function send(request: PageRequest): Promise<Partial<PageReply> | undefined> {
  try {
    return chrome.runtime.sendMessage<PageRequest, PageReply>(request).catch(() => undefined)
  } catch {
    // Extension updated or removed since this page loaded.
    return Promise.resolve(undefined)
  }
}

/** Chrome is preparing this page before the user goes to it (speculation rules). */
function isPrerendering(): boolean {
  return (document as Document & {prerendering?: boolean}).prerendering === true
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

  // The cover: a modal dialog in the top layer, so it sits above the page's
  // own stacking contexts and makes the page beneath inert; raised again
  // whenever the page puts something in the top layer. Modal rather than a
  // popover: a modal dialog the page opens would make a popover inert too,
  // and "Show page" could not be clicked. A dialog can't hold a shadow root,
  // so a plain element inside it does.
  const host = document.createElement('dialog')
  host.setAttribute('style', HOST_STYLE)
  const inner = document.createElement('div')
  inner.setAttribute('style', 'all:initial!important;display:block!important')
  host.append(inner)
  const shadow = inner.attachShadow({mode: 'closed'})
  const style = document.createElement('style')
  style.textContent = SHADOW_CSS
  const cover = document.createElement('div')
  cover.className = 'cover'
  // The toolbar's icon and, on hover only (a bystander sees just the
  // button), who covered the page: otherwise the owner may not connect a
  // plain grey page with Nightstand.
  const button = document.createElement('button')
  button.type = 'button'
  button.title = t('coverShowTitle', t('extName'))
  let iconSet: IconSet = 'nightstand'
  let icon = createIcon(iconSet)
  const label = document.createElement('span')
  label.textContent = t('coverShow')
  button.append(icon, label)
  button.addEventListener('click', () => show(true))
  cover.append(button)
  shadow.append(style, cover)

  function setIcon(set: IconSet): void {
    if (set === iconSet) return
    iconSet = set
    const next = createIcon(set)
    icon.replaceWith(next)
    icon = next
  }

  function raise(): void {
    if (!host.isConnected) (document.documentElement ?? document).append(host)
    try {
      if (host.open) host.close()
      host.showModal()
    } catch {
      // Not an HTML document any more (document.open), or not fully active:
      // the fixed, max z-index host still covers the page.
    }
  }
  // Escape would close a modal dialog: refuse, and put it back if the
  // browser closes it anyway (repeated Escape without user activation).
  host.addEventListener('cancel', (event) => event.preventDefault())
  host.addEventListener('close', () => {
    if (state === 'covered' && !host.open) raise()
  })

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
    // The <title> Nightstand created goes, unless the page has since set a
    // title of its own (the setter wrote it into that same element).
    if (ownTitle && !pageTitle) ownTitle.remove()
    else if (pageTitle !== null && document.title === neutralTitle) document.title = pageTitle
    ownTitle = null
    pageTitle = null
  }

  // While covered: keep the title masked and the cover attached, whatever
  // the page (or its parser) does to the document. A dialog of the page's
  // that opens raises the cover too: browsers without `toggle` events for
  // dialogs (Chrome before 132) would otherwise leave it on top.
  const watcher = new MutationObserver((records) => {
    if (state !== 'covered') return
    const pageDialogOpened = records.some(
      ({type, target}) => type === 'attributes' && target !== host && target instanceof HTMLDialogElement && target.open
    )
    if (!host.isConnected || pageDialogOpened) raise()
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
    watcher.observe(document, {childList: true, subtree: true, characterData: true, attributeFilter: ['open']})
    release()
    if (report) void send({type: 'pageCovered'})
  }

  function uncover(): void {
    watcher.disconnect()
    // Its `close` event comes later, when `state` no longer says covered.
    if (host.open) host.close()
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
    const {prefs, index, icon: toolbarIcon} = await loadPageConfig()
    setIcon(toolbarIcon)
    // No vault yet, or a damaged table: nothing is protected.
    return {cover: prefs.cover, matcher: index ? createMatcher(index) : null}
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
   * Why the page decides (again):
   * - `load`: the page loaded, or the background saw its URL change. Entering
   *   a protected page asks whether this tab was already shown (a link
   *   followed from a shown page stays shown); a page that had already
   *   decided follows the background's record of the tab.
   * - `release`: preferences or the list changed while the page is open.
   *   Never covers; only uncovers a page that is no longer protected.
   * - `activate`: a prerendered page became the tab's page.
   * - `restore`: the page came back from the back/forward cache, where it
   *   heard of no change; the tab may have been shown on another page since.
   */
  type Reason = 'load' | 'release' | 'activate' | 'restore'

  /** Decides for the current URL. Every path that uncovers goes through here. */
  async function evaluate(reason: Reason): Promise<void> {
    // Nothing to release on a page that isn't covered or shown, and only a
    // page that covered itself while prerendering has anything to activate.
    if (reason === 'release' && state !== 'covered' && state !== 'shown') return
    if (reason === 'activate' && state !== 'covered') return
    let local: boolean | null
    try {
      local = await matchHere()
    } catch (error) {
      // Couldn't check here: the background decides.
      console.error(error)
      local = null
    }
    if (local === false) {
      off()
      return
    }
    if (local === true && reason === 'release') return
    const settled = state === 'covered' || state === 'shown'
    const reply = await send({type: 'pageQuery'})
    // Only a clear "not protected" uncovers a page this script couldn't
    // check: no answer (or one the background couldn't give) keeps it covered.
    if (local === null && reply?.inside === false) {
      off()
      return
    }
    switch (reason) {
      case 'release':
        return
      case 'load':
        if (settled) reconcile(reply)
        else settle(reply)
        return
      case 'activate':
        // Unless "Show page" was clicked while the answer was on its way.
        if (state === 'covered') settle(reply)
        return
      case 'restore':
        reconcile(reply)
    }
  }

  /**
   * Brings a page that had already decided in line with the background,
   * which may have recorded the tab as covered (and muted it) meanwhile: the
   * tab left protected pages and came back, by the history API or from the
   * back/forward cache. Still covered, or no longer shown in this tab:
   * covered, and reported so the background mutes the tab again.
   */
  function reconcile(reply: Partial<PageReply> | undefined): void {
    if (state === 'covered' || (state === 'shown' && (reply?.shown !== true || document.visibilityState !== 'visible'))) {
      coverPage(true)
    }
  }

  /**
   * Covers or shows a protected page that has just loaded (or was just
   * activated). Covering is reported so the background mutes the tab even
   * when it saw no URL change (a reload after the site was added). A
   * prerendered page only covers itself and says nothing: it isn't in the
   * tab yet, whose state is the page on screen. It decides again when shown.
   */
  function settle(reply: Partial<PageReply> | undefined): void {
    if (isPrerendering()) coverPage(false)
    else if (reply?.shown === true && document.visibilityState === 'visible') show(false)
    else coverPage(true)
  }

  // One evaluation at a time: a URL change can arrive while the first is running.
  let pending: Promise<void> = Promise.resolve()
  const queueEvaluate = (reason: Reason) => {
    pending = pending.then(() => evaluate(reason)).catch(console.error)
  }

  // A plain-http page that got no answer while prerendering covered itself
  // without knowing; it asks again once it is the tab's page.
  const onActivated = () => queueEvaluate('activate')
  if (isPrerendering()) document.addEventListener('prerenderingchange', onActivated, {once: true})

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
    if (event.persisted && (state === 'covered' || state === 'shown')) queueEvaluate('restore')
  }
  document.addEventListener('visibilitychange', onVisibility)
  window.addEventListener('pagehide', onPageHide)
  window.addEventListener('pageshow', onPageShow)

  const onNotice = (message: unknown) => {
    if (!isPageNotice(message)) return
    if (message.type === 'cover') {
      if (state === 'shown') coverPage(false)
    } else {
      queueEvaluate('load')
    }
  }
  chrome.runtime.onMessage.addListener(onNotice)

  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return
    const links = changes[STORAGE_KEYS.links]
    if (links) setIcon(parseDecoyConfig(links.newValue).icon)
    if (STORAGE_KEYS.index in changes || STORAGE_KEYS.prefs in changes) queueEvaluate('release')
  }
  chrome.storage.onChanged.addListener(onStorage)

  queueEvaluate('load')

  return () => {
    off()
    clearTimeout(idleTimer)
    document.removeEventListener('toggle', onTopLayer, true)
    document.removeEventListener('fullscreenchange', onTopLayer, true)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    document.removeEventListener('prerenderingchange', onActivated)
    for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, {capture: true})
    chrome.runtime.onMessage.removeListener(onNotice)
    chrome.storage.onChanged.removeListener(onStorage)
  }
}
