import {useEffect, useMemo, useRef, useState} from 'react'
import {AppWindow, Lock, Pencil, Plus, Search, SlidersHorizontal} from 'lucide-react'
import {searchEntries, type VaultEntry} from '@nightstand/core'
import {cn} from 'cn'
import {Button} from '@/components/ui/button'
import {t} from '@/platform/i18n'
import {SiteAvatar} from '../components/Avatar'
import {Header} from '../components/Header'
import {buttonClass, outlineButtonClass} from '../components/styles'
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
        bordered={false}
        title={
          <>
            {t('vaultTitle')}
            <span className="bg-track text-subtle-foreground rounded-full px-2 py-px text-xs font-medium">{entries.length}</span>
          </>
        }
        actions={
          <>
            <Button
              variant="ghost"
              size="icon-lg"
              className="text-subtle-foreground rounded-[10px]"
              onClick={onSettings}
              aria-label={t('settings')}
              title={t('settings')}
            >
              <SlidersHorizontal />
            </Button>
            <Button
              variant="ghost"
              size="icon-lg"
              className="text-subtle-foreground rounded-[10px]"
              onClick={onLock}
              aria-label={t('lock')}
              title={t('lock')}
            >
              <Lock />
            </Button>
          </>
        }
      />
      {notice}
      {entries.length > 0 && (
        <div className="px-3 pb-2">
          <label className="bg-card focus-within:border-ring focus-within:ring-ring/25 flex h-10 items-center gap-2 rounded-[10px] border px-3 focus-within:ring-3">
            <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
            <input
              autoFocus
              aria-label={t('vaultSearchPlaceholder')}
              placeholder={t('vaultSearchPlaceholder')}
              className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
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
          </label>
        </div>
      )}
      <ul ref={listRef} className="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2">
        {entries.length === 0 && <li className="text-muted-foreground px-6 py-8 text-center text-[13px] leading-relaxed">{t('vaultEmpty')}</li>}
        {entries.length > 0 && visible.length === 0 && (
          <li className="text-muted-foreground p-6 text-center text-[13px]">{t('noMatches')}</li>
        )}
        {visible.map((entry) => {
          const isSelected = entry.id === selected?.id
          return (
            <li
              key={entry.id}
              aria-current={isSelected || undefined}
              className={cn(
                'group flex h-12 shrink-0 items-center gap-1 rounded-[10px] pr-1.5',
                isSelected ? 'bg-accent text-accent-foreground shadow-[inset_0_0_0_1px_var(--accent-line)]' : 'hover:bg-muted'
              )}
            >
              <button
                type="button"
                className="focus-visible:ring-ring/50 flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-[10px] px-2 text-left outline-none focus-visible:ring-2"
                onClick={() => setSelectedId(entry.id)}
              >
                {/* Title only: some domains are revealing on their own, so the
                    list never shows the URL or the extra hosts, not even in a tooltip. */}
                <SiteAvatar text={entryTitle(entry)} icon={entry.icon} />
                <span className={cn('min-w-0 flex-1 truncate text-sm', isSelected && 'font-medium')}>{entryTitle(entry)}</span>
              </button>
              <Button
                variant="ghost"
                size="icon-sm"
                className={cn('rounded-lg', isSelected ? 'hover:bg-accent-line/60 text-accent-foreground' : 'opacity-0 group-hover:opacity-100 focus-visible:opacity-100')}
                onClick={() => onEdit(entry)}
                aria-label={t('edit')}
                title={t('edit')}
              >
                <Pencil />
              </Button>
              {isSelected && (
                // The ↵ hint is a pseudo-element, so the button's text stays just "打开".
                <Button size="sm" className="rounded-lg pr-2.5 pl-3 after:rounded after:border after:border-current/45 after:px-1 after:text-[11px] after:leading-[15px] after:opacity-80 after:content-['↵']" onClick={() => onOpen(entry)}>
                  {t('vaultOpen')}
                </Button>
              )}
            </li>
          )
        })}
      </ul>
      {visible.length > 0 && (
        <p className="text-muted-foreground px-[18px] py-1.5 text-[11px]" aria-hidden>
          {t('vaultKeysHint')}
        </p>
      )}
      <footer className="border-line grid grid-cols-2 gap-2 border-t p-3 pt-2.5">
        <Button className={buttonClass} onClick={onAddCurrent}>
          <AppWindow />
          {t('addCurrentTab')}
        </Button>
        <Button variant="outline" className={cn(buttonClass, outlineButtonClass)} onClick={onAddManual}>
          <Plus />
          {t('addManually')}
        </Button>
      </footer>
    </div>
  )
}
