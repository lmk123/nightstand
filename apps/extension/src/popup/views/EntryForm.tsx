import {useState} from 'react'
import {
  createEntry,
  editEntry,
  findDuplicate,
  isCoreError,
  type EntryInput,
  type MatchMode,
  type VaultEntry
} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group'
import {Textarea} from '@/components/ui/textarea'
import {t} from '@/platform/i18n'
import {Field} from '../components/Field'
import {Header} from '../components/Header'

/**
 * Short add/edit form. Unsaved changes are simply dropped when the popup
 * closes — drafts are never persisted (that would put plaintext on disk).
 */
export function EntryForm({
  entries,
  editing,
  prefill,
  onSave,
  onDelete,
  onCancel
}: {
  entries: VaultEntry[]
  editing?: VaultEntry
  prefill?: EntryInput
  onSave: (entry: VaultEntry, isNew: boolean) => Promise<void>
  onDelete: (entry: VaultEntry) => Promise<void>
  onCancel: () => void
}) {
  const initial = editing ?? prefill
  const [url, setUrl] = useState(initial?.url ?? '')
  const [title, setTitle] = useState(initial?.title ?? '')
  const [note, setNote] = useState(initial?.note ?? '')
  const [tags, setTags] = useState((initial?.tags ?? []).join(', '))
  const [matchMode, setMatchMode] = useState<MatchMode>(initial?.matchMode ?? 'site')
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const input: EntryInput = {
      url,
      title,
      note,
      tags: tags.split(/[,，]/),
      matchMode
    }
    let entry: VaultEntry
    try {
      entry = editing ? editEntry(editing, input) : createEntry(input, Date.now())
    } catch (e) {
      if (isCoreError(e, 'invalid-url')) return setError(t('errInvalidUrl'))
      throw e
    }
    const duplicate = findDuplicate(entries, entry, editing?.id)
    if (duplicate) return setError(t('errDuplicate', duplicate.title))
    setBusy(true)
    try {
      await onSave(entry, !editing)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col">
      <Header title={editing ? t('entryEditTitle') : t('entryAddTitle')} onBack={onCancel} />
      <form className="flex flex-col gap-3 p-3" onSubmit={submit}>
        <Field label={t('fieldUrl')} htmlFor="url" error={error}>
          <Input
            id="url"
            autoFocus={!initial?.url}
            spellCheck={false}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setError(null)
            }}
            placeholder="example.com"
          />
        </Field>
        <Field label={t('fieldTitle')} htmlFor="title">
          <Input id="title" autoFocus={!!initial?.url} value={title} onChange={(e) => setTitle(e.target.value)} />
        </Field>
        <Field label={t('fieldMatchMode')}>
          <RadioGroup value={matchMode} onValueChange={(v) => setMatchMode(v as MatchMode)} className="gap-2">
            <Label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="site" />
              {t('matchSite')}
            </Label>
            <Label className="flex items-center gap-2 text-sm font-normal">
              <RadioGroupItem value="exact" />
              {t('matchExact')}
            </Label>
          </RadioGroup>
        </Field>
        <Field label={t('fieldTags')} htmlFor="tags" hint={t('fieldTagsHint')}>
          <Input id="tags" value={tags} onChange={(e) => setTags(e.target.value)} />
        </Field>
        <Field label={t('fieldNote')} htmlFor="note">
          <Textarea id="note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>
        <div className="flex items-center gap-2 pt-1">
          {editing &&
            (confirmingDelete ? (
              <Button type="button" variant="destructive" size="sm" onClick={() => onDelete(editing)}>
                {t('confirmDelete')}
              </Button>
            ) : (
              <Button type="button" variant="ghost" size="sm" onClick={() => setConfirmingDelete(true)}>
                {t('delete')}
              </Button>
            ))}
          <span className="flex-1" />
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="submit" size="sm" disabled={busy || !url.trim()}>
            {t('save')}
          </Button>
        </div>
      </form>
    </div>
  )
}
