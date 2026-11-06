import {useCallback, useEffect, useState} from 'react'
import {
  hostOf,
  recordOpen,
  removeEntry,
  addEntry,
  replaceEntry,
  updateSettings,
  type DecoyConfig,
  type EntryInput,
  type StoredVault,
  type VaultEntry
} from '@nightstand/core'
import {t} from '@/platform/i18n'
import {isPopupNotice, sendToBackground} from '@/platform/messages'
import {loadLinks, loadShelf} from '@/platform/storage'
import {getActiveTab, isIncognitoAllowed, openUrl} from '@/platform/tabs'
import {BookmarkCheck} from './components/BookmarkCheck'
import {IncognitoHelp} from './components/IncognitoHelp'
import {commit, openSession, type Session, type UnlockResult} from './session'
import {EntryForm} from './views/EntryForm'
import {LockScreen} from './views/LockScreen'
import {NewPassphrase} from './views/NewPassphrase'
import {Onboarding} from './views/Onboarding'
import {Settings} from './views/Settings'
import {VaultList} from './views/VaultList'

type View =
  | {name: 'loading'}
  | {name: 'onboarding'}
  | {name: 'locked'}
  | {name: 'vault'; notice?: 'incognito' | 'unsupportedTab'; added?: VaultEntry}
  | {name: 'entry'; editing?: VaultEntry; prefill?: EntryInput}
  | {name: 'settings'}
  | {name: 'resetPassphrase'}

interface Boot {
  stored: StoredVault | null
  loadError: boolean
  links: DecoyConfig
}

/** Asks the background to delete existing history for an entry's site / URL. */
function purgeFor(entry: VaultEntry) {
  const host = entry.matchMode === 'site' ? hostOf(entry.url) : null
  const url = entry.matchMode === 'exact' ? entry.url : null
  sendToBackground({type: 'purge', hosts: host ? [host] : [], urls: url ? [url] : []}).catch(console.error)
}

export default function App() {
  const [boot, setBoot] = useState<Boot | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [view, setView] = useState<View>({name: 'loading'})

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

  if (!session || view.name === 'locked') {
    return <LockScreen stored={boot.stored} loadError={boot.loadError} onUnlocked={handleUnlocked} />
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
            ) : view.added ? (
              <div className="p-2 pb-0">
                <BookmarkCheck key={view.added.id} entry={view.added} onDismiss={() => setView({name: 'vault'})} />
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
          onCancel={() => setView({name: 'vault'})}
          onSave={async (entry, isNew) => {
            await update(isNew ? addEntry(session.data, entry) : replaceEntry(session.data, entry))
            purgeFor(entry)
            setView(isNew ? {name: 'vault', added: entry} : {name: 'vault'})
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
          onChange={(patch) => update(updateSettings(session.data, patch))}
          onBack={() => setView({name: 'vault'})}
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
