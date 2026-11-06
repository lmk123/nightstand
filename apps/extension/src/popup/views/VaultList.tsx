import {useMemo, useState} from 'react'
import {Lock, Pencil, Plus, Settings, SquarePlus} from 'lucide-react'
import {searchEntries, type VaultEntry} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {t} from '@/platform/i18n'
import {LetterAvatar} from '../components/Avatar'
import {Header} from '../components/Header'
import {entryTitle} from '../title'

export function VaultList({
  entries,
  notice,
  onOpen,
  onEdit,
  onAddCurrent,
  onAddManual,
  onSettings,
  onLock
}: {
  entries: VaultEntry[]
  notice?: React.ReactNode
  onOpen: (entry: VaultEntry) => void
  onEdit: (entry: VaultEntry) => void
  onAddCurrent: () => void
  onAddManual: () => void
  onSettings: () => void
  onLock: () => void
}) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => searchEntries(entries, query), [entries, query])

  return (
    <div className="flex max-h-[580px] flex-col">
      <Header
        title={t('vaultTitle')}
        actions={
          <>
            <Button variant="ghost" size="icon-sm" onClick={onSettings} aria-label={t('settings')} title={t('settings')}>
              <Settings />
            </Button>
            <Button variant="ghost" size="icon-sm" onClick={onLock} aria-label={t('lock')} title={t('lock')}>
              <Lock />
            </Button>
          </>
        }
      />
      {notice}
      {entries.length > 0 && (
        <div className="p-2 pb-0">
          <Input
            autoFocus
            placeholder={t('vaultSearchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && visible[0]) onOpen(visible[0])
            }}
          />
        </div>
      )}
      <ul className="min-h-0 flex-1 overflow-y-auto p-1">
        {entries.length === 0 && <li className="text-muted-foreground p-4 text-center text-sm">{t('vaultEmpty')}</li>}
        {entries.length > 0 && visible.length === 0 && (
          <li className="text-muted-foreground p-4 text-center text-sm">{t('noMatches')}</li>
        )}
        {visible.map((entry) => (
          <li key={entry.id} className="group hover:bg-muted flex items-center gap-1 rounded-md pr-1">
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => onOpen(entry)}
            >
              {/* Title only: some domains are revealing on their own, so the
                  list never shows the URL or the extra hosts, not even in a tooltip. */}
              <LetterAvatar text={entryTitle(entry)} />
              <span className="min-w-0 flex-1 truncate text-sm">{entryTitle(entry)}</span>
            </button>
            <Button
              variant="ghost"
              size="icon-xs"
              className="opacity-0 group-hover:opacity-100 focus-visible:opacity-100"
              onClick={() => onEdit(entry)}
              aria-label={t('edit')}
              title={t('edit')}
            >
              <Pencil />
            </Button>
          </li>
        ))}
      </ul>
      <footer className="flex gap-2 border-t p-2">
        <Button variant="secondary" size="sm" className="flex-1" onClick={onAddCurrent}>
          <SquarePlus />
          {t('addCurrentTab')}
        </Button>
        <Button variant="secondary" size="sm" className="flex-1" onClick={onAddManual}>
          <Plus />
          {t('addManually')}
        </Button>
      </footer>
    </div>
  )
}
