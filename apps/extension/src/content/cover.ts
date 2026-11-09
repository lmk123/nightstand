// Page script: runs at document_start in the top frame of every http(s) page.
//
// On a protected page it draws an opaque cover over everything and gives the
// tab a neutral title until the user clicks "Show"; the background keeps the
// tab muted until then. A shown page is covered again when its tab is hidden,
// when the browser window loses focus (the background says so) or after the
// chosen idle time (a minute by default) without input on the page, unless
// its tab is playing sound.
//
// It only reads the hashed match table, the cover/mute/idle preferences and,
// on a page it covers, the plaintext decoy config `links` for its toolbar
// icon (shown on the button, so the user sees what covered the page), never
// the vault, and sends nothing anywhere except "shown"/"covered" (and "is it
// playing?") for its own tab to the background. On any other page it
// removes its pre-load hiding as soon as the lookup answers and then stays
// idle.
import {createMatcher, defaultPrefs, parseDecoyConfig, parsePrefs, type IconSet, type UrlMatcher} from '@nightstand/core'
import {t} from '@/platform/i18n'
import {isPageNotice, type PageReply, type PageRequest} from '@/platform/messages'
import {loadLinks, loadPrefsAndIndex, STORAGE_KEYS} from '@/platform/storage'
import {createIcon} from './cover-icons'

/** The unit of the idle time setting. */
const MINUTE_MS = 60_000

/**
 * How long a tab that went quiet must stay so before an idle page covers.
 * `audible` turns false after about two seconds of silence of any kind, not
 * only a pause: buffering, a silent scene, the gap between two tracks.
 */
const QUIET_GRACE_MS = 10_000

/**
 * While the tab plays sound, the background says when it goes quiet; in case
 * that notice never comes, the page asks again this often. Long, so a long
 * video doesn't wake the worker every minute.
 */
const PLAYING_RECHECK_MS = 10 * MINUTE_MS

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
.icon { display: block; width: 16px; height: 16px; flex: none; }
button.no-icon { padding: 6px 14px; }
button.no-icon .icon { display: none; }
svg { display: block; width: 100%; height: 100%; }
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
  // Holds the icon's place, so the label doesn't move when the icon arrives.
  const iconBox = document.createElement('span')
  iconBox.className = 'icon'
  const label = document.createElement('span')
  label.textContent = t('coverShow')
  button.append(iconBox, label)
  button.addEventListener('click', () => show(true))
  cover.append(button)
  shadow.append(style, cover)

  // The icon is read only when the page covers (most pages never do), off
  // the path that holds every page invisible. An icon from a storage change
  // that arrives while the read is on its way wins over the read. A failed
  // read drops the empty slot (so the label sits centred) and is tried again
  // the next time the page covers.
  let iconSet: IconSet | null = null
  let iconLoading = false

  function setIcon(set: IconSet): void {
    button.classList.remove('no-icon')
    if (set === iconSet) return
    iconSet = set
    iconBox.replaceChildren(createIcon(set))
  }

  function loadIcon(): void {
    if (iconSet || iconLoading) return
    iconLoading = true
    loadLinks()
      .then(
        ({icon}) => {
          if (!iconSet) setIcon(icon)
        },
        (error: unknown) => {
          if (!iconSet) button.classList.add('no-icon')
          console.error(error)
        }
      )
      .finally(() => {
        iconLoading = false
      })
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

  // Idle: a shown page is covered again after `idleMs` without input. Sound
  // means someone is watching or listening (as with a screen saver): once
  // the time is up the page asks the background whether its tab is playing,
  // and while it is, waits for the background to say the tab went quiet;
  // if it is still quiet `QUIET_GRACE_MS` later and there was no input
  // meanwhile, the page covers. In case that notice never comes, it asks
  // again every `PLAYING_RECHECK_MS`.
  let idleMs = defaultPrefs().idleMinutes * MINUTE_MS
  let lastInput = Date.now()
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  // Bumped whenever the wait stops or restarts, so an answer about playing
  // that arrives afterwards is dropped.
  let idleRun = 0
  const onActivity = () => {
    lastInput = Date.now()
  }
  function waitIdle(ms: number): void {
    idleTimer = setTimeout(() => void checkIdle(), ms)
  }
  /** Waits out what is left of the idle time; once it is up, asks about sound. */
  async function checkIdle(): Promise<void> {
    idleTimer = undefined
    if (state !== 'shown') return
    const left = lastInput + idleMs - Date.now()
    if (left > 0) {
      waitIdle(left)
      return
    }
    const run = idleRun
    const reply = await send({type: 'pagePlaying'})
    if (run !== idleRun || state !== 'shown') return
    // No answer (extension updated, background failed): not playing.
    if (reply?.playing === true) waitIdle(PLAYING_RECHECK_MS)
    else if (Date.now() - lastInput >= idleMs) coverPage(true)
    else void checkIdle()
  }
  /**
   * The background saw the tab go quiet. Whatever the page was waiting for
   * (the idle time, the sound, an answer that may say "playing" from just
   * before), it now waits at least the grace period and then checks again:
   * sound that comes back by then keeps the page shown.
   */
  function onQuiet(): void {
    if (state !== 'shown') return
    stopIdle()
    waitIdle(Math.max(QUIET_GRACE_MS, lastInput + idleMs - Date.now()))
  }
  function stopIdle(): void {
    idleRun++
    clearTimeout(idleTimer)
    idleTimer = undefined
  }
  function startIdle(): void {
    lastInput = Date.now()
    stopIdle()
    waitIdle(idleMs)
  }
  /** The idle time changed: a shown page waits by the new one from its last input. */
  function setIdleMs(ms: number): void {
    if (ms === idleMs) return
    idleMs = ms
    if (state !== 'shown') return
    stopIdle()
    void checkIdle()
  }
  for (const type of ACTIVITY_EVENTS) window.addEventListener(type, onActivity, {capture: true, passive: true})

  function coverPage(report: boolean): void {
    stopIdle()
    state = 'covered'
    loadIcon()
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
    stopIdle()
    state = 'off'
    release()
  }

  async function lookup(): Promise<{cover: boolean; matcher: UrlMatcher | null}> {
    const {prefs, index} = await loadPrefsAndIndex()
    setIdleMs(prefs.idleMinutes * MINUTE_MS)
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
   * - `release`: the list changed, or covering was turned on or off, while
   *   the page is open.
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
    } else if (message.type === 'quiet') {
      onQuiet()
    } else {
      queueEvaluate('load')
    }
  }
  chrome.runtime.onMessage.addListener(onNotice)

  const onStorage = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
    if (area !== 'local') return
    const links = changes[STORAGE_KEYS.links]
    // Only once the icon is shown or on its way; otherwise the next read gets it.
    if (links && (iconSet || iconLoading)) setIcon(parseDecoyConfig(links.newValue).icon)
    // Only the list and turning covering off can release a page; the idle
    // time is taken as it is, without matching again on every open page.
    const prefs = changes[STORAGE_KEYS.prefs]
    if (prefs) setIdleMs(parsePrefs(prefs.newValue).idleMinutes * MINUTE_MS)
    if (STORAGE_KEYS.index in changes || (prefs && parsePrefs(prefs.oldValue).cover !== parsePrefs(prefs.newValue).cover)) {
      queueEvaluate('release')
    }
  }
  chrome.storage.onChanged.addListener(onStorage)

  queueEvaluate('load')

  return () => {
    off()
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
