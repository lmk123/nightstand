// Page script: runs at document_start in the top frame of every http(s) page,
// but only while covering is on. The background registers it then (built
// from scripts/cover.ts; see background/page-script.ts), so its all-sites
// host permission stays optional.
//
// On a protected page it draws an opaque cover over everything and gives the
// tab a neutral title until the user clicks "Show"; the background keeps the
// tab muted until then. A shown page is covered again when the mouse leaves
// it, when its tab is hidden, when the browser window loses focus (the
// background says so) or after the chosen idle time (a minute by default)
// without input on the page, unless its tab is playing sound.
//
// It only reads the hashed match table, the cover/mute/idle preferences and,
// on a page it covers, the plaintext decoy config `links` for its toolbar
// icon (shown on the button, so the user sees what covered the page), never
// the vault, and sends nothing anywhere except "shown"/"covered" (and "is it
// playing?") for its own tab, with the page's own address, to the
// background. On any other page it removes its pre-load hiding as soon as
// the lookup answers and then stays idle.
import {createMatcher, defaultPrefs, parseDecoyConfig, parsePrefs, type IconSet, type UrlMatcher} from '@nightstand/core'
import {t} from '@/platform/i18n'
import {isPageNotice, type PageReply, type PageRequest, type PageRequestBody} from '@/platform/messages'
import {loadLinks, loadPrefsAndIndex, STORAGE_KEYS} from '@/platform/storage'
import {isChromiumLike} from '@/lib/browser'
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

/** Holds the page invisible while it decides (see `main`). */
const HOLD_CSS = 'html{opacity:0!important}'

/**
 * On the cover while it is up: the page's own title (which the page has
 * anyway), for the copy that takes over after an update (see `Leftovers`).
 */
const TITLE_ATTR = 'data-title'

/**
 * Dispatched on the document by a copy as it starts: a copy cut off by an
 * update steps back (a live one ignores it, so a page dispatching it can't
 * stop the cover). Keep the name across builds.
 */
const RETIRE_EVENT = 'cover-step-back'

const SHADOW_CSS = `
.cover {
  position: fixed; inset: 0; display: grid; place-items: center;
  background: #f4f4f5; color: #3f3f46; color-scheme: light dark;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
}
/* Same CJK fonts as the popup (globals.css), so the label's glyph shapes follow
   the catalog, not the page's language. */
.cover:lang(zh-CN) { font-family: -apple-system, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", system-ui, sans-serif; }
.cover:lang(zh-TW) { font-family: -apple-system, "Segoe UI", "PingFang TC", "Microsoft JhengHei", "Microsoft YaHei", system-ui, sans-serif; }
.cover:lang(ja) { font-family: -apple-system, "Segoe UI", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic UI", "Meiryo", system-ui, sans-serif; }
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

/**
 * The background's answer, or undefined when there was none. Carries the
 * page's address now: after a history API change, the background only knows
 * the one the page loaded at.
 */
function send(request: PageRequestBody): Promise<Partial<PageReply> | undefined> {
  try {
    const message: PageRequest = {...request, url: location.href}
    return chrome.runtime.sendMessage(message).catch(() => undefined)
  } catch {
    // Extension updated or removed since this page loaded.
    return Promise.resolve(undefined)
  }
}

/** Chrome is preparing this page before the user goes to it (speculation rules). */
function isPrerendering(): boolean {
  return (document as Document & {prerendering?: boolean}).prerendering === true
}

/**
 * A cover drawn by a copy of this script (this one, one cut off by an
 * extension update, or one from 0.3.0 and before, which drew the same).
 */
function isCover(node: unknown): node is HTMLDialogElement {
  return node instanceof HTMLDialogElement && node.getAttribute('style') === HOST_STYLE
}

/**
 * The extension was updated or removed since this copy started: its
 * extension APIs are dead, though its DOM listeners still run.
 */
function isCutOff(): boolean {
  try {
    return chrome.runtime?.id === undefined
  } catch {
    return true
  }
}

/**
 * What a copy cut off from the extension left in the page, once it stepped
 * back (see `RETIRE_EVENT`) or was destroyed (Firefox, on an update): its
 * cover or its hold kept the page out of sight. `title`: it was covered,
 * with its neutral title (`neutral`, which another build or browser language
 * may word differently) still on the tab; `page` is the page's own title to
 * restore once the page is shown.
 */
interface Leftovers {
  title?: {page: string; neutral: string}
}

/**
 * Starts the page script; false where it doesn't run (and nothing was done).
 * `scripts/cover.ts` starts it once per page: on load (the registration) or
 * when injected into a page already open. A copy that an extension update
 * cut off may still run in the page (Chromium gives the new copy another
 * global, so they can't see each other): it is told to step back, and the
 * page it kept out of sight stays so, covered again in this same task under
 * the title it left masked.
 */
export default function main(): boolean {
  if (window.top !== window) return false
  const firstRoot = document.documentElement
  if (!(firstRoot instanceof HTMLElement)) return false
  // A cover from 0.3.0 and before (no TITLE_ATTR): on Chromium the copy that
  // drew it still runs after the update and can't be told to step back.
  // Starting beside it would draw a second cover, so this page stays as that
  // copy keeps it until it loads again. On Firefox that copy is gone.
  if (isChromiumLike && [...firstRoot.children].some((child) => isCover(child) && !child.hasAttribute(TITLE_ATTR))) {
    return false
  }

  const neutralTitle = t('coverTitle')

  /** Removes what a copy cut off from the extension left (see `Leftovers`). */
  function takeLeftovers(): Leftovers | undefined {
    let found: Leftovers | undefined
    for (const child of [...firstRoot.children]) {
      if (isCover(child)) {
        found = {}
        const page = child.getAttribute(TITLE_ATTR)
        if (page !== null) found.title = {page, neutral: document.title}
        child.remove()
      } else if (child instanceof HTMLStyleElement && child.textContent === HOLD_CSS) {
        found ??= {}
        child.remove()
      }
    }
    return found
  }

  let state: State = 'deciding'
  // Set on stepping back: an evaluation still on its way then does nothing.
  let stopped = false

  // Hide everything until the lookup answers: on a protected page nothing may
  // paint before the cover is up. `opacity` on the root can't be undone by
  // any descendant (unlike `visibility`). The lookup is one storage read and
  // a few hashes, normally done before the first paint anyway. Injected into
  // a page that already has a body (covering just turned on, even one still
  // loading), the page may have painted: hiding it would only make every open
  // page blink, unless it takes over from a copy that kept the page out of
  // sight. Put in place at the end, once everything else is set up.
  const hold = document.createElement('style')
  hold.textContent = HOLD_CSS
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
  // Picks the catalog's CJK font stack in SHADOW_CSS; without it, Han glyph
  // shapes would follow the page's language.
  cover.lang = t('htmlLang')
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

  // The tab's icon stays: Chrome would cache a stand-in, and the entry could
  // never capture the real icon again.
  // Tab title: the page's own while shown, a neutral one while covered.
  let pageTitle: string | null = null
  let ownTitle: HTMLTitleElement | null = null

  function setPageTitle(title: string | null): void {
    pageTitle = title
    if (title === null) host.removeAttribute(TITLE_ATTR)
    else host.setAttribute(TITLE_ATTR, title)
  }

  function maskTitle(): void {
    const current = document.title
    if (current === neutralTitle) return
    setPageTitle(current)
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
    setPageTitle(null)
  }

  // While covered: keep the title masked and the cover attached, whatever
  // the page (or its parser) does to the document. A dialog of the page's
  // that opens raises the cover too: browsers without `toggle` events for
  // dialogs (Chrome before 132) would otherwise leave it on top.
  const watcher = new MutationObserver((records) => {
    if (state !== 'covered') return
    const pageDialogOpened = records.some(
      ({type, target}) => type === 'attributes' && target instanceof HTMLDialogElement && target.open && !isCover(target)
    )
    if (!host.isConnected || pageDialogOpened) raise()
    maskTitle()
  })

  function onTopLayer(event: Event): void {
    // Another copy's cover (one from 0.3.0 that can't step back) is left
    // alone: raising over each other's, the two would never stop.
    if (state !== 'covered' || isCover(event.target)) return
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

  // Leaving: anything that may be a leave covers, while the page still
  // paints: a missed leave flashes the page on switching back, an extra
  // cover only costs a click. Listened to only while the page is shown.
  // The page gets no event before its tab is hidden (no `blur`, no
  // animation frame): the mouse leaving is the only warning.
  const LEAVE_EVENTS = ['mouseout', 'mouseup', 'dragleave', 'dragend'] as const

  /**
   * Outside the part of the page on screen. Client coordinates are relative
   * to the layout viewport; when zoomed in by pinching, only the visual
   * viewport (a part of it) is on screen.
   *
   * A leave may be reported on the edge itself, so the edge counts as
   * outside. A release on the edge is a click there (a window that touches
   * the screen's edge: its scrollbar, a full-screen player's controls), so
   * for `mouseup` only past the edge counts.
   */
  function isOutside({type, clientX: x, clientY: y}: MouseEvent): boolean {
    const view = window.visualViewport
    const zoomed = view !== null && view.scale > 1
    const left = zoomed ? view.offsetLeft : 0
    const top = zoomed ? view.offsetTop : 0
    const right = zoomed ? left + view.width : innerWidth
    const bottom = zoomed ? top + view.height : innerHeight
    if (type === 'mouseup') return x < left || y < top || x >= right || y >= bottom
    return x <= left || y <= top || x >= right - 1 || y >= bottom - 1
  }

  const onLeave = (event: MouseEvent) => {
    if (state !== 'shown') return
    // Moving from one element (or frame) of the page to another.
    if ((event.type === 'mouseout' || event.type === 'dragleave') && event.relatedTarget !== null) return
    // Still dragging: where the button is released decides.
    if (event.type === 'mouseout' && event.buttons !== 0) return
    if (isOutside(event)) coverPage(true)
  }

  function watchLeaving(on: boolean): void {
    for (const type of LEAVE_EVENTS) {
      if (on) window.addEventListener(type, onLeave, true)
      else window.removeEventListener(type, onLeave, true)
    }
  }

  function coverPage(report: boolean): void {
    stopIdle()
    watchLeaving(false)
    state = 'covered'
    loadIcon()
    raise()
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined)
    maskTitle()
    // Also when the page's own title is the neutral one: a cover without it
    // is taken for one from 0.3.0 (see `main`).
    if (!host.hasAttribute(TITLE_ATTR)) host.setAttribute(TITLE_ATTR, document.title)
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
    watchLeaving(true)
    if (report) void send({type: 'pageShown'})
  }

  function off(): void {
    if (state === 'covered') uncover()
    stopIdle()
    watchLeaving(false)
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
    // Plain http asks the background on purpose; no bundled SHA-256 without new
    // evidence: it was faster only on the first page after the worker stopped
    // (~25 ms, 2026-11, Chrome on macOS), and Web Crypto-only forbids it.
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
   * - `enable`: covering was turned on. A page that had decided "off" (or
   *   loaded while covering was off) decides as on load; any other, as on
   *   `release`.
   */
  type Reason = 'load' | 'release' | 'activate' | 'restore' | 'enable'

  /** Decides for the current URL. Every path that uncovers goes through here. */
  async function evaluate(why: Reason): Promise<void> {
    const reason = why === 'enable' ? (state === 'off' ? 'load' : 'release') : why
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
    if (stopped) return
    if (local === false) {
      off()
      return
    }
    if (local === true && reason === 'release') return
    const settled = state === 'covered' || state === 'shown'
    const reply = await send({type: 'pageQuery'})
    if (stopped) return
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
   * Brings a page that had already decided in line with the background:
   * the tab left protected pages and came back, by the history API or from
   * the back/forward cache, and the background, having forgotten it, records
   * it as covered (and mutes it) on the `pageQuery` this answers. Still
   * covered, or no longer shown in this tab: covered.
   */
  function reconcile(reply: Partial<PageReply> | undefined): void {
    if (state === 'covered' || (state === 'shown' && (reply?.shown !== true || document.visibilityState !== 'visible'))) {
      coverPage(true)
    }
  }

  /**
   * Covers or shows a protected page that has just loaded (or was just
   * activated). The background has already recorded and muted the tab on
   * the `pageQuery` this answers, unless it couldn't tell (the tab's address
   * hadn't caught up): covering is reported for that case. A prerendered
   * page only covers itself and says nothing: it isn't in the tab yet, whose
   * state is the page on screen. It decides again when shown.
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

  const onNotice = (message: unknown, _sender: unknown, respond: () => void) => {
    if (!isPageNotice(message)) return
    // An answer tells the background a page script is here (see its `notify`).
    respond()
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
    // Only the list and turning covering on or off make a page decide again;
    // the idle time is taken as it is, without matching on every open page.
    const prefs = changes[STORAGE_KEYS.prefs]
    if (prefs) setIdleMs(parsePrefs(prefs.newValue).idleMinutes * MINUTE_MS)
    const cover = prefs && parsePrefs(prefs.newValue).cover
    if (prefs && parsePrefs(prefs.oldValue).cover !== cover) queueEvaluate(cover ? 'enable' : 'release')
    else if (STORAGE_KEYS.index in changes) queueEvaluate('release')
  }
  chrome.storage.onChanged.addListener(onStorage)

  const onRetire = () => {
    if (isCutOff()) retire()
  }

  /**
   * Stops reacting to anything, leaving the cover, the hold and the masked
   * title in place for the copy that takes over (see `Leftovers`).
   */
  function retire(): void {
    stopped = true
    state = 'off'
    watcher.disconnect()
    stopIdle()
    watchLeaving(false)
    document.removeEventListener(RETIRE_EVENT, onRetire)
    document.removeEventListener('toggle', onTopLayer, true)
    document.removeEventListener('fullscreenchange', onTopLayer, true)
    document.removeEventListener('visibilitychange', onVisibility)
    window.removeEventListener('pagehide', onPageHide)
    window.removeEventListener('pageshow', onPageShow)
    document.removeEventListener('prerenderingchange', onActivated)
    for (const type of ACTIVITY_EVENTS) window.removeEventListener(type, onActivity, {capture: true})
    try {
      chrome.runtime.onMessage.removeListener(onNotice)
      chrome.storage.onChanged.removeListener(onStorage)
    } catch {
      // Cut off from the extension: nothing to remove from.
    }
  }

  // Everything is set up: only now take over, so nothing that fails above
  // leaves the page to no copy at all.
  document.dispatchEvent(new Event(RETIRE_EVENT))
  const left = takeLeftovers()
  if (left || document.body === null) firstRoot.append(hold)
  // It was covered: cover again in this same task, so neither the page nor
  // its title shows in between. The page then decides as on load.
  if (left?.title) {
    const {page, neutral} = left.title
    setPageTitle(page)
    // Masked with another wording: `maskTitle` would take it for the page's own.
    if (neutral !== neutralTitle && document.title === neutral) document.title = neutralTitle
    coverPage(false)
  }
  document.addEventListener(RETIRE_EVENT, onRetire)

  queueEvaluate('load')
  return true
}
