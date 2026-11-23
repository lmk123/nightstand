import {Zap} from 'lucide-react'
import {cn} from 'cn'
import {Button} from '@/components/ui/button'
import {t} from '@/platform/i18n'
import {usePrefs} from '../prefs'

/**
 * Enhanced mode (covering, and muting with it) as a header button on the
 * vault list. Not on the Quick Links screen: anyone at the locked popup could
 * turn it off there, which uncovers every protected tab already open. Only
 * its name here: the settings view explains it.
 */
export function CoverToggle() {
  const {prefs, failed, toggleCover} = usePrefs()
  // Unreadable: no button rather than one that never comes on (it is disabled only while loading).
  if (!prefs && failed) return null
  const on = prefs?.cover === true
  const label = t(on ? 'enhancedModeOn' : 'enhancedModeOff')
  return (
    <Button
      variant="ghost"
      size="icon-lg"
      className={cn('rounded-[10px]', on ? 'text-primary bg-primary/10 hover:bg-primary/15 hover:text-primary' : 'text-subtle-foreground')}
      disabled={!prefs}
      onClick={toggleCover}
      aria-label={t('enhancedMode')}
      aria-pressed={on}
      title={label}
    >
      <Zap fill={on ? 'currentColor' : 'none'} />
    </Button>
  )
}
