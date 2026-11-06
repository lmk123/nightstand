import {createContext, useContext, useState, type ReactNode} from 'react'
import {CircleHelp} from 'lucide-react'
import {t, type MessageKey} from '@/platform/i18n'
import {Faq, type FaqTopic} from './views/Faq'

const OpenHelp = createContext<(topic?: FaqTopic) => void>(() => {})

/** Opens the FAQ, optionally at one topic. */
export function useOpenHelp() {
  return useContext(OpenHelp)
}

/**
 * Shows the FAQ on top of whatever view is open. The view underneath stays
 * mounted (only hidden), so in-memory state such as half-finished onboarding
 * or an unsaved entry survives a look at the FAQ — nothing is persisted.
 */
export function HelpProvider({children}: {children: ReactNode}) {
  const [open, setOpen] = useState<{topic?: FaqTopic} | null>(null)
  return (
    <OpenHelp.Provider value={(topic) => setOpen({topic})}>
      <div hidden={open !== null}>{children}</div>
      {open && <Faq initial={open.topic} onBack={() => setOpen(null)} />}
    </OpenHelp.Provider>
  )
}

/** Small "?" link to one FAQ topic. */
export function HelpLink({topic, label}: {topic: FaqTopic; label: MessageKey}) {
  const openHelp = useOpenHelp()
  return (
    <button
      type="button"
      onClick={() => openHelp(topic)}
      className="text-muted-foreground hover:text-foreground inline-flex items-center gap-1 justify-self-start rounded-sm text-xs underline-offset-2 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <CircleHelp className="size-3.5" />
      {t(label)}
    </button>
  )
}
