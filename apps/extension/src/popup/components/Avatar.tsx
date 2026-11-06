import {useEffect, useState} from 'react'
import {cn} from 'cn'
import {lookupIcon} from '@/platform/favicon'

const HUES = ['gray', 'blue', 'sky', 'rose', 'green', 'violet', 'amber', 'teal'] as const

const SIZE = {
  sm: {tile: 'size-7 rounded-lg text-[13px]', img: 'size-4'},
  lg: {tile: 'size-11 rounded-xl text-lg', img: 'size-6'}
}

/** A stable tint per title, so a list of letter tiles isn't one flat colour. */
function hueOf(text: string): (typeof HUES)[number] {
  let hash = 0
  for (const ch of text) hash = (hash * 31 + ch.codePointAt(0)!) >>> 0
  return HUES[hash % HUES.length]!
}

/** A letter tile, for sites without an icon. */
function LetterAvatar({text, size}: {text: string; size: keyof typeof SIZE}) {
  const letter = [...text.trim()][0]?.toUpperCase() ?? '·'
  return (
    <span className={cn('flex shrink-0 items-center justify-center font-semibold', SIZE[size].tile, `tile-${hueOf(text)}`)}>
      {letter}
    </span>
  )
}

function IconTile({src, size}: {src: string; size: keyof typeof SIZE}) {
  return (
    <span className={cn('bg-muted flex shrink-0 items-center justify-center', SIZE[size].tile)}>
      <img src={src} alt="" className={SIZE[size].img} draggable={false} />
    </span>
  )
}

/**
 * A site's icon, or a letter when there is none. `icon` is one captured
 * earlier (vault entries); otherwise, with `pageUrl`, Chrome's local icon
 * cache is asked (Quick Links). The tile stays blank while that answers, so
 * a letter doesn't flash before the icon.
 */
export function SiteAvatar({
  text,
  icon,
  pageUrl,
  size = 'sm'
}: {
  text: string
  icon?: string
  pageUrl?: string
  size?: keyof typeof SIZE
}) {
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

  if (icon) return <IconTile src={icon} size={size} />
  if (!pageUrl) return <LetterAvatar text={text} size={size} />
  if (found?.url !== pageUrl) return <span className={cn('shrink-0', SIZE[size].tile)} aria-busy="true" />
  return found.icon ? <IconTile src={found.icon} size={size} /> : <LetterAvatar text={text} size={size} />
}
