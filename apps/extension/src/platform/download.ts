/**
 * Saves text as a file via a blob URL and <a download>. Verified on Chrome:
 * the download completes even if the popup closes right after.
 */
export function downloadText(filename: string, text: string, type = 'application/json'): void {
  const url = URL.createObjectURL(new Blob([text], {type}))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  // Give the browser a moment to start the download before revoking.
  setTimeout(() => URL.revokeObjectURL(url), 60_000)
}

export function dateStamp(now = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}`
}
