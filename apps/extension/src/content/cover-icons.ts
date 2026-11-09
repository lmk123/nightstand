import type {IconSet} from '@nightstand/core'

/**
 * The toolbar icons as SVG shapes, so the cover's button can show the same
 * icon as the toolbar and the user sees what covered the page. Built with
 * `createElementNS` rather than markup or an `<img>`: nothing to load (no
 * `web_accessible_resources`, which would let pages detect the extension) and
 * no HTML parsing (pages with Trusted Types refuse `innerHTML`).
 *
 * Must match `icons-src/*.svg`: `tools/check-cover-icons.mjs` (in `lint`)
 * compares them.
 */
export type Shape = readonly [tag: 'rect' | 'path', attributes: Readonly<Record<string, string>>]

const rect = (x: number, y: number, width: number, height: number, rx: number, fill: string): Shape => [
  'rect',
  {x: String(x), y: String(y), width: String(width), height: String(height), rx: String(rx), fill}
]

export const SHAPES: Record<IconSet, readonly Shape[]> = {
  nightstand: [
    rect(12, 18, 104, 14, 5, '#3d5a4f'),
    rect(20, 32, 88, 72, 6, '#4f7264'),
    rect(30, 42, 68, 24, 4, '#dfe9e4'),
    rect(30, 72, 68, 24, 4, '#dfe9e4'),
    rect(54, 51, 20, 6, 3, '#3d5a4f'),
    rect(54, 81, 20, 6, 3, '#3d5a4f'),
    rect(26, 104, 12, 14, 3, '#3d5a4f'),
    rect(90, 104, 12, 14, 3, '#3d5a4f')
  ],
  book: [
    rect(22, 12, 86, 104, 8, '#3f5f8a'),
    rect(22, 12, 18, 104, 6, '#2f4a6e'),
    rect(52, 30, 42, 10, 5, '#e3ebf5'),
    rect(52, 48, 30, 8, 4, '#e3ebf5'),
    rect(34, 98, 74, 10, 3, '#f4f7fb')
  ],
  star: [
    [
      'path',
      {
        d: 'M64 10 L79.5 44.5 L117 48.5 L89 74 L97 111 L64 92 L31 111 L39 74 L11 48.5 L48.5 44.5 Z',
        fill: '#d49a2a',
        stroke: '#a87418',
        'stroke-width': '6',
        'stroke-linejoin': 'round'
      }
    ]
  ],
  grid: [
    rect(14, 14, 44, 44, 10, '#5b5f97'),
    rect(70, 14, 44, 44, 10, '#7a7fbf'),
    rect(14, 70, 44, 44, 10, '#7a7fbf'),
    rect(70, 70, 44, 44, 10, '#5b5f97')
  ]
}

/** The canvas every icon in `icons-src` is drawn on. */
export const VIEW_BOX = '0 0 128 128'

const SVG_NS = 'http://www.w3.org/2000/svg'

/** A fresh, decorative (aria-hidden) `<svg>` of the icon set. */
export function createIcon(set: IconSet): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg')
  svg.setAttribute('viewBox', VIEW_BOX)
  svg.setAttribute('aria-hidden', 'true')
  for (const [tag, attributes] of SHAPES[set]) {
    const shape = document.createElementNS(SVG_NS, tag)
    for (const [name, value] of Object.entries(attributes)) shape.setAttribute(name, value)
    svg.append(shape)
  }
  return svg
}
