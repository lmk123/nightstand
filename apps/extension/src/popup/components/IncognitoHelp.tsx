import {Button} from '@/components/ui/button'
import {isChromiumLike, isFirefoxLike} from '@/lib/browser'
import {t} from '@/platform/i18n'

/**
 * Explains why and how to allow the extension in incognito / private windows.
 * On Chromium it links to this extension's details page (a browser page, not
 * an extension page); Firefox does not let extensions open about:addons.
 */
export function IncognitoHelp() {
  return (
    <div className="bg-accent text-accent-foreground grid gap-2 rounded-md p-3 text-xs leading-relaxed">
      <p>{isFirefoxLike ? t('privateNeededFirefox') : t('incognitoNeeded')}</p>
      {isChromiumLike && (
        <Button
          size="xs"
          variant="outline"
          className="justify-self-start"
          onClick={() => chrome.tabs.create({url: `chrome://extensions/?id=${chrome.runtime.id}`})}
        >
          {t('incognitoOpenDetails')}
        </Button>
      )}
    </div>
  )
}
