import {useState} from 'react'
import {changePassphrase, checkPassphrase} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {t} from '@/platform/i18n'
import {Field} from '../components/Field'
import {Header} from '../components/Header'
import {PassphraseStrength} from '../components/PassphraseStrength'
import {commitStored, type Session} from '../session'

/**
 * Sets a new passphrase for an unlocked vault. Used after unlocking with the
 * recovery code (forgotten passphrase) and from real settings.
 */
export function NewPassphrase({
  session,
  title,
  hint,
  onDone,
  onBack
}: {
  session: Session
  title: string
  hint?: string
  onDone: (session: Session) => void
  onBack?: () => void
}) {
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
    setBusy(true)
    try {
      const stored = await changePassphrase(session.stored, session.dek, passphrase)
      onDone(await commitStored(session, stored))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col">
      <Header title={title} onBack={onBack} />
      <form className="flex flex-col gap-3 p-3" onSubmit={submit}>
        {hint && <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>}
        <p className="text-muted-foreground text-xs leading-relaxed">{t('onbPassHint')}</p>
        <Field label={t('newPassLabel')} htmlFor="np1">
          <Input id="np1" type="password" autoFocus autoComplete="new-password" value={passphrase} onChange={(e) => setPassphrase(e.target.value)} />
          <PassphraseStrength passphrase={passphrase} />
        </Field>
        <Field label={t('onbPassConfirmLabel')} htmlFor="np2" error={error}>
          <Input id="np2" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        <Button type="submit" disabled={busy || !passphrase}>
          {busy ? t('working') : t('save')}
        </Button>
      </form>
    </div>
  )
}
