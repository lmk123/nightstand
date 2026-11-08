import {useRef, useState} from 'react'
import {Download, FileText, TriangleAlert} from 'lucide-react'
import {cn} from 'cn'
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
import {buttonClass, fieldClass, outlineButtonClass, viewClass} from '../components/styles'
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
  const filePick = useRef(0)

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
      let merged: MergeResult
      try {
        const data = await openBackup(backup, secret)
        if (!data) return setError(t('errBackupSecret'))
        merged = mergeEntries(session.data.entries, data.entries)
      } catch (e) {
        // The file itself parsed, so a newer payload only shows up here, after decrypting.
        return setError(isCoreError(e, 'unsupported-version') ? t('errBackupNewer') : t('errBackupInvalid'))
      }
      try {
        await onImported(merged)
      } catch (e) {
        // The backup is fine; writing the merged vault failed.
        console.error(e)
        return setError(t('errSaveFailed'))
      }
      setResult(merged)
      setBackup(null)
      setSecret('')
      setPasted('')
      setFileName(null)
      setError(null)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={viewClass}>
      <Header title={t('backupTitle')} onBack={onBack} />
      <div className="flex min-h-0 flex-col gap-5 overflow-y-auto px-3 py-4 *:shrink-0">
        <section className="grid grid-cols-1 gap-2">
          <h2 className="section-label">{t('backupExportSection')}</h2>
          <div className="panel grid grid-cols-1 gap-3 p-3.5">
            <p className="text-subtle-foreground text-[12.5px] leading-relaxed">{t('backupExportHint')}</p>
            <Button className={cn(buttonClass, 'justify-self-start')} onClick={exportEncrypted}>
              <Download />
              {t('backupExport')}
            </Button>
          </div>
        </section>

        <section className="grid grid-cols-1 gap-2">
          <h2 className="section-label">{t('backupImportSection')}</h2>
          <div className="panel grid grid-cols-1 gap-3 p-3.5">
            <p className="text-subtle-foreground text-[12.5px] leading-relaxed">{t('backupImportHint')}</p>
            {isFirefoxLike ? (
              <Field label={t('backupPasteLabel')} htmlFor="paste" hint={t('backupPasteHint')}>
                <Textarea
                  id="paste"
                  rows={3}
                  spellCheck={false}
                  className="bg-background dark:bg-background rounded-lg font-mono text-xs md:text-xs"
                  value={pasted}
                  onChange={(e) => {
                    setPasted(e.target.value)
                    if (e.target.value.trim()) load(e.target.value)
                    else setBackup(null)
                  }}
                />
              </Field>
            ) : (
              <div className="border-input bg-background flex items-center gap-2.5 rounded-[10px] border border-dashed py-2 pr-2 pl-3">
                <input
                  ref={fileInput}
                  type="file"
                  hidden
                  accept={`${BACKUP_EXTENSION},application/json`}
                  onChange={async (e) => {
                    const file = e.target.files?.[0]
                    e.target.value = ''
                    if (!file) return
                    // Drop the previous file's backup at once, and ignore a read that a later pick overtook.
                    const pick = ++filePick.current
                    setFileName(file.name)
                    setBackup(null)
                    setResult(null)
                    let text: string
                    try {
                      text = await file.text()
                    } catch (err) {
                      console.error(err)
                      if (pick === filePick.current) setError(t('errBackupInvalid'))
                      return
                    }
                    if (pick === filePick.current) load(text)
                  }}
                />
                <FileText className="text-subtle-foreground size-[18px] shrink-0" aria-hidden />
                <span className={cn('min-w-0 flex-1 truncate text-[13px]', !fileName && 'text-muted-foreground')}>
                  {fileName ?? BACKUP_EXTENSION}
                </span>
                <Button
                  variant="outline"
                  className={cn('h-8 rounded-lg px-2.5 text-xs', outlineButtonClass)}
                  onClick={() => fileInput.current?.click()}
                >
                  {t('backupChooseFile')}
                </Button>
              </div>
            )}
            {backup && (
              <form className="grid grid-cols-1 gap-3" onSubmit={importBackup}>
                <Field label={t('backupSecretLabel')} htmlFor="secret" hint={t('backupSecretHint')}>
                  <Input
                    id="secret"
                    type="password"
                    className={fieldClass}
                    autoFocus
                    autoComplete="off"
                    value={secret}
                    onChange={(e) => setSecret(e.target.value)}
                  />
                </Field>
                <Button type="submit" className={cn(buttonClass, 'justify-self-start px-5')} disabled={busy || !secret}>
                  {busy ? t('working') : t('backupImport')}
                </Button>
              </form>
            )}
            {error && <p className="text-destructive text-xs">{error}</p>}
            {result && (
              <p className="bg-accent text-accent-foreground rounded-[10px] p-2.5 text-xs">
                {t('backupImported', String(result.added), String(result.updated))}
              </p>
            )}
          </div>
        </section>

        <section className="grid grid-cols-1 gap-2">
          <h2 className="section-label">{t('plainExportSection')}</h2>
          {confirmPlain ? (
            <div role="alert" className="bg-destructive-soft border-destructive-line grid grid-cols-1 gap-2 rounded-xl border p-3.5">
              <p className="text-destructive flex items-center gap-2 text-[13px] font-semibold">
                <TriangleAlert className="size-[18px] shrink-0" aria-hidden />
                {t('plainExportWarningTitle')}
              </p>
              <p className="text-[12.5px] leading-relaxed">{t('plainExportWarning')}</p>
              <div className="mt-1 flex gap-2">
                <Button
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/85 h-9 rounded-lg px-3.5 text-[13px]"
                  onClick={exportPlaintext}
                >
                  {t('plainExportConfirm')}
                </Button>
                <Button variant="ghost" className="text-subtle-foreground h-9 rounded-lg px-3 text-[13px]" onClick={() => setConfirmPlain(false)}>
                  {t('cancel')}
                </Button>
              </div>
            </div>
          ) : (
            <Button
              variant="ghost"
              className="text-subtle-foreground h-9 justify-self-start rounded-lg px-2 text-[13px]"
              onClick={() => setConfirmPlain(true)}
            >
              {t('plainExport')}
            </Button>
          )}
        </section>
      </div>
    </div>
  )
}
