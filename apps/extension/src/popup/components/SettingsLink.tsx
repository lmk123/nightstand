import type {ReactNode} from 'react'
import {ChevronRight} from 'lucide-react'

/** A group of rows that each lead to another view. */
export function SettingsLinks({children}: {children: ReactNode}) {
  return <nav className="panel divide-line grid grid-cols-1 divide-y overflow-hidden">{children}</nav>
}

export function SettingsLink({onClick, children}: {onClick: () => void; children: ReactNode}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="hover:bg-muted/60 focus-visible:bg-muted flex min-h-[46px] items-center justify-between gap-3 px-3 text-left text-[13px] outline-none"
    >
      {children}
      <ChevronRight className="text-muted-foreground size-4" aria-hidden />
    </button>
  )
}
