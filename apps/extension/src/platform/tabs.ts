import type {OpenMode} from '@nightstand/core'
import {sendToBackground} from './messages'

export interface TabInfo {
  url: string
  title: string
}

export async function getActiveTab(): Promise<TabInfo | null> {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true})
  if (!tab?.url) return null
  return {url: tab.url, title: tab.title ?? ''}
}

export function isIncognitoAllowed(): Promise<boolean> {
  return chrome.extension.isAllowedIncognitoAccess()
}

/**
 * Opens a URL the way the user chose. Incognito windows are opened by the
 * background so the window id is recorded even though the popup closes.
 */
export async function openUrl(url: string, mode: OpenMode): Promise<void> {
  switch (mode) {
    case 'current':
      await chrome.tabs.update({url})
      break
    case 'newTab':
      await chrome.tabs.create({url})
      break
    case 'incognito':
      await sendToBackground({type: 'openIncognito', url})
      break
  }
}
