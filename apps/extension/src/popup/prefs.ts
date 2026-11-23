import {useCallback, useEffect, useRef, useState} from 'react'
import type {Prefs} from '@nightstand/core'
import {requestPageAccess} from '@/platform/page-access'
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
  /** Call straight from a click, like `changeCover`. */
  toggleCover: () => void
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
  // permission, so later requests answer at once. See cover-behavior.md.
  const changeCover = (cover: boolean) => {
    if (!cover) {
      changePrefs({cover})
      return
    }
    requestPageAccess().then((granted) => {
      if (granted) changePrefs({cover})
    }, console.error)
  }
  // From `latest`, not a render's `prefs`: a click may come before the last change has rendered.
  const toggleCover = () => {
    if (latest.current) changeCover(!latest.current.cover)
  }
  return {prefs, failed, changePrefs, changeCover, toggleCover}
}
