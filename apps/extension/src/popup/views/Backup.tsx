import {useRef, useState} from 'react'
import {
  BACKUP_EXTENSION,
  createBackup,
  isCoreError,
  mergeEntries,
  openBackup,
  parseBackup,
  serializeBackup,
  toPlaintextExport,
  type BackupFile,
  type MergeResult
} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Textarea} from '@/components/ui/textarea'
import {isFirefoxLike} from '@/lib/browser'
import {dateStamp, downloadText} from '@/platform/download'
import {t} from '@/platform/i18n'
import {Field} from '../components/Field'
import {Header} from '../components/Header'
import type {Session} from '../session'

/**
 * Encrypted export/import and plaintext export.
 *
 * Import source: a file picker on Chromium (verified not to close the popup)
 * and pasted text on Firefox, where the file picker closes the popup. Never
 * an extension tab.
 */
export function Backup({
  session,
  onImported,
  onBack
}: {
  session: Session
  onImported: (merged: MergeResult) => Promise<void>
  onBack: () => void
}) {
  const [confirmPlain, setConfirmPlain] = useState(false)
  const [backup, setBackup] = useState<BackupFile | null>(null)
  const [pasted, setPasted] = useState('')
  const [secret, setSecret] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<MergeResult | null>(null)
  const [busy, setBusy] = useState(false)
  const [fileName, setFileName] = useState<string | null>(null)
  const fileInput = useRef<HTMLInputElement>(null)

  function exportEncrypted() {
    const text = serializeBackup(createBackup(session.stored, Date.now()))
    downloadText(`nightstand-${dateStamp()}${BACKUP_EXTENSION}`, text)
  }

  function exportPlaintext() {
    downloadText(`nightstand-plaintext-${dateStamp()}.json`, toPlaintextExport(session.data, Date.now()))
    setConfirmPlain(false)
  }

  function load(text: string) {
    setResult(null)
    try {
      setBackup(parseBackup(text))
      setError(null)
    } catch (e) {
      setBackup(null)
      setError(isCoreError(e, 'unsupported-version') ? t('errBackupNewer') : t('errBackupInvalid'))
    }
  }

  async function importBackup(event: React.FormEvent) {
    event.preventDefault()
    if (!backup) return
    setBusy(true)
    try {
      const data = await openBackup(backup, secret)
      if (!data) return setError(t('errBackupSecret'))
      const merged = mergeEntries(session.data.entries, data.entries)
      await onImported(merged)
      setResult(merged)
      setBackup(null)
      setSecret('')
      setPasted('')
      setError(null)
    } catch {
      setError(t('errBackupInvalid'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex max-h-[580px] flex-col">
      <Header title={t('backupTitle')} onBack={onBack} />
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto p-3">
        <section className="grid gap-2">
          <h2 className="text-xs font-medium">{t('backupExportSection')}</h2>
          <p className="text-muted-foreground text-xs leading-relaxed">{t('backupExportHint')}</p>
          <Button size="sm" className="justify-self-start" onClick={exportEncrypted}>
            {t('backupExport')}
          </Button>
        </section>

        <section className="grid gap-2">
          <h2 className="text-xs font-medium">{t('backupImportSection')}</h2>
          <p className="text-muted-foreground text-xs leading-relaxed">{t('backupImportHint')}</p>
          {isFirefoxLike ? (
            <Field label={t('backupPasteLabel')} htmlFor="paste" hint={t('backupPasteHint')}>
              <Textarea
                id="paste"
                rows={3}
                spellCheck={false}
                className="font-mono text-xs"
                value={pasted}
                onChange={(e) => {
                  setPasted(e.target.value)
                  if (e.target.value.trim()) load(e.target.value)
                  else setBackup(null)
                }}
              />
            </Field>
          ) : (
            <div className="flex items-center gap-2">
              <input
                ref={fileInput}
                type="file"
                hidden
                accept={`${BACKUP_EXTENSION},application/json`}
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (!file) return
                  setFileName(file.name)
                  load(await file.text())
                }}
              />
              <Button size="sm" variant="secondary" onClick={() => fileInput.current?.click()}>
                {t('backupChooseFile')}
              </Button>
              {fileName && <span className="text-muted-foreground min-w-0 truncate text-xs">{fileName}</span>}
            </div>
          )}
          {backup && (
            <form className="grid gap-2" onSubmit={importBackup}>
              <Field label={t('backupSecretLabel')} htmlFor="secret" hint={t('backupSecretHint')}>
                <Input id="secret" type="password" autoFocus autoComplete="off" value={secret} onChange={(e) => setSecret(e.target.value)} />
              </Field>
              <Button type="submit" size="sm" className="justify-self-start" disabled={busy || !secret}>
                {busy ? t('working') : t('backupImport')}
              </Button>
            </form>
          )}
          {error && <p className="text-destructive text-xs">{error}</p>}
          {result && (
            <p className="bg-accent text-accent-foreground rounded-md p-2 text-xs">
              {t('backupImported', String(result.added), String(result.updated))}
            </p>
          )}
        </section>

        <section className="grid gap-2">
          <h2 className="text-xs font-medium">{t('plainExportSection')}</h2>
          {confirmPlain ? (
            <div className="border-destructive bg-destructive/10 grid gap-2 rounded-md border p-3 text-xs leading-relaxed">
              <p className="text-destructive font-medium">{t('plainExportWarningTitle')}</p>
              <p>{t('plainExportWarning')}</p>
              <div className="flex gap-2">
                <Button size="xs" variant="destructive" onClick={exportPlaintext}>
                  {t('plainExportConfirm')}
                </Button>
                <Button size="xs" variant="ghost" onClick={() => setConfirmPlain(false)}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button size="sm" variant="ghost" className="justify-self-start" onClick={() => setConfirmPlain(true)}>
              {t('plainExport')}
            </Button>
          )}
        </section>
      </div>
    </div>
  )
}
