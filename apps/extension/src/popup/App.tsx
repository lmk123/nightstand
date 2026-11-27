import {useCallback, useEffect, useRef, useState} from 'react'
import {
  activeEntries,
  changePassphrase,
  entrySiteHosts,
  hostOf,
  overlappingActiveEntries,
  recordOpen,
  removeEntry,
  addEntry,
  replaceEntry,
  resumeWidensScope,
  rotateRecoveryCode,
  setEntryIcons,
  setEntryPaused,
  updateSettings,
  widensScope,
  type DecoyConfig,
  type EntryInput,
  type StoredVault,
  type VaultData,
  type VaultEntry
} from '@nightstand/core'
import {removeBookmarksFor} from '@/platform/bookmarks'
import {findMissingIcons, withIcon} from '@/platform/favicon'
import {listText, t} from '@/platform/i18n'
import {isPopupNotice, sendToBackground} from '@/platform/messages'
import {loadLinks, loadShelf} from '@/platform/storage'
import {getActiveTab, openUrl} from '@/platform/tabs'
import {SaveCheck} from './components/SaveCheck'
import {SettingsLink, SettingsLinks} from './components/SettingsLink'
import {useOpenHelp} from './help'
import {commit, commitStored, openSession, syncIndex, type Session, type UnlockResult} from './session'
import {entryTitle} from './title'
import {Backup} from './views/Backup'
import {BookmarkImport} from './views/BookmarkImport'
import {Decoy} from './views/Decoy'
import {DecoySettings} from './views/DecoySettings'
import {EntryForm} from './views/EntryForm'
import {NewPassphrase} from './views/NewPassphrase'
import {Onboarding} from './views/Onboarding'
import {RecoveryCode} from './views/RecoveryCode'
import {Settings} from './views/Settings'
import {VaultList} from './views/VaultList'

type View =
  | {name: 'loading'}
  | {name: 'onboarding'}
  | {name: 'locked'}
  | {name: 'decoySettings'}
  /**
   * `paused`: entries paused while the list showed (newest first) that other
   * active entries still partly cover, for the overlap notice.
   */
  | {name: 'vault'; notice?: 'unsupportedTab' | 'saveCheck' | 'saveFailed'; paused?: string[]}
  | {name: 'entry'; editing?: VaultEntry; prefill?: EntryInput}
  | {name: 'settings'}
  | {name: 'resetPassphrase'}
  | {name: 'changePassphrase'}
  | {name: 'recoveryCode'}
  | {name: 'backup'}
  | {name: 'bookmarkImport'}

interface Boot {
  stored: StoredVault | null
  /** The stored vault exists but can't be read (damaged, or written by a newer build). */
  loadError: boolean
  links: DecoyConfig
}

/** Asks the background to delete existing history for these entries' sites / URLs / extra hosts. */
function purgeFor(...entries: VaultEntry[]) {
  const hosts: string[] = []
  const urls: string[] = []
  for (const entry of entries) {
    if (entry.matchMode === 'exact') urls.push(entry.url)
    hosts.push(...entrySiteHosts(entry))
  }
  if (hosts.length || urls.length) sendToBackground({type: 'purge', hosts, urls}).catch(console.error)
}

/**
 * Wipes what newly protected entries left behind: their history (in the
 * background) and their bookmarks, which would keep them in address-bar
 * suggestions.
 */
async function protect(entries: readonly VaultEntry[]) {
  if (entries.length === 0) return
  purgeFor(...entries)
  await removeBookmarksFor(entries).catch(console.error)
}

/**
 * Show the address-bar check: something is newly protected (`protectsNew`)
 * and the user hasn't opted out. Cleaning has missed suggestions before
 * (redirect hops, other domains), so it asks right away.
 */
function wantsSaveCheck(protectsNew: boolean, data: VaultData): boolean {
  return protectsNew && data.settings.skipSaveCheck !== true
}

/**
 * The active entries that still cover part of the paused entries `ids`, once
 * each. A resumed entry (or one no longer in the vault) adds none.
 */
function overlapping(data: VaultData, ids: readonly string[]): VaultEntry[] {
  const found = new Map<string, VaultEntry>()
  for (const id of ids) {
    if (data.entries.find((e) => e.id === id)?.paused !== true) continue
    for (const e of overlappingActiveEntries(data.entries, id)) found.set(e.id, e)
  }
  return [...found.values()]
}

export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null)
  const [session, setSessionState] = useState<Session | null>(null)
  const [view, setView] = useState<View>({name: 'loading'})
  const openHelp = useOpenHelp()
  // The latest session, for `update`: a render's `session` is stale as soon
  // as another commit lands.
  const sessionRef = useRef<Session | null>(null)
  const updates = useRef<Promise<unknown>>(Promise.resolve())

  const setSession = useCallback((next: Session | null) => {
    sessionRef.current = next
    setSessionState(next)
  }, [])

  useEffect(() => {
    ;(async () => {
      const links = await loadLinks()
      let stored: StoredVault | null = null
      let loadError = false
      try {
        stored = await loadShelf()
      } catch (error) {
        // Damaged or from a newer build. Never fall back to onboarding here:
        // that would overwrite the user's data.
        console.error(error)
        loadError = true
      }
      setBoot({stored, loadError, links})
      setView(stored || loadError ? {name: 'locked'} : {name: 'onboarding'})
    })().catch(console.error)
  }, [])

  // Panic: the background asks an open popup to close (closing = locking).
  useEffect(() => {
    const listener = (message: unknown) => {
      if (isPopupNotice(message)) window.close()
    }
    chrome.runtime.onMessage.addListener(listener)
    return () => chrome.runtime.onMessage.removeListener(listener)
  }, [])

  const lock = useCallback(() => {
    setSession(null)
    setView({name: 'locked'})
  }, [setSession])

  async function handleUnlocked(result: UnlockResult) {
    if (!boot?.stored) return
    let opened: Session
    try {
      opened = await openSession(boot.stored, result.dek)
    } catch (error) {
      // The secret was right but the contents can't be read (damaged, or
      // written by a newer build). Show the unreadable-data notice instead
      // of looking exactly like a wrong passphrase.
      console.error(error)
      setBoot((b) => (b ? {...b, loadError: true} : b))
      return
    }
    // Entries saved without an icon may have one cached by now (a visit
    // since). Done before the list shows, so no edit can race this commit.
    const icons = await findMissingIcons(opened.data.entries)
    if (icons.size > 0) {
      try {
        opened = await commit(opened, setEntryIcons(opened.data, icons))
        setBoot((b) => (b ? {...b, stored: opened.stored} : b))
      } catch (error) {
        console.error(error)
      }
    }
    // The background cleans with the stored match table and can't rebuild it
    // while locked: fix one that is missing, unreadable or out of date now.
    try {
      opened = await syncIndex(opened)
    } catch (error) {
      console.error(error)
    }
    setSession(opened)
    setView(result.via === 'recovery' ? {name: 'resetPassphrase'} : {name: 'vault'})
  }

  /**
   * Runs `step` on the latest session and adopts the session it wrote. Every
   * write of an unlocked vault goes through here, one at a time, each on the
   * result of the one before, so two quick changes (two switches in settings,
   * a new passphrase) can't overwrite each other. Resolves to the new
   * session, or null when the vault was locked meanwhile.
   */
  function enqueue(step: (current: Session) => Promise<Session>): Promise<Session | null> {
    const run = updates.current.then(async () => {
      const current = sessionRef.current
      if (!current) return null
      const saved = await step(current)
      // Locked (or replaced) while this was being written: don't bring it back.
      if (sessionRef.current !== current) return null
      setSession(saved)
      setBoot((b) => (b ? {...b, stored: saved.stored} : b))
      return saved
    })
    updates.current = run.catch(() => undefined)
    return run
  }

  /** Applies `change` to the latest vault data and commits it (see `enqueue`). */
  function update(change: (data: VaultData) => VaultData): Promise<Session | null> {
    return enqueue((current) => commit(current, change(current.data)))
  }

  async function openEntry(entry: VaultEntry) {
    if (!session) return
    // Only bookkeeping: failing to record it must not keep the site from opening.
    await update((data) => recordOpen(data, entry.id, Date.now())).catch(console.error)
    await openUrl(entry.url)
    window.close()
  }

  /** Replaces the passphrase wrap; true once written. */
  async function setPassphrase(passphrase: string): Promise<boolean> {
    const saved = await enqueue(async (current) =>
      commitStored(current, await changePassphrase(current.stored, current.dek, passphrase))
    )
    return saved !== null
  }

  /**
   * Pausing only takes the entry out of the match table. Resuming protects it
   * again like a save: the history and bookmarks gathered while it was paused
   * are wiped (the button says so), after capturing an icon if it still has
   * none, and the address-bar check follows if nothing else already covered it.
   */
  async function togglePause(entry: VaultEntry) {
    const resuming = entry.paused === true
    let saved: Session | null
    if (resuming) {
      const withCached = await withIcon(entry)
      saved = await update((data) =>
        setEntryPaused(withCached.icon ? setEntryIcons(data, new Map([[entry.id, withCached.icon]])) : data, entry.id, false)
      )
      if (!saved) return
      await protect([withCached])
    } else {
      saved = await update((data) => setEntryPaused(data, entry.id, true))
      if (!saved) return
    }
    const {data} = saved
    // Only if the list is still showing: don't pull the user out of another view.
    setView((current) => {
      if (current.name !== 'vault') return current
      // Other entries still covering part of a paused one keep covering and
      // cleaning that part: the notice says which, as the pause button
      // promises otherwise. Each pause's notice lasts while it still holds.
      const ids = resuming ? (current.paused ?? []) : [entry.id, ...(current.paused ?? []).filter((id) => id !== entry.id)]
      const paused = ids.filter((id) => overlapping(data, [id]).length > 0)
      // A pending address-bar check stays until dismissed.
      const check = current.notice === 'saveCheck' || (resuming && wantsSaveCheck(resumeWidensScope(data.entries, entry.id), data))
      return check ? {name: 'vault', notice: 'saveCheck', paused} : {name: 'vault', paused}
    })
  }

  async function addCurrentTab() {
    const tab = await getActiveTab()
    if (!tab || !hostOf(tab.url)) {
      setView({name: 'vault', notice: 'unsupportedTab'})
      return
    }
    setView({name: 'entry', prefill: {url: tab.url, title: tab.title}})
  }

  if (view.name === 'loading' || !boot) return null

  if (view.name === 'onboarding') {
    return (
      <Onboarding
        onDone={(created) => {
          setSession(created)
          setBoot({stored: created.stored, loadError: false, links: boot.links})
          setView({name: 'vault'})
        }}
      />
    )
  }

  if (view.name === 'decoySettings') {
    return (
      <DecoySettings
        config={boot.links}
        onChange={(links) => setBoot({...boot, links})}
        onBack={() => setView({name: 'locked'})}
      />
    )
  }

  if (!session || view.name === 'locked') {
    return (
      <Decoy
        links={boot.links.links}
        stored={boot.stored}
        loadError={boot.loadError}
        onUnlocked={handleUnlocked}
        onSettings={() => setView({name: 'decoySettings'})}
      />
    )
  }

  switch (view.name) {
    case 'vault': {
      // As the vault stands now, so renamed or resumed entries show as they are.
      const overlapTitles = overlapping(session.data, view.paused ?? []).map(entryTitle)
      return (
        <VaultList
          entries={session.data.entries}
          notice={
            view.notice === 'unsupportedTab' ? (
              <p role="status" className="bg-accent text-accent-foreground mx-3 mb-2 rounded-[10px] p-3 text-xs">
                {t('currentTabUnsupported')}
              </p>
            ) : view.notice === 'saveFailed' ? (
              <p role="alert" className="text-destructive mx-3 mb-2 text-xs">
                {t('errSaveFailed')}
              </p>
            ) : view.notice === 'saveCheck' ? (
              <SaveCheck
                onDismiss={async (skipFromNow) => {
                  if (skipFromNow) await update((data) => updateSettings(data, {skipSaveCheck: true}))
                  // An overlap notice that still holds shows again.
                  setView((current) => (current.name === 'vault' ? {name: 'vault', paused: current.paused} : current))
                }}
              />
            ) : overlapTitles.length > 0 ? (
              <p role="status" className="bg-accent text-accent-foreground mx-3 mb-2 rounded-[10px] p-3 text-xs">
                {t('pauseOverlap', listText(overlapTitles))}
              </p>
            ) : undefined
          }
          skipCoverNotice={session.data.settings.skipCoverNotice === true}
          onSkipCoverNotice={(skip) => update((data) => updateSettings(data, {skipCoverNotice: skip})).then(() => undefined, console.error)}
          onOpen={openEntry}
          onEdit={(entry) => setView({name: 'entry', editing: entry})}
          onTogglePause={(entry) =>
            void togglePause(entry).catch((error) => {
              console.error(error)
              // Not written: the row still shows its old state, and this says why.
              setView((current) => (current.name === 'vault' ? {...current, notice: 'saveFailed'} : current))
            })
          }
          onAddCurrent={addCurrentTab}
          onAddManual={() => setView({name: 'entry'})}
          onSettings={() => setView({name: 'settings'})}
          onLock={lock}
        />
      )
    }
    case 'entry':
      return (
        <EntryForm
          entries={session.data.entries}
          editing={view.editing}
          prefill={view.prefill}
          skipNotice={session.data.settings.skipSaveNotice === true}
          onCancel={() => setView({name: 'vault'})}
          onSave={async (saved, isNew, skipNoticeFromNow) => {
            // Before the purge below: Chrome drops a site's cached icon with its history.
            const entry = await withIcon(saved)
            const savedSession = await update((data) => {
              const next = isNew ? addEntry(data, entry) : replaceEntry(data, entry)
              return skipNoticeFromNow ? updateSettings(next, {skipSaveNotice: true}) : next
            })
            if (!savedSession) return
            // As saved: `replaceEntry` keeps a pause or resume that landed while the form was open.
            const stored = savedSession.data.entries.find((e) => e.id === entry.id) ?? entry
            // An edited paused entry stays paused and protects nothing yet:
            // resuming it cleans and asks for the check instead.
            if (stored.paused) return setView({name: 'vault'})
            await protect([stored])
            setView(wantsSaveCheck(widensScope(view.editing, stored), savedSession.data) ? {name: 'vault', notice: 'saveCheck'} : {name: 'vault'})
          }}
          onDelete={async (entry) => {
            await update((data) => removeEntry(data, entry.id))
            setView({name: 'vault'})
          }}
        />
      )
    case 'settings':
      return (
        <Settings
          settings={session.data.settings}
          onChange={async (patch) => void (await update((data) => updateSettings(data, patch)))}
          onBack={() => setView({name: 'vault'})}
        >
          <SettingsLinks>
            <SettingsLink onClick={() => setView({name: 'bookmarkImport'})}>{t('bmImportTitle')}</SettingsLink>
            <SettingsLink onClick={() => setView({name: 'backup'})}>{t('backupTitle')}</SettingsLink>
            <SettingsLink onClick={() => setView({name: 'changePassphrase'})}>{t('changePassTitle')}</SettingsLink>
            <SettingsLink onClick={() => setView({name: 'recoveryCode'})}>{t('recoveryTitle')}</SettingsLink>
            <SettingsLink onClick={() => openHelp()}>{t('faqTitle')}</SettingsLink>
          </SettingsLinks>
        </Settings>
      )
    case 'changePassphrase':
      return (
        <NewPassphrase
          title={t('changePassTitle')}
          hint={t('changePassHint')}
          onBack={() => setView({name: 'settings'})}
          onSubmit={async (passphrase) => {
            if (await setPassphrase(passphrase)) setView({name: 'settings'})
          }}
        />
      )
    case 'recoveryCode':
      return (
        <RecoveryCode
          onBack={() => setView({name: 'settings'})}
          onRotate={async () => {
            const issued: {code?: string} = {}
            const saved = await enqueue(async (current) => {
              const rotated = await rotateRecoveryCode(current.stored, current.dek)
              issued.code = rotated.recoveryCode
              return commitStored(current, rotated.stored)
            })
            return saved && issued.code ? issued.code : null
          }}
          onDone={() => setView({name: 'settings'})}
        />
      )
    case 'backup':
      return (
        <Backup
          session={session}
          onBack={() => setView({name: 'settings'})}
          onImported={async (merged) => {
            // Merged against this screen's data; nothing else changes the vault meanwhile.
            await update((data) => ({...data, entries: merged.entries}))
            await protect(activeEntries(merged.changed))
          }}
        />
      )
    case 'bookmarkImport':
      return (
        <BookmarkImport
          data={session.data}
          onBack={() => setView({name: 'settings'})}
          onImport={async (next, added) => {
            // Built from this screen's data; nothing else changes the vault meanwhile.
            await update(() => next)
            // Bookmarks are left alone: the screen has its own "delete originals" choice.
            purgeFor(...added)
          }}
        />
      )
    case 'resetPassphrase':
      return (
        <NewPassphrase
          title={t('resetPassTitle')}
          hint={t('resetPassHint')}
          onSubmit={async (passphrase) => {
            if (await setPassphrase(passphrase)) setView({name: 'vault'})
          }}
        />
      )
  }
}
