import {useCallback, useEffect, useRef, useState} from 'react'
import type {Prefs} from '@nightstand/core'
import {requestPageAccess, watchPageAccess} from '@/platform/page-access'
import {loadPrefs, updatePrefs, watchPrefs} from '@/platform/storage'

/**
 * The plaintext preferences (outside the vault: the page script reads them
 * while locked), shown live: the background changes `cover` too, and the
 * header toggle and the settings view may both be on screen over time.
 * Changes build on `latest`, not a render's `prefs` (a permission answer comes
 * back late), and write only their own fields.
 */
export function usePrefs(): {
  prefs: Prefs | null
  /** The first read failed and nothing has been written since. */
  failed: boolean
  changePrefs: (patch: Partial<Prefs>) => void
  changeCover: (cover: boolean) => void
  /**
   * Call straight from a click, like `changeCover`. With `confirmOn`, turning
   * on calls it instead, with the current prefs and a `turnOn` to call
   * straight from the confirming click.
   */
  toggleCover: (confirmOn?: (turnOn: () => void, current: Prefs) => void) => void
} {
  const [prefs, setPrefs] = useState<Prefs | null>(null)
  const [failed, setFailed] = useState(false)
  const latest = useRef<Prefs | null>(null)
  const show = useCallback((next: Prefs) => {
    latest.current = next
    setPrefs(next)
  }, [])
  useEffect(() => {
    // A change seen before the first read returns is newer than that read.
    let changed = false
    const stop = watchPrefs((next) => {
      changed = true
      show(next)
    })
    loadPrefs().then(
      (next) => {
        if (!changed) show(next)
      },
      (error: unknown) => {
        console.error(error)
        setFailed(true)
      }
    )
    return stop
  }, [show])
  const changePrefs = (patch: Partial<Prefs>) => {
    if (!latest.current) return
    show({...latest.current, ...patch})
    updatePrefs(patch).catch((error: unknown) => {
      console.error(error)
      // Show what is actually stored, not a change that never landed.
      loadPrefs().then(show, console.error)
    })
  }
  // Call straight from a click. The first request prompts and closes the
  // popup (the background then turns covering on); turning off keeps the
  // permission, so later requests answer at once.
  // Clicks while a request is open are dropped: `latest` still says off until
  // it answers, so a second click would ask to turn on again, not turn off.
  const requesting = useRef(false)
  const changeCover = (cover: boolean) => {
    if (!cover) {
      changePrefs({cover})
      return
    }
    if (requesting.current) return
    requesting.current = true
    requestPageAccess()
      .then((granted) => {
        if (granted) changePrefs({cover})
      }, console.error)
      .finally(() => {
        requesting.current = false
      })
  }
  // From `latest`, not a render's `prefs`: a click may come before the last change has rendered.
  const toggleCover = (confirmOn?: (turnOn: () => void, current: Prefs) => void) => {
    const current = latest.current
    if (!current) return
    if (!current.cover && confirmOn) confirmOn(() => changeCover(true), current)
    else changeCover(!current.cover)
  }
  return {prefs, failed, changePrefs, changeCover, toggleCover}
}

/** Whether the page script's access (asked for on first turning covering on) is granted; null until known. */
export function usePageAccess(): boolean | null {
  const [access, setAccess] = useState<boolean | null>(null)
  useEffect(() => watchPageAccess(setAccess), [])
  return access
}
