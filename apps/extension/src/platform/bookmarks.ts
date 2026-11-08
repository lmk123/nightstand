import {entryCoversUrl, type VaultEntry} from '@nightstand/core'

/**
 * Bookmarks pointing at any of the entries' sites (or exact URLs). They would
 * keep showing up in address-bar suggestions, so saving an entry deletes them.
 */
async function findBookmarksCovered(entries: readonly VaultEntry[]): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  const tree = await chrome.bookmarks.getTree()
  const found: chrome.bookmarks.BookmarkTreeNode[] = []
  const walk = (nodes: chrome.bookmarks.BookmarkTreeNode[]) => {
    for (const node of nodes) {
      const url = node.url
      if (url && entries.some((entry) => entryCoversUrl(entry, url))) found.push(node)
      if (node.children) walk(node.children)
    }
  }
  walk(tree)
  return found
}

/** Bookmarks the entry covers: what saving it is about to delete. */
export function findBookmarksFor(entry: VaultEntry): Promise<chrome.bookmarks.BookmarkTreeNode[]> {
  return findBookmarksCovered([entry])
}

export async function removeBookmarks(ids: string[]): Promise<void> {
  for (const id of ids) await chrome.bookmarks.remove(id)
}

/** Deletes every bookmark any of the entries covers (one pass over the tree); returns how many. */
export async function removeBookmarksFor(entries: readonly VaultEntry[]): Promise<number> {
  const found = await findBookmarksCovered(entries)
  await removeBookmarks(found.map((b) => b.id))
  return found.length
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
      rows.push({id: node.id, title: node.title, url: node.url, depth, urlIds: [node.id]})
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
