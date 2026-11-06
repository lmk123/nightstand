import {entryCoversUrl, type VaultEntry} from '@nightstand/core'

/**
 * `bookmarks` is an optional permission, requested only when the user asks
 * to check bookmarks or import from them.
 */
const PERMISSION: chrome.permissions.Permissions = {permissions: ['bookmarks']}

export function hasBookmarksPermission(): Promise<boolean> {
  return chrome.permissions.contains(PERMISSION)
}

/** Must be called from a user gesture. The popup may close while the browser asks. */
export function requestBookmarksPermission(): Promise<boolean> {
  return chrome.permissions.request(PERMISSION)
}

/** Bookmarks pointing at the entry's site (or exact URL). Requires the permission. */
export async function findBookmarksFor(entry: VaultEntry): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const tree = await chrome.bookmarks.getTree()
  const found: chrome.bookmarks.BookmarkTreeNode[] = []
  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
    for (const node of nodes) {
      if (node.url && entryCoversUrl(entry, node.url)) found.push(node)
      if (node.children) walk(node.children)
    }
  }
  walk(tree)
  return found
}

export async function removeBookmarks(ids: string[]): Promise<void> {
  for (const id of ids) await chrome.bookmarks.remove(id)
}
