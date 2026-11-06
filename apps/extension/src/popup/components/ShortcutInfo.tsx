import {useEffect, useState} from 'react'
import {Button} from '@/components/ui/button'
import {isChromiumLike, isFirefoxLike} from '@/lib/browser'
import {t} from '@/platform/i18n'

/** Shows the panic shortcut and where to change it (browser pages, not extension pages). */
export function ShortcutInfo() {
  const [shortcut, setShortcut] = useState<string | null>(null)

  useEffect(() => {
    chrome.commands.getAll().then(
      (commands) => setShortcut(commands.find((c) => c.name === 'panic')?.shortcut || ''),
      () => setShortcut('')
    )
  }, [])

  return (
    <div className="grid gap-2 text-xs leading-relaxed">
      <p>
        {shortcut === null ? '' : shortcut ? t('shortcutCurrent', shortcut) : t('shortcutNone')}
      </p>
      <p className="text-muted-foreground">{t('shortcutHint')}</p>
      {isChromiumLike && (
        <Button
          size="xs"
          variant="outline"
          className="justify-self-start"
          onClick={() => chrome.tabs.create({url: 'chrome://extensions/shortcuts'})}
        >
          {t('shortcutChange')}
        </Button>
      )}
      {isFirefoxLike && <p className="text-muted-foreground">{t('shortcutChangeFirefox')}</p>}
    </div>
  )
}
