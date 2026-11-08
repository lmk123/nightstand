import type {ReactNode} from 'react'
import {CircleAlert} from 'lucide-react'
import {Label} from '@/components/ui/label'

export function Field({
  label,
  htmlFor,
  hint,
  error,
  children
}: {
  label: ReactNode
  htmlFor?: string
  hint?: ReactNode
  error?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="grid grid-cols-1 gap-1.5">
      <Label htmlFor={htmlFor} className="text-subtle-foreground text-xs font-semibold">
        {label}
      </Label>
      {children}
      {error ? (
        <p className="text-destructive flex items-center gap-1.5 text-xs">
          <CircleAlert className="size-3.5 shrink-0" aria-hidden />
          {error}
        </p>
      ) : hint ? (
        <p className="text-muted-foreground text-xs leading-relaxed">{hint}</p>
      ) : null}
    </div>
  )
}
