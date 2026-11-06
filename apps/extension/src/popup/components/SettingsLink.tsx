import type {ReactNode} from 'react'
import {ChevronRight} from 'lucide-react'

export function SettingsLink({onClick, children}: {onClick: () => void; children: ReactNode}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-muted flex items-center justify-between rounded-md px-2 py-2 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      {children}
      <ChevronRight className="text-muted-foreground size-4" />
    </button>
  )
}
