import {useState} from 'react'
import {ChevronDown, ChevronRight} from 'lucide-react'
import {
  createEntry,
  editEntry,
  findDuplicate,
  isCoreError,
  isUntitled,
  parseExtraHosts,
  type EntryInput,
  type MatchMode,
  type VaultEntry,
  widensScope
} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {RadioGroup, RadioGroupItem} from '@/components/ui/radio-group'
import {Textarea} from '@/components/ui/textarea'
import {findBookmarksFor} from '@/platform/bookmarks'
import {countHistoryFor} from '@/platform/history'
import {t} from '@/platform/i18n'
import {Field} from '../components/Field'
import {Header} from '../components/Header'
import {HelpLink} from '../help'
import {entryTitle} from '../title'

/**
 * Short add/edit form. Unsaved changes are simply dropped when the popup
 * closes — drafts are never persisted (that would put plaintext on disk).
 *
 * Saving wipes the entry's existing history and deletes its bookmarks right
 * away, so unless the user opted out, "save" first shows a notice with what
 * exactly will be deleted, and it has to be confirmed.
 */
export function EntryForm({
  entries,
  editing,
  prefill,
  skipNotice,
  onSave,
  onDelete,
  onCancel
}: {
  entries: VaultEntry[]
  editing?: VaultEntry
  prefill?: EntryInput
  /** The user ticked "don't show again" on the save notice earlier. */
  skipNotice: boolean
  /** `skipNoticeFromNow`: the user just ticked "don't show again". */
  onSave: (entry: VaultEntry, isNew: boolean, skipNoticeFromNow: boolean) => Promise<void>
  onDelete: (entry: VaultEntry) => Promise<void>
  onCancel: () => void
}) {
  const initial = editing ?? prefill
  const [url, setUrl] = useState(initial?.url ?? '')
  const [title, setTitle] = useState(editing && isUntitled(editing) ? '' : (initial?.title ?? ''))
  const [matchMode, setMatchMode] = useState<MatchMode>(initial?.matchMode ?? 'site')
  const [extraHosts, setExtraHosts] = useState((initial?.extraHosts ?? []).join('\n'))
  const [extraOpen, setExtraOpen] = useState(false)
  const [extraError, setExtraError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmingDelete, setConfirmingDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  /** Validated entry waiting for the user to confirm the notice, with what saving it deletes. */
  const [pending, setPending] = useState<{entry: VaultEntry; history: number; bookmarks: number} | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)

  async function save(entry: VaultEntry, skipNoticeFromNow: boolean) {
    setBusy(true)
    try {
      await onSave(entry, !editing, skipNoticeFromNow)
    } finally {
      setBusy(false)
    }
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault()
    const extra = parseExtraHosts(extraHosts)
    if (extra.invalid.length > 0) {
      setExtraOpen(true)
      return setExtraError(t('errExtraHost', extra.invalid.join(' ')))
    }
    const input: EntryInput = {url, title, matchMode, extraHosts: extra.hosts}
    let entry: VaultEntry
    try {
      entry = editing ? editEntry(editing, input) : createEntry(input, Date.now())
    } catch (e) {
      if (isCoreError(e, 'invalid-url')) return setError(t('errInvalidUrl'))
      throw e
    }
    const duplicate = findDuplicate(entries, entry, editing?.id)
    if (duplicate) return setError(t('errDuplicate', entryTitle(duplicate)))
    if (skipNotice) return save(entry, false)
    setBusy(true)
    let history: number
    let bookmarks: number
    try {
      ;[history, bookmarks] = await Promise.all([
        countHistoryFor(entry),
        findBookmarksFor(entry).then((found) => found.length)
      ])
    } finally {
      setBusy(false)
    }
    // A new site / URL / extra host always gets the notice (it also explains
    // that future visits are cleaned). Editing only the title asks only when
    // something is there to delete, e.g. a bookmark added since.
    if (!widensScope(editing, entry) && history === 0 && bookmarks === 0) return save(entry, false)
    setDontShowAgain(false)
    setPending({entry, history, bookmarks})
  }

  return (
    <div className="flex flex-col">
      <Header title={editing ? t('entryEditTitle') : t('entryAddTitle')} onBack={onCancel} />
      <form className="flex flex-col gap-3 p-3" onSubmit={submit}>
        {/* Locked while the notice is up, so the confirmed entry is what was shown. */}
        <fieldset disabled={!!pending} className="flex min-w-0 flex-col gap-3">
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
            <Input
              id="title"
              autoFocus={!!initial?.url}
              placeholder={t('untitledEntry')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
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
            <HelpLink topic="matchMode" label="faqMatchLink" />
          </Field>
          <div className="grid gap-1.5">
            <button
              type="button"
              className="text-foreground flex w-fit items-center gap-1 text-xs font-medium"
              aria-expanded={extraOpen}
              aria-controls="extra-hosts"
              onClick={() => setExtraOpen((open) => !open)}
            >
              {extraOpen ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />}
              {t('fieldExtraHosts', String(parseExtraHosts(extraHosts).hosts.length))}
            </button>
            {extraOpen && (
              <>
                <Textarea
                  id="extra-hosts"
                  rows={3}
                  spellCheck={false}
                  placeholder={'video.example.net\npay.example.org'}
                  value={extraHosts}
                  onChange={(e) => {
                    setExtraHosts(e.target.value)
                    setExtraError(null)
                  }}
                />
                {extraError ? (
                  <p className="text-destructive text-xs">{extraError}</p>
                ) : (
                  <p className="text-muted-foreground text-xs">{t('fieldExtraHostsHint')}</p>
                )}
                <HelpLink topic="extraHosts" label="faqExtraLink" />
              </>
            )}
          </div>
        </fieldset>
        {pending ? (
          <div role="alertdialog" aria-labelledby="save-notice-title" className="bg-accent text-accent-foreground grid gap-2 rounded-md p-3 text-xs leading-relaxed">
            <p id="save-notice-title" className="font-medium">
              {t('saveNoticeTitle')}
            </p>
            <p>
              {/* No domains here: some are revealing on their own. */}
              {pending.entry.extraHosts.length > 0
                ? t(
                    pending.entry.matchMode === 'site' ? 'saveNoticeSiteExtra' : 'saveNoticeExactExtra',
                    String(pending.entry.extraHosts.length)
                  )
                : t(pending.entry.matchMode === 'site' ? 'saveNoticeSite' : 'saveNoticeExact')}
            </p>
            <ul className="list-disc pl-4">
              <li>{t('saveNoticeHistory', String(pending.history))}</li>
              <li>{t('saveNoticeBookmarks', String(pending.bookmarks))}</li>
            </ul>
            <p>{t('saveNoticeEffects')}</p>
            <Label className="flex items-center gap-2 text-xs font-normal">
              <Checkbox checked={dontShowAgain} onCheckedChange={(v) => setDontShowAgain(v === true)} />
              {t('saveNoticeSkip')}
            </Label>
            <div className="flex items-center gap-2">
              <span className="flex-1" />
              <Button type="button" variant="ghost" size="sm" disabled={busy} onClick={() => setPending(null)}>
                {t('saveNoticeBack')}
              </Button>
              <Button type="button" size="sm" autoFocus disabled={busy} onClick={() => save(pending.entry, dontShowAgain)}>
                {t('saveNoticeConfirm')}
              </Button>
            </div>
          </div>
        ) : (
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
        )}
      </form>
    </div>
  )
}
