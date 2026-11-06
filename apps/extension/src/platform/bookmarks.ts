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

export interface BookmarkRow {
  id: string
  title: string
  /** Undefined for folders. */
  url?: string
  depth: number
  /** Ids of every http(s) bookmark at or below this row. */
  urlIds: string[]
}

/**
 * The bookmark tree flattened for a checkbox list: folders (that contain at
 * least one web bookmark) and web bookmarks, in tree order.
 */
export async function bookmarkRows(isWebUrl: (url: string) => boolean): Promise<BookmarkRow[]> {
  const [root] = await chrome.bookmarks.getTree()
  const rows: BookmarkRow[] = []
  const visit = (node: chrome.bookmarks.BookmarkTreeNode, depth: number): string[] => {
    if (node.url) {
      if (!isWebUrl(node.url)) return []
      rows.push({id: node.id, title: node.title || node.url, url: node.url, depth, urlIds: [node.id]})
      return [node.id]
    }
    const index = rows.length
    const ids = (node.children ?? []).flatMap((child) => visit(child, depth + 1))
    if (ids.length) rows.splice(index, 0, {id: node.id, title: node.title, depth, urlIds: ids})
    return ids
  }
  for (const child of root?.children ?? []) visit(child, 0)
  return rows
}
