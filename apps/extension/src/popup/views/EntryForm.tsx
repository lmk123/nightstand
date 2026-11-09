import {useState} from 'react'
import {ChevronDown, ChevronUp, EyeOff, RefreshCw, Trash2} from 'lucide-react'
import {cn} from 'cn'
import {
  createEntry,
  editEntry,
  findDuplicate,
  isCoreError,
  isUntitled,
  parseExtraHosts,
  type EntryInput,
  type MatchMode,
  type Prefs,
  type VaultEntry,
  widensScope
} from '@nightstand/core'
import {Button} from '@/components/ui/button'
import {Checkbox} from '@/components/ui/checkbox'
import {Input} from '@/components/ui/input'
import {Label} from '@/components/ui/label'
import {Textarea} from '@/components/ui/textarea'
import {findBookmarksFor} from '@/platform/bookmarks'
import {countHistoryFor} from '@/platform/history'
import {t} from '@/platform/i18n'
import {loadPrefs} from '@/platform/storage'
import {ChoiceCards} from '../components/ChoiceCards'
import {Field} from '../components/Field'
import {Header} from '../components/Header'
import {buttonClass, fieldClass, mainButtonClass, outlineButtonClass} from '../components/styles'
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
  const [pending, setPending] = useState<{entry: VaultEntry; history: number; bookmarks: number; prefs: Prefs} | null>(null)
  const [dontShowAgain, setDontShowAgain] = useState(false)
  const [saveFailed, setSaveFailed] = useState(false)

  async function save(entry: VaultEntry, skipNoticeFromNow: boolean) {
    setBusy(true)
    setSaveFailed(false)
    try {
      await onSave(entry, !editing, skipNoticeFromNow)
    } catch (e) {
      // Nothing was protected: say so instead of leaving the form as it was.
      console.error(e)
      setPending(null)
      setSaveFailed(true)
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
    let prefs: Prefs
    try {
      ;[history, bookmarks, prefs] = await Promise.all([
        countHistoryFor(entry),
        findBookmarksFor(entry).then((found) => found.length),
        loadPrefs()
      ])
    } finally {
      setBusy(false)
    }
    // A new site / URL / extra host always gets the notice (it also explains
    // that future visits are cleaned). Editing only the title asks only when
    // something is there to delete, e.g. a bookmark added since.
    if (!widensScope(editing, entry) && history === 0 && bookmarks === 0) return save(entry, false)
    setDontShowAgain(false)
    setPending({entry, history, bookmarks, prefs})
  }

  return (
    <div className={cn('relative flex flex-col', pending && 'min-h-[460px]')}>
      <Header title={editing ? t('entryEditTitle') : t('entryAddTitle')} onBack={onCancel} />
      <form className="flex flex-col" onSubmit={submit}>
        {/* Locked while the notice is up, so the confirmed entry is what was shown. */}
        <fieldset disabled={!!pending} className="flex min-w-0 flex-col gap-4 p-4">
          <Field label={t('fieldUrl')} htmlFor="url" error={error}>
            <Input
              id="url"
              className={fieldClass}
              autoFocus={!initial?.url}
              spellCheck={false}
              aria-invalid={error ? true : undefined}
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
              className={fieldClass}
              autoFocus={!!initial?.url}
              placeholder={t('untitledEntry')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </Field>
          <Field label={t('fieldMatchMode')}>
            <ChoiceCards
              value={matchMode}
              onChange={setMatchMode}
              options={[
                {value: 'site', label: t('matchSite')},
                {value: 'exact', label: t('matchExact')}
              ]}
            />
            <HelpLink topic="matchMode" label="faqMatchLink" />
          </Field>
          <div className="panel grid grid-cols-1">
            <button
              type="button"
              className="focus-visible:ring-ring/50 flex min-h-11 items-center justify-between rounded-xl px-3 text-left text-[13px] font-medium outline-none focus-visible:ring-2"
              aria-expanded={extraOpen}
              aria-controls="extra-hosts"
              onClick={() => setExtraOpen((open) => !open)}
            >
              {t('fieldExtraHosts', String(parseExtraHosts(extraHosts).hosts.length))}
              {extraOpen ? (
                <ChevronUp className="text-muted-foreground size-4" aria-hidden />
              ) : (
                <ChevronDown className="text-muted-foreground size-4" aria-hidden />
              )}
            </button>
            {extraOpen && (
              <div className="grid grid-cols-1 gap-2 px-3 pb-3">
                <Textarea
                  id="extra-hosts"
                  aria-label={t('fieldExtraHosts', String(parseExtraHosts(extraHosts).hosts.length))}
                  rows={3}
                  spellCheck={false}
                  className="bg-background dark:bg-background rounded-lg px-3 font-mono text-xs leading-relaxed md:text-xs"
                  placeholder={'video.example.net\npay.example.org'}
                  aria-invalid={extraError ? true : undefined}
                  value={extraHosts}
                  onChange={(e) => {
                    setExtraHosts(e.target.value)
                    setExtraError(null)
                  }}
                />
                {extraError ? (
                  <p className="text-destructive text-xs">{extraError}</p>
                ) : (
                  <p className="text-muted-foreground text-xs leading-relaxed">{t('fieldExtraHostsHint')}</p>
                )}
              </div>
            )}
          </div>
          <div className="-mt-2">
            <HelpLink topic="extraHosts" label="faqExtraLink" />
          </div>
        </fieldset>
        {saveFailed && (
          <p role="alert" className="text-destructive px-4 pb-3 text-xs">
            {t('errSaveFailed')}
          </p>
        )}
        <footer className="border-line flex items-center gap-2 border-t p-3">
          {editing &&
            (confirmingDelete ? (
              <Button
                type="button"
                variant="destructive"
                className={buttonClass}
                onClick={() =>
                  onDelete(editing).catch((e: unknown) => {
                    console.error(e)
                    setSaveFailed(true)
                  })
                }
              >
                <Trash2 />
                {t('confirmDelete')}
              </Button>
            ) : (
              <Button
                type="button"
                variant="ghost"
                className={cn(buttonClass, 'text-destructive hover:text-destructive px-3')}
                onClick={() => setConfirmingDelete(true)}
              >
                <Trash2 />
                {t('delete')}
              </Button>
            ))}
          <span className="flex-1" />
          <Button type="button" variant="outline" className={cn(buttonClass, outlineButtonClass)} onClick={onCancel}>
            {t('cancel')}
          </Button>
          <Button type="submit" className={cn(buttonClass, 'px-5')} disabled={busy || !url.trim() || !!pending}>
            {t('save')}
          </Button>
        </footer>
      </form>
      {pending && (
        <>
          <div aria-hidden className="bg-scrim absolute inset-0" onClick={() => !busy && setPending(null)} />
          <section
            role="alertdialog"
            aria-labelledby="save-notice-title"
            className="bg-card absolute inset-x-0 bottom-0 grid grid-cols-1 max-h-full gap-3.5 overflow-y-auto rounded-t-[18px] px-4 pt-2.5 pb-4 shadow-[0_-8px_24px_rgb(0_0_0/0.14)]"
          >
            <span aria-hidden className="bg-input h-1 w-9 justify-self-center rounded-full" />
            <h2 id="save-notice-title" className="text-base font-semibold">
              {t('saveNoticeTitle')}
            </h2>
            <p className="text-subtle-foreground text-[13px] leading-relaxed">
              {/* No domains here: some are revealing on their own. */}
              {pending.entry.extraHosts.length > 0
                ? t(
                    pending.entry.matchMode === 'site' ? 'saveNoticeSiteExtra' : 'saveNoticeExactExtra',
                    String(pending.entry.extraHosts.length)
                  )
                : t(pending.entry.matchMode === 'site' ? 'saveNoticeSite' : 'saveNoticeExact')}
            </p>
            <ul className="grid grid-cols-2 gap-2">
              <li className="bg-muted rounded-xl p-3 text-[12.5px] leading-snug">{t('saveNoticeHistory', String(pending.history))}</li>
              <li className="bg-muted rounded-xl p-3 text-[12.5px] leading-snug">{t('saveNoticeBookmarks', String(pending.bookmarks))}</li>
            </ul>
            {/* The ongoing clean-up is the feature itself: keep it out of the small print. */}
            <p className="text-foreground flex items-start gap-2 text-[13px] leading-snug font-semibold">
              <RefreshCw className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
              {t('saveNoticeAutoClean')}
            </p>
            {/* So the first covered page isn't a surprise: only for pages not protected before, and only when the cover is on. */}
            {pending.prefs.cover && widensScope(editing, pending.entry) && (
              <p className="text-foreground flex items-start gap-2 text-[13px] leading-snug font-semibold">
                <EyeOff className="mt-0.5 size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
                {t(pending.prefs.mute ? 'saveNoticeCoverMute' : 'saveNoticeCover')}
              </p>
            )}
            <p className="text-muted-foreground text-xs leading-relaxed">{t('saveNoticeEffects')}</p>
            <Label className="text-subtle-foreground flex min-h-8 items-center gap-2 text-[13px] font-normal">
              <Checkbox checked={dontShowAgain} onCheckedChange={(v) => setDontShowAgain(v === true)} />
              {t('saveNoticeSkip')}
            </Label>
            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className={cn(mainButtonClass, outlineButtonClass)}
                disabled={busy}
                onClick={() => setPending(null)}
              >
                {t('saveNoticeBack')}
              </Button>
              <Button type="button" className={mainButtonClass} autoFocus disabled={busy} onClick={() => save(pending.entry, dontShowAgain)}>
                {t('saveNoticeConfirm')}
              </Button>
            </div>
          </section>
        </>
      )}
    </div>
  )
}
