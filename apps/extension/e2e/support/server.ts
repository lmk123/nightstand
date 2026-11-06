import http from 'node:http'
import type {AddressInfo} from 'node:net'
import {crc32, deflateSync} from 'node:zlib'

/** A solid 16×16 PNG in this colour. */
export function solidPng([r, g, b]: [number, number, number]): Buffer {
  const chunk = (type: string, data: Buffer) => {
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
    const out = Buffer.alloc(body.length + 8)
    out.writeUInt32BE(data.length, 0)
    body.copy(out, 4)
    out.writeUInt32BE(crc32(body), body.length + 4)
    return out
  }
  const header = Buffer.alloc(13)
  header.writeUInt32BE(16, 0)
  header.writeUInt32BE(16, 4)
  header[8] = 8 // bit depth
  header[9] = 2 // truecolour
  const row = Buffer.from([0, ...Array.from({length: 16}, () => [r, g, b]).flat()])
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(Buffer.concat(Array.from({length: 16}, () => row)))),
    chunk('IEND', Buffer.alloc(0))
  ])
}

/**
 * Answers every request with a tiny page. Chrome maps all hosts to it with
 * --host-resolver-rules; Firefox uses it as an HTTP proxy. Either way
 * `http://example.com/...` becomes a real, recorded visit without network.
 *
 * `/js-redirect?…` answers with a script that replaces the location with its
 * `to` parameter (default `/landed`): a client redirect, whose first hop
 * Chrome records without the chain-end flag (hidden from `history.search`,
 * like a server redirect hop).
 *
 * `/iconic?rgb=r,g,b` is a page with a solid-colour icon (default red),
 * served from `/icon.png?rgb=…`; other pages have none. `&delay=ms` holds
 * the icon back that long, like a real network would.
 */
export async function startTestServer(): Promise<{port: number; close: () => Promise<void>}> {
  const server = http.createServer((req, res) => {
    // Chrome sends an absolute URL when the server doubles as its proxy.
    const url = new URL(req.url ?? '/', 'http://x')
    const rgb = (url.searchParams.get('rgb') ?? '255,0,0').split(',').map(Number) as [number, number, number]
    if (url.pathname === '/icon.png') {
      setTimeout(() => {
        res.writeHead(200, {'content-type': 'image/png'})
        res.end(solidPng(rgb))
      }, Number(url.searchParams.get('delay') ?? 0))
      return
    }
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
    if (url.pathname === '/iconic') {
      const icon = `/icon.png?${new URLSearchParams({rgb: rgb.join(','), delay: url.searchParams.get('delay') ?? '0'})}`
      res.end(`<!doctype html><title>iconic</title><link rel="icon" href="${icon}"><p>ok`)
      return
    }
    if (url.pathname === '/js-redirect') {
      const to = JSON.stringify(url.searchParams.get('to') ?? '/landed')
      res.end(`<!doctype html><script>location.replace(${to})</script>`)
      return
    }
    res.end(`<!doctype html><title>${req.headers.host ?? ''}${req.url ?? ''}</title><p>ok`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
