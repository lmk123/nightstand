import {ICON_SETS, type DecoyConfig, type IconSet} from '@nightstand/core'
import {applyIcon, iconPaths} from '@/platform/icons'
import {t, type MessageKey} from '@/platform/i18n'
import {saveLinks} from '@/platform/storage'

const ICON_LABEL: Record<IconSet, MessageKey> = {
  nightstand: 'iconNightstand',
  book: 'iconBook',
  star: 'iconStar',
  grid: 'iconGrid'
}

/** Toolbar icon choice. Lives in the real (unlocked) settings only. */
export function IconPicker({links, onChange}: {links: DecoyConfig; onChange: (links: DecoyConfig) => void}) {
  async function choose(icon: IconSet) {
    const next = {...links, icon}
    await saveLinks(next)
    onChange(next)
    await applyIcon(icon)
  }

  return (
    <div className="grid grid-cols-4 gap-2">
      {ICON_SETS.map((icon) => (
        <button
          key={icon}
          type="button"
          onClick={() => choose(icon)}
          aria-pressed={links.icon === icon}
          className={
            'flex flex-col items-center gap-1 rounded-md border p-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ' +
            (links.icon === icon ? 'border-primary bg-accent' : 'hover:bg-muted')
          }
        >
          <img src={iconPaths(icon)['32']} alt="" width={24} height={24} />
          {t(ICON_LABEL[icon])}
        </button>
      ))}
    </div>
  )
}
