import {useState, type ReactNode} from 'react'
import {Lamp, MonitorUp, Search} from 'lucide-react'
import {cn} from 'cn'
import {
  buildMatchTable,
  checkPassphrase,
  createVault,
  defaultDecoyConfig,
  emptyVaultData,
  newMatchSalt,
  type CreatedVault
} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {t} from '@/platform/i18n'
import {saveInitialSetup} from '@/platform/storage'
import {Field} from '../components/Field'
import {RecoveryCodeBox} from '../components/RecoveryCodeBox'
import {fieldClass, mainButtonClass, outlineButtonClass} from '../components/styles'
import type {Session} from '../session'

type Step = 'intro' | 'passphrase' | 'code' | 'howto'

/**
 * First-run setup. Everything stays in memory until the last step; closing
 * the popup midway leaves storage untouched and the next open starts over.
 * This is the only screen that says what Nightstand is for, so it is short.
 */
export function Onboarding({onDone}: {onDone: (session: Session) => void}) {
  const [step, setStep] = useState<Step>('intro')
  const [created, setCreated] = useState<CreatedVault | null>(null)

  return (
    <div className="flex min-h-[540px] flex-col px-5 pt-5 pb-4">
      <Steps current={step} />
      {step === 'intro' && <Intro onNext={() => setStep('passphrase')} />}
      {step === 'passphrase' && (
        <PassphraseStep
          onBack={() => setStep('intro')}
          onCreated={(vault) => {
            setCreated(vault)
            setStep('code')
          }}
        />
      )}
      {/* Going back from here makes a new vault (and a new code) on the next
          "next": nothing has been written yet, so nothing is lost. */}
      {step === 'code' && created && (
        <RecoveryCodeStep code={created.recoveryCode} onBack={() => setStep('passphrase')} onNext={() => setStep('howto')} />
      )}
      {step === 'howto' && created && <HowToStep created={created} onBack={() => setStep('code')} onDone={onDone} />}
    </div>
  )
}

const STEPS: Step[] = ['intro', 'passphrase', 'code', 'howto']

function Steps({current}: {current: Step}) {
  const index = STEPS.indexOf(current)
  return (
    <div className="flex gap-1.5" aria-hidden>
      {STEPS.map((s, i) => (
        <span key={s} className={(i <= index ? 'bg-primary' : 'bg-border') + ' h-1 flex-1 rounded-full'} />
      ))}
    </div>
  )
}

/** Title and body of a step, then its buttons pinned to the bottom. */
function StepLayout({
  title,
  children,
  actions,
  onSubmit
}: {
  title: string
  children: ReactNode
  actions: ReactNode
  onSubmit?: (event: React.FormEvent) => void
}) {
  const Body = onSubmit ? 'form' : 'div'
  return (
    <Body className="flex flex-1 flex-col" onSubmit={onSubmit}>
      <div className="flex flex-1 flex-col gap-3.5 pt-6 pb-4">
        <h1 className="text-xl font-semibold tracking-[-0.01em]">{title}</h1>
        {children}
      </div>
      {actions}
    </Body>
  )
}

function BackAndNext({onBack, next}: {onBack: () => void; next: ReactNode}) {
  return (
    <div className="grid grid-cols-[96px_1fr] gap-2">
      <Button type="button" variant="outline" className={cn(mainButtonClass, outlineButtonClass)} onClick={onBack}>
        {t('back')}
      </Button>
      {next}
    </div>
  )
}

function Intro({onNext}: {onNext: () => void}) {
  return (
    <div className="flex flex-1 flex-col">
      <div className="flex flex-1 flex-col gap-3.5 pt-7 pb-4">
        <span className="bg-accent text-accent-foreground flex size-16 items-center justify-center rounded-[18px]">
          <Lamp className="size-8" strokeWidth={1.5} aria-hidden />
        </span>
        <h1 className="mt-1 text-[22px] font-semibold tracking-[-0.01em]">{t('onbIntroTitle')}</h1>
        <p className="text-subtle-foreground text-sm leading-relaxed">{t('onbIntroBody')}</p>
        <p className="bg-muted text-subtle-foreground flex gap-2.5 rounded-xl p-3 text-[12.5px] leading-relaxed">
          <MonitorUp className="mt-px size-[18px] shrink-0" aria-hidden />
          {t('onbIntroNote')}
        </p>
      </div>
      <p className="text-muted-foreground mb-3 text-xs leading-relaxed">{t('onbIntroRestore')}</p>
      <Button className={mainButtonClass} onClick={onNext}>
        {t('onbStart')}
      </Button>
    </div>
  )
}

function PassphraseStep({onBack, onCreated}: {onBack: () => void; onCreated: (vault: CreatedVault) => void}) {
  const [passphrase, setPassphrase] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const problem = checkPassphrase(passphrase)
    if (problem === 'too-short') return setError(t('errPassTooShort'))
    if (problem === 'looks-like-recovery-code') return setError(t('errPassLooksLikeCode'))
    if (passphrase !== confirm) return setError(t('errPassMismatch'))
    setError(null)
    setBusy(true)
    try {
      onCreated(await createVault(passphrase, emptyVaultData()))
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepLayout
      title={t('onbPassTitle')}
      onSubmit={submit}
      actions={
        <BackAndNext
          onBack={onBack}
          next={
            <Button type="submit" className={mainButtonClass} disabled={busy || !passphrase}>
              {busy ? t('onbCreating') : t('next')}
            </Button>
          }
        />
      }
    >
      <p className="text-subtle-foreground text-[13px] leading-relaxed">{t('onbPassHint')}</p>
      <Field label={t('onbPassLabel')} htmlFor="pass">
        <Input
          id="pass"
          type="password"
          className={fieldClass}
          autoFocus
          autoComplete="new-password"
          value={passphrase}
          onChange={(e) => setPassphrase(e.target.value)}
        />
      </Field>
      <Field label={t('onbPassConfirmLabel')} htmlFor="pass2" error={error}>
        <Input
          id="pass2"
          type="password"
          className={fieldClass}
          autoComplete="new-password"
          aria-invalid={error ? true : undefined}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
    </StepLayout>
  )
}

function RecoveryCodeStep({code, onBack, onNext}: {code: string; onBack: () => void; onNext: () => void}) {
  const [saved, setSaved] = useState(false)
  return (
    <StepLayout
      title={t('onbCodeTitle')}
      actions={
        <BackAndNext
          onBack={onBack}
          next={
            <Button className={mainButtonClass} onClick={onNext} disabled={!saved}>
              {t('next')}
            </Button>
          }
        />
      }
    >
      <p className="text-subtle-foreground text-[13px] leading-relaxed">{t('onbCodeBody')}</p>
      <RecoveryCodeBox code={code} />
      <Label className="bg-muted flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-[13px] font-normal">
        <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
        {t('onbCodeConfirm')}
      </Label>
    </StepLayout>
  )
}

function HowToStep({created, onBack, onDone}: {created: CreatedVault; onBack: () => void; onDone: (session: Session) => void}) {
  const [busy, setBusy] = useState(false)

  async function finish() {
    setBusy(true)
    try {
      const salt = newMatchSalt()
      const data = emptyVaultData()
      // The one and only write of onboarding.
      await saveInitialSetup(created.stored, await buildMatchTable(data.entries, salt), defaultDecoyConfig())
      onDone({stored: created.stored, dek: created.dek, data, salt})
    } finally {
      setBusy(false)
    }
  }

  return (
    <StepLayout
      title={t('onbHowTitle')}
      actions={
        <BackAndNext
          onBack={onBack}
          next={
            <Button className={mainButtonClass} onClick={finish} disabled={busy}>
              {t('onbFinish')}
            </Button>
          }
        />
      }
    >
      {/* A sketch of the locked popup: type into the filter box, press Enter. */}
      <figure aria-hidden className="bg-muted mt-1 grid gap-2.5 rounded-[14px] p-3.5">
        <div className="flex items-center gap-2">
          <span className="bg-card border-primary flex h-9 flex-1 items-center gap-2 rounded-[9px] border-[1.5px] px-2.5">
            <Search className="text-muted-foreground size-3.5" />
            <span className="text-muted-foreground text-[13px]">{t('decoyFilterPlaceholder')}</span>
          </span>
          <kbd className="bg-card border-input grid size-9 place-items-center rounded-[9px] border border-b-[3px] font-sans text-[13px] font-semibold">
            ↵
          </kbd>
        </div>
        <div className="grid grid-cols-4 gap-1.5">
          {[0, 1, 2, 3].map((i) => (
            <span key={i} className="bg-border h-[26px] rounded-[7px]" />
          ))}
        </div>
      </figure>
      <p className="text-subtle-foreground text-[13px] leading-relaxed">{t('onbHowBody')}</p>
    </StepLayout>
  )
}
