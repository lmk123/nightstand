import {X} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {t} from '@/platform/i18n'
import {HelpLink} from '../help'

/**
 * Shown on the list right after a save that protects something new: asks the
 * user to check the address bar themselves. Deleting history has missed
 * suggestions before (redirect hops, other domains the site uses), and only
 * a real look at the address bar tells.
 */
export function SaveCheck({host, onDismiss}: {host: string; onDismiss: () => void}) {
  return (
    <div role="status" className="bg-accent text-accent-foreground grid gap-2 rounded-md p-3 text-xs leading-relaxed">
      <div className="flex items-start gap-2">
        <p className="flex-1 font-medium">{t('saveCheckTitle')}</p>
        <Button
          variant="ghost"
          size="icon-xs"
          className="-mt-1 -mr-1"
          onClick={onDismiss}
          aria-label={t('saveCheckDismiss')}
          title={t('saveCheckDismiss')}
        >
          <X />
        </Button>
      </div>
      <p>{t('saveCheckHow', host, host.slice(0, 3))}</p>
      <p>{t('saveCheckOpenTab')}</p>
      <p>{t('saveCheckIfStill')}</p>
      <HelpLink topic="extraHosts" label="faqExtraLink" />
    </div>
  )
}
