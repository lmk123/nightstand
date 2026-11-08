import {useState} from 'react'
import {Check} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Label} from '@/components/ui/label'
import {t, type MessageKey} from '@/platform/i18n'
import {HelpLink} from '../help'

const STEPS: MessageKey[] = ['saveCheckHow', 'saveCheckOpenTab', 'saveCheckIfStill']

/**
 * Shown on the list right after a save that protects something new: asks the
 * user to check the address bar themselves. Deleting history has missed
 * suggestions before (redirect hops, other domains the site uses), and only
 * a real look at the address bar tells. It never names the domain: some are
 * revealing on their own.
 *
 * `skipFromNow`: the user ticked "don't show again" (settings can turn it back on).
 */
export function SaveCheck({onDismiss}: {onDismiss: (skipFromNow: boolean) => void}) {
  const [dontShowAgain, setDontShowAgain] = useState(false)
  return (
    <section role="status" className="bg-warn text-warn-foreground border-warn-line mx-3 mb-2 stack gap-2.5 rounded-xl border p-3.5 pb-3">
      <div className="flex items-center gap-2">
        <span className="bg-warn-solid text-warn-solid-foreground flex size-[22px] shrink-0 items-center justify-center rounded-full">
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
        </span>
        <h2 className="text-sm font-semibold">{t('saveCheckTitle')}</h2>
      </div>
      <ol className="stack gap-2 text-[12.5px] leading-relaxed">
        {STEPS.map((key, i) => (
          <li key={key} className="flex gap-2">
            <span className="bg-warn-chip mt-0.5 flex size-[18px] shrink-0 items-center justify-center rounded-full text-[11px] font-semibold">
              {i + 1}
            </span>
            <span>{t(key)}</span>
          </li>
        ))}
      </ol>
      <div className="[&_button]:text-warn-foreground/80 [&_button:hover]:text-warn-foreground">
        <HelpLink topic="extraHosts" label="faqExtraLink" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <Label className="flex min-h-9 items-center gap-2 text-[13px] font-normal">
          <Checkbox
            className="border-warn-foreground/50 data-checked:border-warn-solid data-checked:bg-warn-solid data-checked:text-warn-solid-foreground dark:data-checked:bg-warn-solid"
            checked={dontShowAgain}
            onCheckedChange={(v) => setDontShowAgain(v === true)}
          />
          {t('saveNoticeSkip')}
        </Label>
        <Button
          className="bg-warn-solid text-warn-solid-foreground hover:bg-warn-solid/85 h-9 rounded-lg px-4 text-[13px]"
          onClick={() => onDismiss(dontShowAgain)}
          title={t('saveCheckDismiss')}
        >
          {t('saveCheckDismiss')}
        </Button>
      </div>
    </section>
  )
}
