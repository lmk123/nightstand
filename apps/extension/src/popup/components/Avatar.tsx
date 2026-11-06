import {useEffect, useState} from 'react'
import {lookupIcon} from '@/platform/favicon'

const TILE = 'flex size-7 shrink-0 items-center justify-center rounded-md'

/** A neutral letter tile, for sites without an icon. */
function LetterAvatar({text}: {text: string}) {
  const letter = [...text.trim()][0]?.toUpperCase() ?? '·'
  return <span className={`bg-accent text-accent-foreground text-xs font-medium ${TILE}`}>{letter}</span>
}

function IconTile({src}: {src: string}) {
  return (
    <span className={`bg-muted ${TILE}`}>
      <img src={src} alt="" className="size-4" draggable={false} />
    </span>
  )
}

/**
 * A site's icon, or a letter when there is none. `icon` is one captured
 * earlier (vault entries); otherwise, with `pageUrl`, Chrome's local icon
 * cache is asked (Quick Links). The tile stays blank while that answers, so
 * a letter doesn't flash before the icon.
 */
export function SiteAvatar({text, icon, pageUrl}: {text: string; icon?: string; pageUrl?: string}) {
  const [found, setFound] = useState<{url: string; icon: string | null} | null>(null)

  useEffect(() => {
    if (icon || !pageUrl) return
    let live = true
    lookupIcon(pageUrl).then((result) => {
      if (live) setFound({url: pageUrl, icon: result})
    }, console.error)
    return () => {
      live = false
    }
  }, [icon, pageUrl])

  if (icon) return <IconTile src={icon} />
  if (!pageUrl) return <LetterAvatar text={text} />
  if (found?.url !== pageUrl) return <span className={TILE} aria-busy="true" />
  return found.icon ? <IconTile src={found.icon} /> : <LetterAvatar text={text} />
}
