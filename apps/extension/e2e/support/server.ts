import http from 'node:http'
import type {AddressInfo} from 'node:net'

/**
 * Answers every request with a tiny page. Chrome maps all hosts to it with
 * --host-resolver-rules; Firefox uses it as an HTTP proxy. Either way
 * `http://example.com/...` becomes a real, recorded visit without network.
 */
export async function startTestServer(): Promise<{port: number; close: () => Promise<void>}> {
  const server = http.createServer((req, res) => {
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
    res.end(`<!doctype html><title>${req.headers.host ?? ''}${req.url ?? ''}</title><p>ok`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}
