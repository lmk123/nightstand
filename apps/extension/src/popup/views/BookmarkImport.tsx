import {useEffect, useMemo, useState} from 'react'
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
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group'
import {
  bookmarkRows,
  hasBookmarksPermission,
  removeBookmarks,
  requestBookmarksPermission,
  type BookmarkRow
} from '@/platform/bookmarks'
import {t} from '@/platform/i18n'
import {Field} from '../components/Field'
import {Header} from '../components/Header'
import {HelpLink} from '../help'

/**
 * Move sites from browser bookmarks into Nightstand. Optionally deletes the
 * original bookmarks; the caller purges history for everything imported.
 *
 * If the permission prompt closes the popup (it does on Chrome), the user
 * reopens, unlocks and comes back here — nothing depends on popup state.
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
  const [granted, setGranted] = useState<boolean | null>(null)
  const [rows, setRows] = useState<BookmarkRow[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [matchMode, setMatchMode] = useState<MatchMode>('site')
  const [removeOriginals, setRemoveOriginals] = useState(true)
  const [done, setDone] = useState<number | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    hasBookmarksPermission().then(setGranted, () => setGranted(false))
  }, [])

  useEffect(() => {
    if (granted) bookmarkRows((url) => hostOf(url) !== null).then(setRows, console.error)
  }, [granted, done])

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
    try {
      let next = data
      const added: VaultEntry[] = []
      const now = Date.now()
      for (const id of selected) {
        const row = byId.get(id)
        if (!row?.url) continue
        const entry = createEntry({url: row.url, title: row.title, matchMode}, now)
        if (findDuplicate(next.entries, entry)) continue
        next = addEntry(next, entry)
        added.push(entry)
      }
      await onImport(next, added)
      if (removeOriginals) await removeBookmarks([...selected])
      setSelected(new Set())
      setDone(added.length)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-h-[580px] flex-col">
      <Header title={t('bmImportTitle')} onBack={onBack} />
      {granted === false && (
        <div className="grid gap-2 p-3 text-xs leading-relaxed">
          <p>{t('bmImportPermission')}</p>
          <Button
            size="sm"
            className="justify-self-start"
            onClick={async () => setGranted(await requestBookmarksPermission())}
          >
            {t('bmImportGrant')}
          </Button>
        </div>
      )}
      {granted && (
        <>
          <ul className="min-h-0 flex-1 overflow-y-auto p-2">
            {rows.length === 0 && <li className="text-muted-foreground p-4 text-center text-sm">{t('bmImportEmpty')}</li>}
            {rows.map((row) => {
              const count = row.urlIds.filter((id) => selected.has(id)).length
              const checked = count === row.urlIds.length
              return (
                <li key={row.id} style={{paddingLeft: `${row.depth * 12}px`}}>
                  <Label className="hover:bg-muted flex items-center gap-2 rounded-md px-1 py-1 text-sm font-normal">
                    <Checkbox
                      checked={checked}
                      indeterminate={count > 0 && !checked}
                      onCheckedChange={(v) => toggle(row, v === true)}
                    />
                    <span className={row.url ? 'min-w-0 flex-1 truncate' : 'min-w-0 flex-1 truncate font-medium'}>
                      {row.title || t('bmUntitledFolder')}
                    </span>
                    {row.url && <span className="text-muted-foreground max-w-28 truncate text-xs">{hostOf(row.url)}</span>}
                  </Label>
                </li>
              )
            })}
          </ul>
          <div className="grid gap-3 border-t p-3">
            <Field label={t('fieldMatchMode')}>
              <RadioGroup value={matchMode} onValueChange={(v) => setMatchMode(v as MatchMode)} className="flex gap-4">
                <Label className="flex items-center gap-2 text-xs font-normal">
                  <RadioGroupItem value="site" />
                  {t('matchSiteShort')}
                </Label>
                <Label className="flex items-center gap-2 text-xs font-normal">
                  <RadioGroupItem value="exact" />
                  {t('matchExact')}
                </Label>
              </RadioGroup>
              <HelpLink topic="matchMode" label="faqMatchLink" />
            </Field>
            <Label className="flex items-center gap-2 text-xs font-normal">
              <Checkbox checked={removeOriginals} onCheckedChange={(v) => setRemoveOriginals(v === true)} />
              {t('bmRemoveOriginals')}
            </Label>
            {done !== null && <p className="bg-accent text-accent-foreground rounded-md p-2 text-xs">{t('bmImported', String(done))}</p>}
            <Button size="sm" disabled={busy || selected.size === 0} onClick={runImport}>
              {busy ? t('working') : t('bmImportButton', String(selected.size))}
            </Button>
          </div>
        </>
      )}
    </div>
  )
}
