/**
 * URL normalization and host matching.
 *
 * - Hosts are compared after `URL` parsing, which lower-cases them and turns
 *   internationalized names into punycode; a single leading `www.` is dropped.
 * - `site` matching walks the visited host and each parent domain on label
 *   boundaries, so `evil-example.com` never matches `example.com`. Ports are
 *   ignored for `site`.
 * - `exact` matching compares the normalized URL without its fragment. The
 *   scheme is ignored (http and https of the same address are the same entry,
 *   so an http→https redirect is still caught); a non-default port is kept.
 *   A trailing slash on the path is ignored (`/a/` and `/a` are the same
 *   address); the query must still match exactly.
 * - Only http(s) URLs ever match.
 */

const SCHEME_RE = /^[a-z][a-z0-9+.-]*:\/\//i
const IPV4_RE = /^\d{1,3}(\.\d{1,3}){3}$/

/** Parses user input such as `example.com/foo`; adds `https://` when no scheme is given. */
export function parseUserUrl(input: string): URL | null {
  const trimmed = input.trim()
  if (!trimmed) return null
  return parseHttpUrl(SCHEME_RE.test(trimmed) ? trimmed : `https://${trimmed}`)
}

/** Parses an absolute URL, returning it only when it is http(s) with a host. */
export function parseHttpUrl(url: string): URL | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
  if (!parsed.hostname) return null
  return parsed
}

/** Lower-case, punycode, no trailing dot, no leading `www.`. Accepts a bare host or a `URL.hostname`. */
export function normalizeHost(host: string): string | null {
  const url = parseHttpUrl(`http://${host.trim()}`)
  if (!url) return null
  let hostname = url.hostname.replace(/\.$/, '')
  if (hostname.startsWith('www.') && hostname.length > 4) hostname = hostname.slice(4)
  return hostname || null
}

/** The normalized host of an http(s) URL, or null. */
export function hostOf(url: string): string | null {
  const parsed = parseHttpUrl(url)
  return parsed ? normalizeHost(parsed.hostname) : null
}

/**
 * Canonical form used for `exact` matching: normalized host, non-default
 * port, path without trailing slashes (the root stays `/`) and query; no
 * scheme, credentials or fragment.
 */
export function normalizeExactUrl(url: string): string | null {
  const parsed = parseHttpUrl(url)
  if (!parsed) return null
  const host = normalizeHost(parsed.hostname)
  if (!host) return null
  const port = parsed.port ? `:${parsed.port}` : ''
  const path = parsed.pathname.replace(/\/+$/, '') || '/'
  return `${host}${port}${path}${parsed.search}`
}

/**
 * Every form an `exact` entry for this URL may have been hashed under: the
 * canonical one, plus the same path with one trailing slash. Match tables
 * written before trailing slashes were ignored hashed the path as typed, and
 * the background cannot rebuild them while the vault is locked.
 */
export function exactCandidates(url: string): string[] {
  const canonical = normalizeExactUrl(url)
  if (!canonical) return []
  const queryAt = canonical.indexOf('?')
  const base = queryAt === -1 ? canonical : canonical.slice(0, queryAt)
  if (base.endsWith('/')) return [canonical]
  const query = queryAt === -1 ? '' : canonical.slice(queryAt)
  return [canonical, `${base}/${query}`]
}

function isIpLiteral(host: string): boolean {
  return IPV4_RE.test(host) || host.startsWith('[')
}

/**
 * The host itself followed by each parent domain, split on label boundaries:
 * `a.b.example.com` → `a.b.example.com`, `b.example.com`, `example.com`.
 * The bare top-level label is never a candidate; IP literals and single-label
 * hosts are returned as is.
 */
export function hostCandidates(host: string): string[] {
  if (isIpLiteral(host)) return [host]
  const labels = host.split('.')
  if (labels.length <= 1) return [host]
  const candidates: string[] = []
  for (let i = 0; i < labels.length - 1; i++) {
    candidates.push(labels.slice(i).join('.'))
  }
  return candidates
}
