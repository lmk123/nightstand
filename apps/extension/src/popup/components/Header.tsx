import type {ReactNode} from 'react'
import {ChevronLeft} from 'lucide-react'
import {Button} from '@/components/ui/button'
import {t} from '@/platform/i18n'

export function Header({
  title,
  onBack,
  actions,
  bordered = true
}: {
  title: ReactNode
  onBack?: () => void
  actions?: ReactNode
  /** A hairline under the header; the vault list goes without (its search box follows). */
  bordered?: boolean
}) {
  return (
    <header className={'flex h-[52px] shrink-0 items-center gap-1 px-2 ' + (bordered ? 'border-line border-b' : '')}>
      {onBack ? (
        // The arrow and the title form one back button, so the whole block is a click target.
        <h1 className="flex min-w-0 flex-1 text-[15px] font-semibold">
          <Button
            variant="ghost"
            onClick={onBack}
            aria-label={t('back')}
            title={t('back')}
            className="max-w-full shrink justify-start gap-1.5 rounded-lg pr-2.5 pl-1.5 text-[15px] font-semibold [&_svg:not([class*='size-'])]:size-[18px]"
          >
            <ChevronLeft />
            <span className="truncate">{title}</span>
          </Button>
        </h1>
      ) : (
        <h1 className="flex min-w-0 flex-1 items-center gap-2 truncate px-2.5 text-[15px] font-semibold">{title}</h1>
      )}
      {actions}
    </header>
  )
}
