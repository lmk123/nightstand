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
    <div className="bg-accent text-accent-foreground border-accent-line grid grid-cols-1 gap-2.5 rounded-xl border p-3 text-xs leading-relaxed">
      <p>{isFirefoxLike ? t('privateNeededFirefox') : t('incognitoNeeded')}</p>
      {isChromiumLike && (
        <Button
          variant="outline"
          className="border-accent-line bg-card dark:bg-card h-9 justify-self-start rounded-lg px-3 text-[13px]"
          onClick={() => chrome.tabs.create({url: `chrome://extensions/?id=${chrome.runtime.id}`})}
        >
          {t('incognitoOpenDetails')}
        </Button>
      )}
    </div>
  )
}
