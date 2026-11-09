export interface TabInfo {
  url: string
  title: string
}

export async function getActiveTab(): Promise<TabInfo | null> {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true})
  if (!tab?.url) return null
  return {url: tab.url, title: tab.title ?? ''}
}

/** Opens a saved site: always in a new tab. */
export async function openUrl(url: string): Promise<void> {
  await chrome.tabs.create({url})
}
