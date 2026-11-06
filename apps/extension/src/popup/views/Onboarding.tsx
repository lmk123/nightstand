import {useState} from 'react'
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
import {PassphraseStrength} from '../components/PassphraseStrength'
import {RecoveryCodeBox} from '../components/RecoveryCodeBox'
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
    <div className="flex flex-col gap-4 p-4">
      <Steps current={step} />
      {step === 'intro' && <Intro onNext={() => setStep('passphrase')} />}
      {step === 'passphrase' && (
        <PassphraseStep
          onCreated={(vault) => {
            setCreated(vault)
            setStep('code')
          }}
        />
      )}
      {step === 'code' && created && (
        <RecoveryCodeStep code={created.recoveryCode} onNext={() => setStep('howto')} />
      )}
      {step === 'howto' && created && <HowToStep created={created} onDone={onDone} />}
    </div>
  )
}

const STEPS: Step[] = ['intro', 'passphrase', 'code', 'howto']

function Steps({current}: {current: Step}) {
  const index = STEPS.indexOf(current)
  return (
    <div className="flex gap-1" aria-hidden>
      {STEPS.map((s, i) => (
        <span key={s} className={i <= index ? 'bg-primary h-1 flex-1 rounded-full' : 'bg-muted h-1 flex-1 rounded-full'} />
      ))}
    </div>
  )
}

function Intro({onNext}: {onNext: () => void}) {
  return (
    <>
      <h1 className="text-base font-semibold">{t('onbIntroTitle')}</h1>
      <p className="text-sm leading-relaxed">{t('onbIntroBody')}</p>
      <p className="text-muted-foreground text-xs leading-relaxed">{t('onbIntroNote')}</p>
      <p className="text-muted-foreground text-xs leading-relaxed">{t('onbIntroRestore')}</p>
      <Button onClick={onNext}>{t('onbStart')}</Button>
    </>
  )
}

function PassphraseStep({onCreated}: {onCreated: (vault: CreatedVault) => void}) {
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
    <form className="flex flex-col gap-3" onSubmit={submit}>
      <h1 className="text-base font-semibold">{t('onbPassTitle')}</h1>
      <p className="text-muted-foreground text-xs leading-relaxed">{t('onbPassHint')}</p>
      <Field label={t('onbPassLabel')} htmlFor="pass">
        <Input id="pass" type="password" autoFocus autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
        <PassphraseStrength passphrase={passphrase} />
      </Field>
      <Field label={t('onbPassConfirmLabel')} htmlFor="pass2" error={error}>
        <Input id="pass2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      </Field>
      <Button type="submit" disabled={busy || !passphrase}>
        {busy ? t('onbCreating') : t('next')}
      </Button>
    </form>
  )
}

function RecoveryCodeStep({code, onNext}: {code: string; onNext: () => void}) {
  const [saved, setSaved] = useState(false)
  return (
    <>
      <h1 className="text-base font-semibold">{t('onbCodeTitle')}</h1>
      <p className="text-sm leading-relaxed">{t('onbCodeBody')}</p>
      <RecoveryCodeBox code={code} />
      <Label className="flex items-center gap-2 text-sm font-normal">
        <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
        {t('onbCodeConfirm')}
      </Label>
      <Button onClick={onNext} disabled={!saved}>
        {t('next')}
      </Button>
    </>
  )
}

function HowToStep({created, onDone}: {created: CreatedVault; onDone: (session: Session) => void}) {
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
    <>
      <h1 className="text-base font-semibold">{t('onbHowTitle')}</h1>
      <p className="text-sm leading-relaxed">{t('onbHowBody')}</p>
      <Button onClick={finish} disabled={busy}>
        {t('onbFinish')}
      </Button>
    </>
  )
}
