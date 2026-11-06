import {useState} from 'react'
import type {StoredVault} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {t} from '@/platform/i18n'
import {attemptUnlock, type UnlockResult} from '../session'

/**
 * Classic passphrase screen, used when the decoy is turned off. Unlike the
 * decoy it may say "wrong passphrase". A recovery code typed here works too
 * and leads to choosing a new passphrase.
 */
export function LockScreen({
  stored,
  loadError,
  onUnlocked
}: {
  stored: StoredVault | null
  loadError: boolean
  onUnlocked: (result: UnlockResult) => void
}) {
  const [input, setInput] = useState('')
  const [showRecovery, setShowRecovery] = useState(false)
  const [failed, setFailed] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (!stored || !input) return
    setBusy(true)
    const result = await attemptUnlock(stored, input)
    setBusy(false)
    if (result) onUnlocked(result)
    else setFailed(true)
  }

  return (
    <form className="flex flex-col gap-3 p-4" onSubmit={submit}>
      <h1 className="text-base font-semibold">{showRecovery ? t('lockRecoveryTitle') : t('lockTitle')}</h1>
      {showRecovery && <p className="text-muted-foreground text-xs leading-relaxed">{t('lockRecoveryHint')}</p>}
      <Input
        key={showRecovery ? 'recovery' : 'pass'}
        type={showRecovery ? 'text' : 'password'}
        autoFocus
        autoComplete="off"
        spellCheck={false}
        placeholder={showRecovery ? t('lockRecoveryPlaceholder') : t('lockPlaceholder')}
        value={input}
        onChange={(e) => {
          setInput(e.target.value)
          setFailed(false)
        }}
        aria-invalid={failed || undefined}
      />
      {loadError && <p className="text-destructive text-xs">{t('errStorageUnreadable')}</p>}
      {failed && <p className="text-destructive text-xs">{t('lockWrong')}</p>}
      <Button type="submit" disabled={busy || !input || !stored}>
        {t('unlock')}
      </Button>
      <Button
        type="button"
        variant="link"
        size="sm"
        className="self-start px-0"
        onClick={() => {
          setShowRecovery(!showRecovery)
          setInput('')
          setFailed(false)
        }}
      >
        {showRecovery ? t('lockUsePassphrase') : t('lockForgot')}
      </Button>
    </form>
  )
}
