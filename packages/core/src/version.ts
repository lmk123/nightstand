/**
 * Compares two extension versions (`manifest.version`: up to four dot-separated
 * integers; a missing part counts as 0). Negative when `a` is older, positive
 * when newer, 0 when equal. A part that isn't a number counts as 0.
 */
export function compareVersions(a: string, b: string): number {
  const left = a.split('.')
  const right = b.split('.')
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const diff = versionPart(left[i]) - versionPart(right[i])
    if (diff !== 0) return Math.sign(diff)
  }
  return 0
}

function versionPart(part: string | undefined): number {
  const value = Number(part ?? 0)
  return Number.isInteger(value) && value >= 0 ? value : 0
}
