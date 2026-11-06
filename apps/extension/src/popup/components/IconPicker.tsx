import {ICON_SETS, type DecoyConfig, type IconSet} from '@nightstand/core'
import {cn} from 'cn'
import {applyIcon, iconPaths} from '@/platform/icons'
import {t, type MessageKey} from '@/platform/i18n'
import {saveLinks} from '@/platform/storage'

const ICON_LABEL: Record<IconSet, MessageKey> = {
  nightstand: 'iconNightstand',
  book: 'iconBook',
  star: 'iconStar',
  grid: 'iconGrid'
}

/**
 * Toolbar icon choice. Lives in the Quick Links settings, which work while
 * locked: picking an ordinary-looking icon is itself an ordinary setting.
 */
export function IconPicker({links, onChange}: {links: DecoyConfig; onChange: (links: DecoyConfig) => void}) {
  async function choose(icon: IconSet) {
    const next = {...links, icon}
    await saveLinks(next)
    onChange(next)
    await applyIcon(icon)
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {ICON_SETS.map((icon) => {
        const chosen = links.icon === icon
        return (
          <button
            key={icon}
            type="button"
            onClick={() => choose(icon)}
            aria-pressed={chosen}
            className={cn(
              'focus-visible:ring-ring/50 flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-xl border text-xs outline-none focus-visible:ring-2',
              chosen ? 'border-primary bg-accent text-accent-foreground ring-primary ring-[0.5px]' : 'bg-card text-subtle-foreground hover:bg-muted'
            )}
          >
            <img src={iconPaths(icon)['32']} alt="" width={22} height={22} />
            {t(ICON_LABEL[icon])}
          </button>
        )
      })}
    </div>
  )
}
