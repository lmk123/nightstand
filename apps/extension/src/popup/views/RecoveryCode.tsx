import {useState} from 'react'
import {rotateRecoveryCode} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Label} from '@/components/ui/label'
import {t} from '@/platform/i18n'
import {Header} from '../components/Header'
import {RecoveryCodeBox} from '../components/RecoveryCodeBox'
import {mainButtonClass} from '../components/styles'
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
      <div className="flex flex-col gap-3.5 p-4">
        {code && pending ? (
          <>
            <p className="text-subtle-foreground text-[13px] leading-relaxed">{t('recoveryNewBody')}</p>
            <RecoveryCodeBox code={code} />
            <p className="text-muted-foreground text-xs leading-relaxed">{t('recoveryRotateBody')}</p>
            <Label className="bg-muted flex min-h-11 items-center gap-2.5 rounded-[10px] px-3 text-[13px] font-normal">
              <Checkbox checked={saved} onCheckedChange={(v) => setSaved(v === true)} />
              {t('onbCodeConfirm')}
            </Label>
          </>
        ) : (
          <p className="text-subtle-foreground text-[13px] leading-relaxed">{t('recoveryRotateBody')}</p>
        )}
      </div>
      <footer className="border-line border-t p-3">
        {code && pending ? (
          <Button className={mainButtonClass + ' w-full'} disabled={!saved} onClick={() => onDone(pending)}>
            {t('done')}
          </Button>
        ) : (
          <Button className={mainButtonClass + ' w-full'} onClick={generate} disabled={busy}>
            {busy ? t('working') : t('recoveryRotate')}
          </Button>
        )}
      </footer>
    </div>
  )
}
