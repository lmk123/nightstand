import {useMemo, useState} from 'react'
import {Settings} from 'lucide-react'
import {filterDecoyLinks, hostOf, type DecoyLink, type StoredVault} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {t} from '@/platform/i18n'
import {LetterAvatar} from '../components/Avatar'
import {attemptUnlock, type UnlockResult} from '../session'

/**
 * What a locked Nightstand looks like: an ordinary, working "Quick Links"
 * launcher. The filter box filters as you type; only Enter tries the typed
 * text as a passphrase (or recovery code). A failed attempt is
 * indistinguishable from filtering — no message, no shake, no delay shown.
 */
export function Decoy({
  links,
  stored,
  onUnlocked,
  onSettings
}: {
  links: DecoyLink[]
  stored: StoredVault | null
  onUnlocked: (result: UnlockResult) => void
  onSettings: () => void
}) {
  const [query, setQuery] = useState('')
  const visible = useMemo(() => filterDecoyLinks(links, query), [links, query])

  async function tryUnlock() {
    const input = query
    if (!stored || !input.trim()) return
    const result = await attemptUnlock(stored, input)
    if (result) onUnlocked(result)
  }

  async function open(link: DecoyLink) {
    await chrome.tabs.create({url: link.url})
    window.close()
  }

  return (
    <div className="flex max-h-[580px] flex-col">
      <div className="flex items-center gap-1 border-b p-2">
        <Input
          autoFocus
          autoComplete="off"
          spellCheck={false}
          placeholder={t('decoyFilterPlaceholder')}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.nativeEvent.isComposing) tryUnlock().catch(console.error)
          }}
        />
        <Button variant="ghost" size="icon-sm" onClick={onSettings} aria-label={t('decoySettingsTitle')} title={t('decoySettingsTitle')}>
          <Settings />
        </Button>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto p-1">
        {visible.length === 0 && (
          <li className="text-muted-foreground p-4 text-center text-sm">{t('decoyEmpty')}</li>
        )}
        {visible.map((link) => (
          <li key={link.id}>
            <button
              type="button"
              className="hover:bg-muted flex w-full items-center gap-2 rounded-md p-2 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
              onClick={() => open(link)}
              title={link.url}
            >
              <LetterAvatar text={link.title} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm">{link.title}</span>
                <span className="text-muted-foreground block truncate text-xs">{hostOf(link.url) ?? link.url}</span>
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}
