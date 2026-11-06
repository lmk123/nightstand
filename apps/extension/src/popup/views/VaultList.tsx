import {useEffect, useMemo, useRef, useState} from 'react'
import {ExternalLink, Lock, Pencil, Plus, Settings, SquarePlus} from 'lucide-react'
import {searchEntries, type VaultEntry} from '@nightstand/core'
import {cn} from 'cn'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {t} from '@/platform/i18n'
import {SiteAvatar} from '../components/Avatar'
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
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const visible = useMemo(() => searchEntries(entries, query), [entries, query])
  // Opening a site is never a single click: a stray click on a shared screen
  // must not load it. A click (or the arrow keys) only selects a row; its
  // "Open" button or Enter opens it. While searching, the first match is
  // selected, so Enter opens exactly the row that is highlighted.
  const selected = visible.find((e) => e.id === selectedId) ?? (query.trim() ? visible[0] : undefined)
  const listRef = useRef<HTMLUListElement>(null)

  useEffect(() => {
    listRef.current?.querySelector('[aria-current="true"]')?.scrollIntoView({block: 'nearest'})
  }, [selected])

  function moveSelection(step: 1 | -1) {
    if (visible.length === 0) return
    const at = selected ? visible.indexOf(selected) : -1
    const next = at === -1 ? (step === 1 ? 0 : visible.length - 1) : (at + step + visible.length) % visible.length
    setSelectedId(visible[next]!.id)
  }

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
            onChange={(e) => {
              setQuery(e.target.value)
              setSelectedId(null)
            }}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault()
                moveSelection(e.key === 'ArrowDown' ? 1 : -1)
              } else if (e.key === 'Enter' && selected) {
                onOpen(selected)
              }
            }}
          />
        </div>
      )}
      <ul ref={listRef} className="min-h-0 flex-1 overflow-y-auto p-1">
        {entries.length === 0 && <li className="text-muted-foreground p-4 text-center text-sm">{t('vaultEmpty')}</li>}
        {entries.length > 0 && visible.length === 0 && (
          <li className="text-muted-foreground p-4 text-center text-sm">{t('noMatches')}</li>
        )}
        {visible.map((entry) => {
          const isSelected = entry.id === selected?.id
          return (
            <li
              key={entry.id}
              aria-current={isSelected || undefined}
              className={cn(
                'group flex items-center gap-1 rounded-md pr-1',
                isSelected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
              )}
            >
              <button
                type="button"
                className="flex min-w-0 flex-1 items-center gap-2 rounded-md p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
                onClick={() => setSelectedId(entry.id)}
              >
                {/* Title only: some domains are revealing on their own, so the
                    list never shows the URL or the extra hosts, not even in a tooltip. */}
                <SiteAvatar text={entryTitle(entry)} icon={entry.icon} />
                <span className="min-w-0 flex-1 truncate text-sm">{entryTitle(entry)}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-xs"
                className={cn(!isSelected && 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                onClick={() => onEdit(entry)}
                aria-label={t('edit')}
                title={t('edit')}
              >
                <Pencil />
              </Button>
              {isSelected && (
                <Button size="xs" onClick={() => onOpen(entry)}>
                  <ExternalLink />
                  {t('vaultOpen')}
                </Button>
              )}
            </li>
          )
        })}
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
