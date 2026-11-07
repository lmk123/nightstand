/**
 * Class strings shared by the popup views, layered over the shadcn
 * primitives (which stay as the CLI generated them). The popup is a small,
 * mostly mouse-driven surface, so controls are a little larger than the
 * shadcn defaults: 40px fields and buttons, 44px for a screen's main action.
 */

/** A text field: white (dark: raised) on the warm ground. */
export const fieldClass = 'h-10 rounded-[10px] bg-card px-3 text-sm md:text-sm dark:bg-card'

/** A regular button. */
export const buttonClass = 'h-10 rounded-[10px] px-4 text-[13px]'

/** The main action at the bottom of a screen. */
export const mainButtonClass = 'h-11 rounded-[10px] px-4 text-sm'

/** A button with a light border on a card background. */
export const outlineButtonClass = 'border-input bg-card dark:bg-card dark:border-input dark:hover:bg-muted'

/**
 * A view that fits the popup's height limit. Its scrolling body (min-h-0
 * overflow-y-auto) needs `*:shrink-0`: a flex child with its own overflow
 * (e.g. an `overflow-hidden` panel) would otherwise shrink and clip its
 * content instead of making the body scroll.
 */
export const viewClass = 'flex max-h-[580px] flex-col'
