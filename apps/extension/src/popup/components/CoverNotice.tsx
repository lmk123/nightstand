import {useState} from 'react'
import {EyeOff, RotateCcw, ShieldCheck} from 'lucide-react'
import {cn} from 'cn'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Label} from '@/components/ui/label'
import {t, type MessageKey} from '@/platform/i18n'
import {HelpLink} from '../help'
import {usePrefs} from '../prefs'
import {mainButtonClass, outlineButtonClass} from './styles'

/**
 * Bottom sheet shown before the vault list's header toggle turns enhanced
 * mode on: what it does, in brief, and a link to the full answer in the help.
 * Not shown from the settings switch, which has its own hint and link.
 * Covers the whole view it is placed in (the parent is `relative`).
 *
 * `onSkipFromNow`: the user ticked "don't show again" (settings can turn it back on).
 */
export function CoverNotice({onSkipFromNow, onClose}: {onSkipFromNow: () => void; onClose: () => void}) {
  const {prefs, changeCover} = usePrefs()
  const [dontShowAgain, setDontShowAgain] = useState(false)
  // Read in a few milliseconds: wait for it rather than show the muting line wrong.
  if (!prefs) return null

  const points: [typeof EyeOff, MessageKey][] = [
    [EyeOff, prefs.mute ? 'coverNoticeCoverMute' : 'coverNoticeCover'],
    [RotateCcw, 'coverNoticeRecover'],
    [ShieldCheck, 'coverNoticeAccess']
  ]

  function turnOn() {
    // No await before `changeCover`: the permission request must stay in the click.
    // Chrome's first prompt closes the popup and may cut the write off; the sheet then shows once more.
    if (dontShowAgain) onSkipFromNow()
    changeCover(true)
    onClose()
  }

  return (
    <>
      <div aria-hidden className="bg-scrim absolute inset-0" onClick={onClose} />
      <section
        role="alertdialog"
        aria-labelledby="cover-notice-title"
        className="bg-card absolute inset-x-0 bottom-0 grid max-h-full grid-cols-1 gap-3.5 overflow-y-auto rounded-t-[18px] px-4 pt-2.5 pb-4 shadow-[0_-8px_24px_rgb(0_0_0/0.14)]"
      >
        <span aria-hidden className="bg-input h-1 w-9 justify-self-center rounded-full" />
        <h2 id="cover-notice-title" className="text-base font-semibold">
          {t('coverNoticeTitle')}
        </h2>
        <p className="text-subtle-foreground text-[13px] leading-relaxed">{t('coverNoticeIntro')}</p>
        <ul className="grid grid-cols-1 gap-2.5">
          {points.map(([Icon, key], i) => (
            <li
              key={key}
              className={cn(
                'flex items-start gap-2 text-[13px] leading-snug',
                // The permission line is small print next to what the mode does.
                i < 2 ? 'text-foreground font-semibold' : 'text-muted-foreground text-xs leading-relaxed'
              )}
            >
              <Icon className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
              {t(key)}
            </li>
          ))}
        </ul>
        <HelpLink topic="enhancedMode" label="faqCoverLink" />
        <Label className="text-subtle-foreground flex min-h-8 items-center gap-2 text-[13px] font-normal">
          <Checkbox checked={dontShowAgain} onCheckedChange={(v) => setDontShowAgain(v === true)} />
          {t('saveNoticeSkip')}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className={cn(mainButtonClass, outlineButtonClass)} onClick={onClose}>
            {t('cancel')}
          </Button>
          <Button type="button" className={mainButtonClass} autoFocus onClick={turnOn}>
            {t('coverNoticeConfirm')}
          </Button>
        </div>
      </section>
    </>
  )
}
