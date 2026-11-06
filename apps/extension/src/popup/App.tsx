import {useCallback, useEffect, useState} from 'react'
import {
  entrySiteHosts,
  hostOf,
  recordOpen,
  removeEntry,
  addEntry,
  replaceEntry,
  updateSettings,
  widensScope,
  type DecoyConfig,
  type EntryInput,
  type StoredVault,
  type VaultEntry
} from '@nightstand/core'
import {removeBookmarksFor} from '@/platform/bookmarks'
import {t} from '@/platform/i18n'
import {isPopupNotice, sendToBackground} from '@/platform/messages'
import {loadLinks, loadShelf} from '@/platform/storage'
import {getActiveTab, isIncognitoAllowed, openUrl} from '@/platform/tabs'
import {IncognitoHelp} from './components/IncognitoHelp'
import {SaveCheck} from './components/SaveCheck'
import {SettingsLink} from './components/SettingsLink'
import {useOpenHelp} from './help'
import {commit, openSession, type Session, type UnlockResult} from './session'
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

export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [view, setView] = useState<View>({name: 'loading'})
  const openHelp = useOpenHelp()

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
  }, [])

  async function handleUnlocked(result: UnlockResult) {
    if (!boot?.stored) return
    const opened = await openSession(boot.stored, result.dek)
    setSession(opened)
    setView(result.via === 'recovery' ? {name: 'resetPassphrase'} : {name: 'vault'})
  }

  async function update(next: Session['data']) {
    if (!session) return
    const saved = await commit(session, next)
    setSession(saved)
    setBoot((b) => (b ? {...b, stored: saved.stored} : b))
  }

  async function openEntry(entry: VaultEntry) {
    if (!session) return
    const mode = session.data.settings.openMode
    if (mode === 'incognito' && !(await isIncognitoAllowed())) {
      setView({name: 'vault', notice: 'incognito'})
      return
    }
    await update(recordOpen(session.data, entry.id, Date.now()))
    await openUrl(entry.url, mode)
    window.close()
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
              <div className="p-2 pb-0">
                <IncognitoHelp />
              </div>
            ) : view.notice === 'unsupportedTab' ? (
              <p className="bg-accent text-accent-foreground m-2 mb-0 rounded-md p-2 text-xs">{t('currentTabUnsupported')}</p>
            ) : view.notice === 'saveCheck' ? (
              <div className="p-2 pb-0">
                <SaveCheck onDismiss={() => setView({name: 'vault'})} />
              </div>
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
          onSave={async (entry, isNew, skipNoticeFromNow) => {
            let next = isNew ? addEntry(session.data, entry) : replaceEntry(session.data, entry)
            if (skipNoticeFromNow) next = updateSettings(next, {skipSaveNotice: true})
            await update(next)
            purgeFor(entry)
            // Bookmarks would keep the site in address-bar suggestions.
            await removeBookmarksFor(entry).catch(console.error)
            // Cleaning has missed address-bar suggestions before (redirect
            // hops, other domains): ask the user to check it right away
            // whenever this save protects something new.
            setView(widensScope(view.editing, entry) ? {name: 'vault', notice: 'saveCheck'} : {name: 'vault'})
          }}
          onDelete={async (entry) => {
            await update(removeEntry(session.data, entry.id))
            setView({name: 'vault'})
          }}
        />
      )
    case 'settings':
      return (
        <Settings
          settings={session.data.settings}
          links={boot.links}
          onLinksChange={(links) => setBoot({...boot, links})}
          onChange={(patch) => update(updateSettings(session.data, patch))}
          onBack={() => setView({name: 'vault'})}
        >
          <section className="grid gap-1">
            <SettingsLink onClick={() => setView({name: 'bookmarkImport'})}>{t('bmImportTitle')}</SettingsLink>
            <SettingsLink onClick={() => setView({name: 'backup'})}>{t('backupTitle')}</SettingsLink>
            <SettingsLink onClick={() => setView({name: 'changePassphrase'})}>{t('changePassTitle')}</SettingsLink>
            <SettingsLink onClick={() => setView({name: 'recoveryCode'})}>{t('recoveryTitle')}</SettingsLink>
            <SettingsLink onClick={() => openHelp()}>{t('faqTitle')}</SettingsLink>
          </section>
        </Settings>
      )
    case 'changePassphrase':
      return (
        <NewPassphrase
          session={session}
          title={t('changePassTitle')}
          hint={t('changePassHint')}
          onBack={() => setView({name: 'settings'})}
          onDone={(saved) => {
            setSession(saved)
            setBoot({...boot, stored: saved.stored})
            setView({name: 'settings'})
          }}
        />
      )
    case 'recoveryCode':
      return (
        <RecoveryCode
          session={session}
          onBack={() => setView({name: 'settings'})}
          onDone={(saved) => {
            setSession(saved)
            setBoot({...boot, stored: saved.stored})
            setView({name: 'settings'})
          }}
        />
      )
    case 'backup':
      return (
        <Backup
          session={session}
          onBack={() => setView({name: 'settings'})}
          onImported={async (merged) => {
            await update({...session.data, entries: merged.entries})
            purgeFor(...merged.entries)
          }}
        />
      )
    case 'bookmarkImport':
      return (
        <BookmarkImport
          data={session.data}
          onBack={() => setView({name: 'settings'})}
          onImport={async (next, added) => {
            await update(next)
            purgeFor(...added)
          }}
        />
      )
    case 'resetPassphrase':
      return (
        <NewPassphrase
          session={session}
          title={t('resetPassTitle')}
          hint={t('resetPassHint')}
          onDone={(saved) => {
            setSession(saved)
            setBoot({...boot, stored: saved.stored})
            setView({name: 'vault'})
          }}
        />
      )
  }
}
