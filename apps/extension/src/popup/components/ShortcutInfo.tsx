import {useEffect, useState} from 'react'
import {cn} from 'cn'
import {Button} from '@/components/ui/button'
import {isChromiumLike, isFirefoxLike} from '@/lib/browser'
import {t} from '@/platform/i18n'
import {outlineButtonClass} from './styles'

const KEY = 'bg-background text-foreground min-w-6 rounded-md border border-b-2 border-input px-1.5 py-0.5 text-center font-sans text-xs font-medium'

/** Shows the panic shortcut and where to change it (browser pages, not extension pages). */
export function ShortcutInfo() {
  const [shortcut, setShortcut] = useState<string | null>(null)

  useEffect(() => {
    chrome.commands.getAll().then(
      (commands) => setShortcut(commands.find((c) => c.name === 'panic')?.shortcut || ''),
      () => setShortcut('')
    )
  }, [])

  // Chrome reports e.g. "⌥⇧Q" on macOS and "Alt+Shift+Q" elsewhere.
  const keys = shortcut ? (shortcut.includes('+') ? shortcut.split('+') : [...shortcut]) : []

  return (
    <div className="panel grid grid-cols-1 gap-2.5 p-3 text-xs leading-relaxed">
      {shortcut === null ? null : shortcut ? (
        <p className="flex items-center justify-between gap-2 text-[13px]">
          <span>{t('shortcutCurrentLabel')}</span>
          <span className="flex gap-1" role="img" aria-label={shortcut}>
            {keys.map((key, i) => (
              <kbd key={i} className={KEY}>
                {key}
              </kbd>
            ))}
          </span>
        </p>
      ) : (
        <p className="text-[13px]">{t('shortcutNone')}</p>
      )}
      <p className="text-muted-foreground">{t('shortcutHint')}</p>
      {isChromiumLike && (
        <Button
          variant="outline"
          className={cn('h-9 justify-self-start rounded-lg px-3 text-[13px]', outlineButtonClass)}
          onClick={() => chrome.tabs.create({url: 'chrome://extensions/shortcuts'})}
        >
          {t('shortcutChange')}
        </Button>
      )}
      {isFirefoxLike && <p className="text-muted-foreground">{t('shortcutChangeFirefox')}</p>}
    </div>
  )
}
