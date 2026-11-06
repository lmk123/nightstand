import {useCallback, useEffect, useState} from 'react'
import type {VaultEntry} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {
  findBookmarksFor,
  hasBookmarksPermission,
  removeBookmarks,
  requestBookmarksPermission
} from '@/platform/bookmarks'
import {t} from '@/platform/i18n'

type State =
  | {name: 'checking'}
  | {name: 'needPermission'}
  | {name: 'none'}
  | {name: 'found'; ids: string[]}
  | {name: 'removed'; count: number}

/**
 * Looks for browser bookmarks of a protected site (they would keep showing up
 * in address-bar suggestions) and offers to delete them.
 *
 * If the browser's permission prompt closes the popup, nothing is lost: the
 * user reopens, unlocks, and presses "check bookmarks" again (also available
 * in the entry's edit form). No temporary state is kept anywhere.
 */
export function BookmarkCheck({entry, onDismiss}: {entry: VaultEntry; onDismiss?: () => void}) {
  const [state, setState] = useState<State>({name: 'checking'})

  const check = useCallback(async () => {
    const found = await findBookmarksFor(entry)
    setState(found.length ? {name: 'found', ids: found.map((b) => b.id)} : {name: 'none'})
  }, [entry])

  useEffect(() => {
    hasBookmarksPermission().then(
      (granted) => (granted ? check() : setState({name: 'needPermission'})),
      () => setState({name: 'needPermission'})
    )
  }, [check])

  async function grantAndCheck() {
    if (await requestBookmarksPermission()) await check()
  }

  async function remove(ids: string[]) {
    await removeBookmarks(ids)
    setState({name: 'removed', count: ids.length})
  }

  if (state.name === 'checking') return null
  if (state.name === 'none' && onDismiss) return null

  return (
    <div className="bg-accent text-accent-foreground grid gap-2 rounded-md p-3 text-xs leading-relaxed">
      {state.name === 'needPermission' && (
        <>
          <p>{t('bookmarkCheckIntro')}</p>
          <div className="flex gap-2">
            <Button size="xs" onClick={grantAndCheck}>
              {t('bookmarkCheck')}
            </Button>
            {onDismiss && (
              <Button size="xs" variant="ghost" onClick={onDismiss}>
                {t('dismiss')}
              </Button>
            )}
          </div>
        </>
      )}
      {state.name === 'none' && <p>{t('bookmarkNone')}</p>}
      {state.name === 'found' && (
        <>
          <p>{t('bookmarkFound', String(state.ids.length))}</p>
          <div className="flex gap-2">
            <Button size="xs" onClick={() => remove(state.ids)}>
              {t('bookmarkRemove')}
            </Button>
            {onDismiss && (
              <Button size="xs" variant="ghost" onClick={onDismiss}>
                {t('bookmarkKeep')}
              </Button>
            )}
          </div>
        </>
      )}
      {state.name === 'removed' && (
        <div className="flex items-center gap-2">
          <p className="flex-1">{t('bookmarkRemoved', String(state.count))}</p>
          {onDismiss && (
            <Button size="xs" variant="ghost" onClick={onDismiss}>
              {t('dismiss')}
            </Button>
          )}
        </div>
      )}
    </div>
  )
}
