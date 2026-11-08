import {useEffect, useMemo, useState} from 'react'
import {Folder} from 'lucide-react'
import {cn} from 'cn'
import {
  addEntry,
  createEntry,
  findDuplicate,
  hostOf,
  type MatchMode,
  type VaultData,
  type VaultEntry
} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Label} from '@/components/ui/label'
import {mapConcurrent} from '@/lib/concurrency'
import {bookmarkRows, removeBookmarks, type BookmarkRow} from '@/platform/bookmarks'
import {withIcon} from '@/platform/favicon'
import {t} from '@/platform/i18n'
import {Segmented} from '../components/ChoiceCards'
import {Header} from '../components/Header'
import {mainButtonClass, viewClass} from '../components/styles'
import {HelpLink} from '../help'

/** Icons captured at the same time (each reads history and renders a few icons). */
const ICON_CONCURRENCY = 6

/**
 * Move sites from browser bookmarks into Nightstand. Optionally deletes the
 * original bookmarks; the caller purges history for everything imported.
 */
export function BookmarkImport({
  data,
  onImport,
  onBack
}: {
  data: VaultData
  onImport: (next: VaultData, added: VaultEntry[]) => Promise<void>
  onBack: () => void
}) {
  const [rows, setRows] = useState<BookmarkRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [matchMode, setMatchMode] = useState<MatchMode>('site')
  const [removeOriginals, setRemoveOriginals] = useState(true)
  const [done, setDone] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    bookmarkRows((url) => hostOf(url) !== null).then(setRows, console.error)
  }, [done])

  const byId = useMemo(() => new Map(rows.map((r) => [r.id, r])), [rows])

  function toggle(row: BookmarkRow, on: boolean) {
    const next = new Set(selected)
    for (const id of row.urlIds) {
      if (on) next.add(id)
      else next.delete(id)
    }
    setSelected(next)
  }

  async function runImport() {
    setBusy(true)
    setFailed(false)
    try {
      const fresh: VaultEntry[] = []
      const now = Date.now()
      for (const id of selected) {
        const row = byId.get(id)
        if (!row?.url) continue
        const entry = createEntry({url: row.url, title: row.title, matchMode}, now)
        if (findDuplicate(data.entries, entry) || findDuplicate(fresh, entry)) continue
        fresh.push(entry)
      }
      // Before the caller purges history, which takes the cached icon with it.
      // Several at once: one after another, a big folder takes long enough
      // that the popup gets closed and nothing is imported.
      const added = await mapConcurrent(fresh, ICON_CONCURRENCY, withIcon)
      await onImport(
        added.reduce((next, entry) => addEntry(next, entry), data),
        added
      )
      if (removeOriginals) await removeBookmarks([...selected])
      setSelected(new Set())
      setDone(added.length)
    } catch (error) {
      console.error(error)
      setFailed(true)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={viewClass}>
      <Header title={t('bmImportTitle')} onBack={onBack} />
      <ul className="panel mx-3 mt-3 grid grid-cols-1 min-h-0 flex-1 content-start overflow-y-auto p-1">
        {rows.length === 0 && <li className="text-muted-foreground p-4 text-center text-[13px]">{t('bmImportEmpty')}</li>}
        {rows.map((row) => {
          const count = row.urlIds.filter((id) => selected.has(id)).length
          const checked = count === row.urlIds.length
          return (
            <li key={row.id} style={{paddingLeft: `${row.depth * 20}px`}}>
              <Label
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2 font-normal',
                  row.url ? 'h-10 text-[13px]' : 'text-muted-foreground h-9 text-xs font-semibold',
                  row.url && checked ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                )}
              >
                <Checkbox
                  checked={checked}
                  indeterminate={count > 0 && !checked}
                  onCheckedChange={(v) => toggle(row, v === true)}
                />
                {!row.url && <Folder className="size-[15px] shrink-0" aria-hidden />}
                <span className="min-w-0 flex-1 truncate">
                  {row.title || (row.url ? t('untitledEntry') : t('bmUntitledFolder'))}
                </span>
              </Label>
            </li>
          )
        })}
      </ul>
      <div className="grid grid-cols-1 gap-3 p-3 pt-3.5">
        <div className="grid grid-cols-1 gap-1.5">
          <div className="flex items-center gap-2.5">
            <span className="text-subtle-foreground text-xs font-semibold">{t('fieldMatchMode')}</span>
            <div className="flex-1">
              <Segmented
                label={t('fieldMatchMode')}
                value={matchMode}
                onChange={setMatchMode}
                options={[
                  {value: 'site', label: t('matchSiteShort')},
                  {value: 'exact', label: t('matchExact')}
                ]}
              />
            </div>
          </div>
          <HelpLink topic="matchMode" label="faqMatchLink" />
        </div>
        <Label className="text-subtle-foreground flex min-h-8 items-center gap-2 text-[13px] font-normal">
          <Checkbox checked={removeOriginals} onCheckedChange={(v) => setRemoveOriginals(v === true)} />
          {t('bmRemoveOriginals')}
        </Label>
        {failed && <p className="text-destructive text-xs">{t('errSaveFailed')}</p>}
        {done !== null && <p className="bg-accent text-accent-foreground rounded-[10px] p-2.5 text-xs">{t('bmImported', String(done))}</p>}
        <Button className={mainButtonClass} disabled={busy || selected.size === 0} onClick={runImport}>
          {busy ? t('working') : t('bmImportButton', String(selected.size))}
        </Button>
      </div>
    </div>
  )
}
