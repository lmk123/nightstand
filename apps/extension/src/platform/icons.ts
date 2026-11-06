import type {IconSet} from '@nightstand/core'

const SIZES = [16, 32, 48, 128] as const

/** Paths of a bundled icon set (copied from public/icons/<set>/). */
export function iconPaths(set: IconSet): Record<string, string> {
  return Object.fromEntries(SIZES.map((size) => [String(size), `/icons/${set}/${size}.png`]))
}

/** Switches the toolbar icon. Browsers may forget this on restart, so the background re-applies it on startup. */
export function applyIcon(set: IconSet): Promise<void> {
  return chrome.action.setIcon({path: iconPaths(set)})
}
