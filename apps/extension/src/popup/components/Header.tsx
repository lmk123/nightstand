import type {ReactNode} from 'react'
import {ArrowLeft} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {t} from '@/platform/i18n'

export function Header({
  title,
  onBack,
  actions
}: {
  title: ReactNode
  onBack?: () => void
  actions?: ReactNode
}) {
  return (
    <header className="flex h-11 items-center gap-1 border-b px-2">
      {onBack ? (
        // The arrow and the title form one back button, so the whole block is a click target.
        <h1 className="flex min-w-0 flex-1 text-sm font-medium">
          <Button
            variant="ghost"
            size="sm"
            onClick={onBack}
            aria-label={t('back')}
            title={t('back')}
            className="max-w-full shrink justify-start gap-1 px-2"
          >
            <ArrowLeft />
            <span className="truncate">{title}</span>
          </Button>
        </h1>
      ) : (
        <h1 className="flex-1 truncate px-1 text-sm font-medium">{title}</h1>
      )}
      {actions}
    </header>
  )
}
