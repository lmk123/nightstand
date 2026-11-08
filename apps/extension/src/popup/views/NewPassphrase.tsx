import {useState} from 'react'
import {KeyRound} from 'lucide-react'
import {checkPassphrase} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {t} from '@/platform/i18n'
import {Field} from '../components/Field'
import {Header} from '../components/Header'
import {fieldClass, mainButtonClass} from '../components/styles'

/**
 * Sets a new passphrase for an unlocked vault. Used after unlocking with the
 * recovery code (forgotten passphrase, no way back: `onBack` absent) and from
 * real settings. `onSubmit` writes it (through App's update queue).
 */
export function NewPassphrase({
  title,
  hint,
  onSubmit,
  onBack
}: {
  title: string
  hint?: string
  onSubmit: (passphrase: string) => Promise<void>
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
    setError(null)
    setBusy(true)
    try {
      await onSubmit(passphrase)
    } catch (e) {
      console.error(e)
      setError(t('errSaveFailed'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col">
      <Header title={title} onBack={onBack} />
      <form className="flex flex-col" onSubmit={submit}>
        <div className="flex flex-col gap-3.5 p-4">
          {hint &&
            (onBack ? (
              <p className="bg-muted text-subtle-foreground rounded-[10px] px-3 py-2.5 text-[12.5px] leading-relaxed">{hint}</p>
            ) : (
              <p className="bg-accent text-accent-foreground border-accent-line flex gap-2.5 rounded-xl border p-3 text-[13px] leading-relaxed">
                <KeyRound className="mt-0.5 size-[18px] shrink-0" aria-hidden />
                {hint}
              </p>
            ))}
          <p className="text-muted-foreground text-xs leading-relaxed">{t('onbPassHint')}</p>
          <Field label={t('newPassLabel')} htmlFor="np1">
            <Input
              id="np1"
              type="password"
              className={fieldClass}
              autoFocus
              autoComplete="new-password"
              value={passphrase}
              onChange={(e) => setPassphrase(e.target.value)}
            />
          </Field>
          <Field label={t('onbPassConfirmLabel')} htmlFor="np2" error={error}>
            <Input
              id="np2"
              type="password"
              className={fieldClass}
              autoComplete="new-password"
              aria-invalid={error ? true : undefined}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
            />
          </Field>
        </div>
        <footer className="border-line border-t p-3">
          <Button type="submit" className={mainButtonClass + ' w-full'} disabled={busy || !passphrase}>
            {busy ? t('working') : t('save')}
          </Button>
        </footer>
      </form>
    </div>
  )
}
