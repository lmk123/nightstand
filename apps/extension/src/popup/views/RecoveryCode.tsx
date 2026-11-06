import {useState} from 'react'
import {rotateRecoveryCode} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Label} from '@/components/ui/label'
import {t} from '@/platform/i18n'
import {Header} from '../components/Header'
import {RecoveryCodeBox} from '../components/RecoveryCodeBox'
import {commitStored, type Session} from '../session'

/** Issues a new recovery code (the old one stops working) and shows it once. */
export function RecoveryCode({
  session,
  onDone,
  onBack
}: {
  session: Session
  onDone: (session: Session) => void
  onBack: () => void
}) {
  const [code, setCode] = useState<string | null>(null)
  const [pending, setPending] = useState<Session | null>(null)
  const [saved, setSaved] = useState(false)
  const [busy, setBusy] = useState(false)

  async function generate() {
    setBusy(true)
    try {
      const rotated = await rotateRecoveryCode(session.stored, session.dek)
      // Written immediately: from now on only the new code works.
      setPending(await commitStored(session, rotated.stored))
      setCode(rotated.recoveryCode)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col">
      <Header title={t('recoveryTitle')} onBack={code ? undefined : onBack} />
      <div className="flex flex-col gap-3 p-3">
        {code && pending ? (
          <>
            <p className="text-sm leading-relaxed">{t('recoveryNewBody')}</p>
            <RecoveryCodeBox code={code} />
            <Label className="flex items-center gap-2 text-sm font-normal">
              <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
              {t('onbCodeConfirm')}
            </Label>
            <Button disabled={!saved} onClick={() => onDone(pending)}>
              {t('done')}
            </Button>
          </>
        ) : (
          <>
            <p className="text-sm leading-relaxed">{t('recoveryRotateBody')}</p>
            <Button onClick={generate} disabled={busy}>
              {busy ? t('working') : t('recoveryRotate')}
            </Button>
          </>
        )}
      </div>
    </div>
  )
}
