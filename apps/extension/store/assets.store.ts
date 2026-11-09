import {mkdirSync, readFileSync, rmSync, writeFileSync} from 'node:fs'
import http from 'node:http'
import type {AddressInfo} from 'node:net'
import {join} from 'node:path'
import {fileURLToPath} from 'node:url'
import {Resvg} from '@resvg/resvg-js'
import type {Page} from 'puppeteer-core'
import {afterAll, beforeAll, describe, it} from 'vitest'
import {launchChrome, type ChromeSession} from '../e2e/support/chrome'
import {DIST_CHROMIUM, hasChrome} from '../e2e/support/env'
import {clickText, hasText, sleep, waitIcons, waitText} from '../e2e/support/popup'
import {cleanupTemp, patchedCopy} from '../e2e/support/temp'
import {COPY, LOCALES, type Caption, type Locale, type ShotName, type Site} from './copy'

// Chrome Web Store images, rendered from the real build: the popup is driven
// like a user would (onboarding, saving sites, locking) in a Chrome whose
// every host resolves to a local server, so the sites below are made up and
// nothing goes over the network. Each popup capture is then laid out on a
// 1280×800 canvas with a caption. Output: dist/store/.

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const OUT = join(ROOT, 'dist', 'store')
const PASSPHRASE = 'tea garden notes'
const BRAND_SVG = readFileSync(join(ROOT, 'icons-src', 'nightstand.svg'), 'utf8')
const BRAND_PNG = `data:image/png;base64,${readFileSync(join(ROOT, 'public', 'icons', 'nightstand', '128.png')).toString('base64')}`

const FONT = `-apple-system, BlinkMacSystemFont, "PingFang SC", "Hiragino Sans GB", "Segoe UI", "Microsoft YaHei", sans-serif`
const INK = '#1f3029'
const MUTED = '#4c5d55'
const PAPER = '#efeae0'
const GREEN = '#3d5a4f'

type Messages = Record<string, {message: string}>

function messages(locale: Locale): (key: string) => string {
  const all = JSON.parse(readFileSync(join(ROOT, '_locales', locale, 'messages.json'), 'utf8')) as Messages
  return (key) => {
    const text = all[key]?.message
    if (text === undefined) throw new Error(`no message ${key} in ${locale}`)
    return text
  }
}

function iconSvg(site: Site): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><text x="32" y="54" font-size="54" text-anchor="middle">${site.emoji}</text></svg>`
}

/** Serves every host: a page titled after the site, with its emoji icon. */
async function startSiteServer(sites: Site[]) {
  const byHost = new Map(sites.map((s) => [s.host, s]))
  const server = http.createServer((req, res) => {
    const host = (req.headers.host ?? '').replace(/:\d+$/, '')
    const site = byHost.get(host)
    const path = new URL(req.url ?? '/', 'http://x').pathname
    if (path === '/icon.svg' && site) {
      res.writeHead(200, {'content-type': 'image/svg+xml'})
      res.end(iconSvg(site))
      return
    }
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'})
    res.end(`<!doctype html><meta charset="utf-8"><title>${site?.title ?? host}</title><link rel="icon" href="/icon.svg"><p>ok`)
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  return {
    port: (server.address() as AddressInfo).port,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

/** Visits these pages side by side and stays until Chrome has cached their icons. */
async function visitAll(s: ChromeSession, urls: string[]) {
  await Promise.all(
    urls.map(async (url) => {
      const page = await s.browser.newPage()
      await page.goto(url)
      await sleep(2000)
      await page.close()
    })
  )
}

async function openPopupPage(s: ChromeSession): Promise<Page> {
  const page = await s.browser.newPage()
  await page.setViewport({width: 360, height: 600, deviceScaleFactor: 2})
  // Store images use the light theme, whatever this machine's setting is.
  await page.emulateMediaFeatures([{name: 'prefers-color-scheme', value: 'light'}])
  await page.goto(`chrome-extension://${s.extId}/action/index.html`)
  await page.waitForSelector('#root > *')
  return page
}

/** The popup as it would look: its own height, at most the popup's 600px. */
async function capture(page: Page): Promise<string> {
  await page.addStyleTag({content: '* { caret-color: transparent !important }'})
  await sleep(1000)
  const height = await page.evaluate(() => Math.ceil(document.getElementById('root')!.getBoundingClientRect().height))
  const png = await page.screenshot({type: 'png', clip: {x: 0, y: 0, width: 360, height: Math.min(600, height)}})
  return `data:image/png;base64,${Buffer.from(png).toString('base64')}`
}

/** Renders an HTML page of exactly this size to a PNG file. */
async function render(s: ChromeSession, file: string, width: number, height: number, body: string, css: string) {
  const page = await s.browser.newPage()
  await page.setViewport({width, height, deviceScaleFactor: 1})
  await page.setContent(
    `<!doctype html><meta charset="utf-8"><style>
      * { box-sizing: border-box; margin: 0 }
      body { width: ${width}px; height: ${height}px; overflow: hidden; position: relative; font-family: ${FONT}; color: ${INK}; background: ${PAPER} }
      ${css}
    </style><body>${body}</body>`
  )
  await page.evaluate(() => Promise.all([...document.images].map((img) => img.decode())))
  await page.screenshot({path: file as `${string}.png`, type: 'png'})
  await page.close()
}

const escape = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;')

/** The caption on the left of every screenshot. */
const captionHtml = (caption: Caption) =>
  `<div class="copy">
     <div class="brand"><img src="${BRAND_PNG}">Nightstand</div>
     <h1>${escape(caption.title)}</h1>
     <p>${escape(caption.body)}</p>
   </div>`

const CAPTION_CSS = `.copy { position: absolute; left: 88px; top: 0; bottom: 0; width: 500px; display: flex; flex-direction: column; justify-content: center; gap: 22px }
  .brand { display: flex; align-items: center; gap: 12px; font-size: 20px; font-weight: 600; color: ${GREEN} }
  .brand img { width: 36px; height: 36px }
  h1 { font-size: 44px; line-height: 1.2; font-weight: 700; text-wrap: balance; white-space: pre-line }
  p { font-size: 21px; line-height: 1.6; color: ${MUTED}; text-wrap: pretty }`

/** The browser window on the right of every screenshot, and its toolbar. */
const WINDOW_CSS = `.window { position: absolute; left: 650px; right: 0; top: 56px; bottom: 0; overflow: hidden; background: #fbfaf7; border-radius: 16px 0 0 0; box-shadow: 0 24px 70px rgb(31 48 41 / 0.16) }
  .bar { height: 56px; display: flex; align-items: center; gap: 14px; padding: 0 20px; background: #f1f2f0; border-bottom: 1px solid #e2e4e1 }
  .dot { width: 12px; height: 12px; border-radius: 50%; background: #d6d9d5 }
  .omni { flex: 1; height: 34px; border-radius: 17px; background: #fff; border: 1px solid #dde0dc }
  .ext { width: 36px; height: 36px; border-radius: 50%; background: #dde7e2; display: grid; place-items: center }
  .ext img { width: 22px; height: 22px }
  .me { width: 28px; height: 28px; border-radius: 50%; background: #c9d3ce }`

const TOOLBAR = `<div class="omni"></div><div class="ext"><img src="${BRAND_PNG}"></div><div class="me"></div>`

/** The page area of the cover screenshot's window: below a 44px tab strip and the 56px toolbar. */
const PAGE_WIDTH = 1280 - 650
const PAGE_HEIGHT = 800 - 56 - 44 - 56

/** A muted-speaker glyph, like the one on a muted tab. */
const MUTED_SVG = `<svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="${MUTED}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M2.5 6h2.5l3.5-3v10l-3.5-3h-2.5z" fill="${MUTED}"/><path d="M11 6l4 4M15 6l-4 4"/></svg>`

/** A browser corner with the popup open under the toolbar icon, next to the caption. */
async function renderScreenshot(s: ChromeSession, file: string, popup: string, popupHeight: number, caption: Caption) {
  const top = 124
  const scale = Math.min(1.4, (800 - top - 28) / popupHeight)
  await render(
    s,
    file,
    1280,
    800,
    `${captionHtml(caption)}
     <div class="window"><div class="bar">
       <i class="dot"></i><i class="dot"></i><i class="dot"></i>
       ${TOOLBAR}
     </div></div>
     <img class="popup" src="${popup}" style="width:${360 * scale}px">`,
    `${CAPTION_CSS}
     ${WINDOW_CSS}
     .dot:nth-child(3) { margin-right: 8px }
     .popup { position: absolute; right: 52px; top: ${top}px; border-radius: 12px; box-shadow: 0 0 0 1px rgb(0 0 0 / 0.06), 0 18px 48px rgb(31 48 41 / 0.28) }`
  )
}

/**
 * A browser window showing a covered page: the tab strip shows the neutral
 * title the page script swapped in and the muted tab; the site's own icon stays
 * on the tab, as it does in the browser.
 */
async function renderCoverScreenshot(s: ChromeSession, file: string, page: string, site: Site, title: string, caption: Caption) {
  await render(
    s,
    file,
    1280,
    800,
    `${captionHtml(caption)}
     <div class="window">
       <div class="tabs">
         <i class="dot"></i><i class="dot"></i><i class="dot"></i>
         <div class="tab"><span class="favicon">${site.emoji}</span><span class="title">${escape(title)}</span>${MUTED_SVG}</div>
       </div>
       <div class="bar">${TOOLBAR}</div>
       <img class="page" src="${page}">
     </div>`,
    `${CAPTION_CSS}
     ${WINDOW_CSS}
     .tabs { height: 44px; display: flex; align-items: flex-end; gap: 8px; padding: 0 20px; background: #e2e5e1 }
     .tabs .dot { align-self: center; margin-top: 2px }
     .tabs .dot:nth-child(3) { margin-right: 18px }
     .tab { width: 240px; height: 36px; display: flex; align-items: center; gap: 10px; padding: 0 14px; background: #f1f2f0; border-radius: 10px 10px 0 0; font-size: 14px }
     .favicon { font-size: 16px; line-height: 1 }
     .tab .title { flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis }
     .page { display: block; width: ${PAGE_WIDTH}px; height: ${PAGE_HEIGHT}px }`
  )
}

async function renderPromos(s: ChromeSession, locale: Locale, dir: string, decoy: string) {
  const {tagline} = COPY[locale]
  await render(
    s,
    join(dir, 'promo-small-440x280.png'),
    440,
    280,
    `<div class="mark"><img src="${BRAND_PNG}"></div><h1>Nightstand</h1><p>${escape(tagline)}</p>`,
    `body { background: linear-gradient(140deg, #557a6b, #2f463d); color: #fff; display: flex; flex-direction: column; justify-content: center; padding: 0 40px; gap: 10px }
     .mark { width: 64px; height: 64px; border-radius: 16px; background: ${PAPER}; display: grid; place-items: center; margin-bottom: 6px }
     .mark img { width: 46px; height: 46px }
     h1 { font-size: 36px; font-weight: 700 }
     p { font-size: 18px; line-height: 1.4; opacity: 0.88 }`
  )
  await render(
    s,
    join(dir, 'promo-marquee-1400x560.png'),
    1400,
    560,
    `<div class="copy"><div class="mark"><img src="${BRAND_PNG}"></div><h1>Nightstand</h1><p>${escape(tagline)}</p></div>
     <img class="popup" src="${decoy}">`,
    `body { background: linear-gradient(140deg, #557a6b, #2f463d); color: #fff }
     .copy { position: absolute; left: 110px; top: 0; bottom: 0; width: 640px; display: flex; flex-direction: column; justify-content: center; gap: 16px }
     .mark { width: 88px; height: 88px; border-radius: 22px; background: ${PAPER}; display: grid; place-items: center; margin-bottom: 8px }
     .mark img { width: 64px; height: 64px }
     h1 { font-size: 64px; font-weight: 700 }
     p { font-size: 30px; line-height: 1.4; opacity: 0.9 }
     .popup { position: absolute; right: 120px; top: 72px; width: 468px; border-radius: 14px; box-shadow: 0 24px 60px rgb(0 0 0 / 0.35) }`
  )
}

/** The store icon: 96px of artwork centred in 128px, as the store asks. */
function renderStoreIcon(file: string) {
  const inner = BRAND_SVG.replace(/^[\s\S]*?<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '')
  // The artwork spans x 12–116, y 18–118 of its 128 box: centre it and fit 96px.
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128"><g transform="translate(64 64) scale(0.92) translate(-64 -68)">${inner}</g></svg>`
  writeFileSync(file, new Resvg(svg, {fitTo: {mode: 'width', value: 128}}).render().asPng())
}

async function shoot(locale: Locale) {
  const m = messages(locale)
  const {links, saved, shots} = COPY[locale]
  const dir = join(OUT, locale)
  mkdirSync(dir, {recursive: true})
  const server = await startSiteServer([...links, ...saved])
  const s = await launchChrome({extension: patchedCopy(DIST_CHROMIUM, {onlyLocale: locale}), serverPort: server.port})
  try {
    const url = (site: Site) => `http://${site.host}/`
    await s.sw.evaluate(
      (config) => chrome.storage.local.set({links: config}),
      {version: 1, icon: 'nightstand', links: links.map((l, i) => ({id: `l${i}`, title: l.title, url: url(l)}))}
    )
    const jobs = saved.find((site) => site.host === 'jobs.example')!
    await visitAll(s, [
      ...links.map(url),
      ...saved.map(url),
      ...Array.from({length: 13}, (_, i) => `${url(jobs)}openings/${i + 1}`)
    ])
    await s.sw.evaluate(
      async (bookmarks) => {
        for (const b of bookmarks) await chrome.bookmarks.create({parentId: '1', ...b})
      },
      [
        {title: jobs.title, url: url(jobs)},
        {title: jobs.title, url: `${url(jobs)}openings/3`}
      ]
    )

    const p = await openPopupPage(s)
    await clickText(p, m('onbStart'))
    await p.type('#pass', PASSPHRASE)
    await p.type('#pass2', PASSPHRASE)
    await clickText(p, m('next'))
    await waitText(p, m('onbCodeTitle'))
    await p.click('[data-slot=checkbox]')
    await clickText(p, m('next'))
    await clickText(p, m('onbFinish'))
    await waitText(p, m('addCurrentTab'))

    const captures = new Map<ShotName, {src: string; height: number}>()
    const keep = async (name: ShotName) => {
      const src = await capture(p)
      const height = await p.evaluate(() => Math.min(600, Math.ceil(document.getElementById('root')!.getBoundingClientRect().height)))
      captures.set(name, {src, height})
    }

    for (const site of saved) {
      await clickText(p, m('addManually'))
      await p.type('#url', site.host)
      await p.type('#title', site.title)
      if (site.host === 'rings.example') {
        await p.click('[aria-controls="extra-hosts"]')
        await p.type('#extra-hosts', 'checkout.example\nimages.rings-cdn.example')
        await keep('form')
      }
      await clickText(p, m('save'))
      await waitText(p, m('saveNoticeTitle'))
      if (site === jobs) await keep('notice')
      await clickText(p, m('saveNoticeConfirm'))
      await waitText(p, m('addCurrentTab'))
      if (await hasText(p, m('saveCheckDismiss'))) await clickText(p, m('saveCheckDismiss'))
    }

    const rows = await p.$$('ul li > button:first-child')
    await rows[1]?.click()
    await keep('vault')

    // A saved site, opened after it was saved: the page script covers it.
    const coverSite = saved.find((site) => site.host === 'gifts.example')!
    const tab = await s.browser.newPage()
    await tab.setViewport({width: PAGE_WIDTH, height: PAGE_HEIGHT, deviceScaleFactor: 2})
    await tab.emulateMediaFeatures([{name: 'prefers-color-scheme', value: 'light'}])
    await tab.goto(url(coverSite))
    await tab.waitForSelector(':root > dialog:modal')
    await sleep(500)
    const coverTitle = await tab.title()
    const coverPng = `data:image/png;base64,${Buffer.from(await tab.screenshot({type: 'png'})).toString('base64')}`
    await tab.close()
    await p.bringToFront()

    await p.click(`button[aria-label="${m('lock')}"]`)
    await waitText(p, m('popupTitle'))
    await waitIcons(p)
    await keep('decoy')

    for (const [i, [name, caption]] of shots.entries()) {
      const file = join(dir, `screenshot-${i + 1}-${name}.png`)
      if (name === 'cover') {
        await renderCoverScreenshot(s, file, coverPng, coverSite, coverTitle, caption)
        continue
      }
      const shot = captures.get(name)!
      await renderScreenshot(s, file, shot.src, shot.height, caption)
    }
    await renderPromos(s, locale, dir, captures.get('decoy')!.src)
  } finally {
    await s.browser.close()
    await server.close()
  }
}

describe.skipIf(!hasChrome)('Chrome Web Store images', () => {
  // Start empty: screenshots are numbered, so a reordered set would leave stale files behind.
  beforeAll(() => {
    rmSync(OUT, {recursive: true, force: true})
    mkdirSync(OUT, {recursive: true})
  })
  afterAll(() => cleanupTemp())

  it('store icon', () => renderStoreIcon(join(OUT, 'icon-128.png')))
  for (const locale of LOCALES) it(`screenshots and promo tiles (${locale})`, () => shoot(locale))
})
