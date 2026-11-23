import {useMemo, useRef, useState} from 'react'
import {Search, SlidersHorizontal} from 'lucide-react'
import {filterDecoyLinks, hostOf, type DecoyLink, type StoredVault} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {t} from '@/platform/i18n'
import {SiteAvatar} from '../components/Avatar'
import {attemptUnlock, type UnlockResult} from '../session'

/**
 * What a locked Nightstand looks like: an ordinary, working "Quick Links"
 * launcher. The filter box filters as you type; only Enter tries the typed
 * text as a passphrase (or recovery code). A failed attempt is
 * indistinguishable from filtering — no message, no shake, no delay shown.
 *
 * If the stored vault can't be read, a neutral notice says so (no word about
 * passphrases): otherwise the owner would think they forgot the passphrase and
 * might uninstall, destroying data that an update could still read.
 */
export function Decoy({
  links,
  stored,
  loadError,
  onUnlocked,
  onSettings
}: {
  links: DecoyLink[]
  stored: StoredVault | null
  loadError: boolean
  onUnlocked: (result: UnlockResult) => Promise<void>
  onSettings: () => void
}) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterDecoyLinks(links, query), [links, query])
  /** A successful attempt is being handled; later ones that also succeed are dropped. */
  const unlocking = useRef(false)

  async function tryUnlock() {
    const input = query
    if (!stored || !input.trim()) return
    // Attempts themselves may overlap (a wrong one must never swallow the
    // owner's next Enter), but only the first success opens the vault.
    const result = await attemptUnlock(stored, input)
    if (!result || unlocking.current) return
    unlocking.current = true
    try {
      await onUnlocked(result)
    } finally {
      unlocking.current = false
    }
  }

  async function open(link: DecoyLink) {
    await chrome.tabs.create({url: link.url})
    window.close()
  }

  return (
    <div className="flex max-h-[580px] flex-col">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <label className="bg-card focus-within:border-ring focus-within:ring-ring/25 flex h-10 min-w-0 flex-1 items-center gap-2 rounded-[10px] border px-3 focus-within:ring-3">
          <Search className="text-muted-foreground size-4 shrink-0" aria-hidden />
          <input
            autoFocus
            autoComplete="off"
            spellCheck={false}
            aria-label={t('decoyFilterPlaceholder')}
            placeholder={t('decoyFilterPlaceholder')}
            className="placeholder:text-muted-foreground min-w-0 flex-1 bg-transparent text-sm outline-none"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.nativeEvent.isComposing) tryUnlock().catch(console.error)
            }}
          />
        </label>
        <Button
          variant="ghost"
          size="icon-lg"
          className="text-subtle-foreground rounded-[10px]"
          onClick={onSettings}
          aria-label={t('decoySettingsTitle')}
          title={t('decoySettingsTitle')}
        >
          <SlidersHorizontal />
        </Button>
      </div>
      {loadError && (
        <p role="status" className="bg-muted text-muted-foreground mx-3 mt-2 rounded-[10px] p-3 text-xs leading-relaxed">
          {t('decoyDataUnreadable')}
        </p>
      )}
      <div className="text-muted-foreground flex items-baseline justify-between px-[18px] pt-3 pb-1 text-xs">
        <span className="font-semibold tracking-[0.04em]">{t('popupTitle')}</span>
        <span>{visible.length}</span>
      </div>
      {visible.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2.5 px-4 pt-8 pb-12 text-[13px]">
          <Search className="size-7 opacity-60" strokeWidth={1.6} aria-hidden />
          {t('decoyEmpty')}
        </div>
      ) : (
        <ul className="grid min-h-0 grid-cols-4 gap-0.5 overflow-y-auto px-2 pt-0.5 pb-3">
          {visible.map((link) => (
            <li key={link.id} className="min-w-0">
              <button
                type="button"
                className="hover:bg-muted focus-visible:ring-ring/50 flex w-full min-w-0 flex-col items-center gap-2 rounded-xl px-1 pt-3 pb-2.5 outline-none focus-visible:ring-2"
                onClick={() => open(link)}
                title={`${link.title}\n${hostOf(link.url) ?? link.url}`}
              >
                <SiteAvatar text={link.title} pageUrl={link.url} size="lg" />
                <span className="max-w-full truncate text-xs leading-4">{link.title}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
