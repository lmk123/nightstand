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
      {onBack && (
        <Button variant="ghost" size="icon-sm" onClick={onBack} aria-label={t('back')} title={t('back')}>
          <ArrowLeft />
        </Button>
      )}
      <h1 className={onBack ? 'flex-1 truncate text-sm font-medium' : 'flex-1 truncate px-1 text-sm font-medium'}>
        {title}
      </h1>
      {actions}
    </header>
  )
}
