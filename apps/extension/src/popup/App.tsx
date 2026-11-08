import {useCallback, useEffect, useRef, useState} from 'react'
import {
  changePassphrase,
  entrySiteHosts,
  hostOf,
  recordOpen,
  removeEntry,
  addEntry,
  replaceEntry,
  rotateRecoveryCode,
  setEntryIcons,
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
import {t} from '@/platform/i18n'
import {isPopupNotice, sendToBackground} from '@/platform/messages'
import {loadLinks, loadShelf} from '@/platform/storage'
import {getActiveTab, isIncognitoAllowed, openUrl} from '@/platform/tabs'
import {IncognitoHelp} from './components/IncognitoHelp'
import {SaveCheck} from './components/SaveCheck'
import {SettingsLink, SettingsLinks} from './components/SettingsLink'
import {useOpenHelp} from './help'
import {commit, commitStored, openSession, syncIndex, type Session, type UnlockResult} from './session'
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
  | {name: 'vault'; notice?: 'incognito' | 'unsupportedTab' | 'saveCheck'}
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
    const mode = session.data.settings.openMode
    if (mode === 'incognito' && !(await isIncognitoAllowed())) {
      setView({name: 'vault', notice: 'incognito'})
      return
    }
    // Only bookkeeping: failing to record it must not keep the site from opening.
    await update((data) => recordOpen(data, entry.id, Date.now())).catch(console.error)
    await openUrl(entry.url, mode)
    window.close()
  }

  /** Replaces the passphrase wrap; true once written. */
  async function setPassphrase(passphrase: string): Promise<boolean> {
    const saved = await enqueue(async (current) =>
      commitStored(current, await changePassphrase(current.stored, current.dek, passphrase))
    )
    return saved !== null
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
    case 'vault':
      return (
        <VaultList
          entries={session.data.entries}
          notice={
            view.notice === 'incognito' ? (
              <div className="px-3 pb-2">
                <IncognitoHelp />
              </div>
            ) : view.notice === 'unsupportedTab' ? (
              <p role="status" className="bg-accent text-accent-foreground mx-3 mb-2 rounded-[10px] p-3 text-xs">
                {t('currentTabUnsupported')}
              </p>
            ) : view.notice === 'saveCheck' ? (
              <SaveCheck
                onDismiss={async (skipFromNow) => {
                  if (skipFromNow) await update((data) => updateSettings(data, {skipSaveCheck: true}))
                  setView({name: 'vault'})
                }}
              />
            ) : undefined
          }
          onOpen={openEntry}
          onEdit={(entry) => setView({name: 'entry', editing: entry})}
          onAddCurrent={addCurrentTab}
          onAddManual={() => setView({name: 'entry'})}
          onSettings={() => setView({name: 'settings'})}
          onLock={lock}
        />
      )
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
            await protect([entry])
            // Cleaning has missed address-bar suggestions before (redirect
            // hops, other domains): ask the user to check it right away
            // whenever this save protects something new, unless they opted out.
            const check = widensScope(view.editing, entry) && savedSession.data.settings.skipSaveCheck !== true
            setView(check ? {name: 'vault', notice: 'saveCheck'} : {name: 'vault'})
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
            await protect(merged.changed)
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
