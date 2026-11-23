import {useEffect, useEffectEvent, useRef, useState} from 'react'
import {EyeOff, RotateCcw, ShieldCheck} from 'lucide-react'
import {cn} from 'cn'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Label} from '@/components/ui/label'
import {t, type MessageKey} from '@/platform/i18n'
import {HelpLink} from '../help'
import {mainButtonClass, outlineButtonClass} from './styles'

/**
 * Bottom sheet shown before the vault list's header toggle turns enhanced
 * mode on: what it does, in brief, and a link to the full answer in the help.
 * Not shown from the settings switch, which has its own hint and link.
 * Covers the whole view it is placed in (the parent is `relative` and makes
 * everything else inert while it is open); Escape cancels.
 *
 * `mute` and `turnOn` come from the toggle that was clicked (`CoverToggle`).
 * `granted`: the page access was already granted, so `turnOn` answers at once
 * and the popup stays open. `skipped`: "don't show again" is stored although
 * the sheet is shown (left from a first try that never got access).
 * `onSkipChange` writes "don't show again"; settings can turn the sheet back on.
 */
export function CoverNotice({
  mute,
  granted,
  skipped,
  turnOn,
  onSkipChange,
  onClose
}: {
  mute: boolean
  granted: boolean
  skipped: boolean
  turnOn: () => void
  onSkipChange: (skip: boolean) => Promise<void>
  onClose: () => void
}) {
  const [dontShowAgain, setDontShowAgain] = useState(false)
  // A tick that never led to access doesn't count: it is cleared on opening
  // (below), or turning on now without ticking would keep the sheet away.
  const clear = !granted && skipped
  // Writes of "don't show again" not finished yet: "Turn on" waits for them.
  const [saving, setSaving] = useState(clear ? 1 : 0)
  const done = () => setSaving((n) => n - 1)

  function write(skip: boolean) {
    setSaving((n) => n + 1)
    void onSkipChange(skip).finally(done)
  }

  const cleared = useRef(false)
  const clearOnce = useEffectEvent(() => {
    if (!clear || cleared.current) return
    cleared.current = true
    void onSkipChange(false).finally(done)
  })
  useEffect(() => clearOnce(), [])

  const points: [typeof EyeOff, MessageKey][] = [
    [EyeOff, mute ? 'coverNoticeCoverMute' : 'coverNoticeCover'],
    [RotateCcw, 'coverNoticeRecover'],
    [ShieldCheck, 'coverNoticeAccess']
  ]

  function changeSkip(skip: boolean) {
    setDontShowAgain(skip)
    // First time: written on the tick, not on "Turn on": Chrome's prompt closes
    // the popup at once and would cut a write started then. "Turn on" waits
    // until it lands. Already granted, it waits for "Turn on" instead.
    if (!granted) write(skip)
  }

  function cancel() {
    // Ticked, then cancelled: nothing was turned on, so keep showing it.
    if (!granted && dontShowAgain) write(false)
    onClose()
  }

  function confirm() {
    if (saving > 0) return
    // No await before `turnOn`: the permission request must stay in the click.
    turnOn()
    if (granted && dontShowAgain) void onSkipChange(true)
    onClose()
  }

  // On the document: a click on the sheet's text leaves focus on the body.
  // Not while hidden: the help opened from its link hides the list, sheet and all.
  const sheet = useRef<HTMLElement>(null)
  const onKey = useEffectEvent((event: KeyboardEvent) => {
    if (event.key !== 'Escape' || !sheet.current?.checkVisibility()) return
    event.preventDefault()
    cancel()
  })
  useEffect(() => {
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  return (
    <>
      <div aria-hidden className="bg-scrim absolute inset-0" onClick={cancel} />
      <section
        ref={sheet}
        role="alertdialog"
        aria-modal
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
          <Checkbox checked={dontShowAgain} onCheckedChange={(v) => changeSkip(v === true)} />
          {t('saveNoticeSkip')}
        </Label>
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className={cn(mainButtonClass, outlineButtonClass)} onClick={cancel}>
            {t('cancel')}
          </Button>
          {/* Ignores clicks for the few milliseconds a write takes; not `disabled`, which would drop the focus,
              so dimmed by hand (the shared Button only dims `disabled`). */}
          <Button type="button" className={cn(mainButtonClass, 'aria-disabled:cursor-default aria-disabled:opacity-50')} autoFocus aria-disabled={saving > 0 || undefined} onClick={confirm}>
            {t('coverNoticeConfirm')}
          </Button>
        </div>
      </section>
    </>
  )
}
