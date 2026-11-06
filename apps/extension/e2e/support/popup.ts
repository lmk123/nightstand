import type {Page} from 'puppeteer-core'

// Helpers that act on the popup by its visible (zh_CN) text, like a user would.

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/**
 * Clicks the button with this exact label. Retries while React is still
 * re-rendering (a button found a moment ago may be detached when clicked).
 */
export async function clickText(page: Page, text: string): Promise<void> {
  const deadline = Date.now() + 5000
  let lastError: unknown
  while (Date.now() < deadline) {
    for (const button of await page.$$('button')) {
      const label = await button.evaluate((el) => el.textContent?.trim()).catch(() => undefined)
      if (label !== text) continue
      try {
        await button.click()
        return
      } catch (error) {
        lastError = error
      }
    }
    await sleep(100)
  }
  throw new Error(`button "${text}" not clickable: ${String(lastError ?? 'not found')}`)
}

export async function waitText(page: Page, text: string, timeout = 20_000): Promise<void> {
  await page.waitForFunction((text) => document.body.textContent?.includes(text), {timeout}, text)
}

export function hasText(page: Page, text: string): Promise<boolean> {
  return page.evaluate((text) => document.body.textContent?.includes(text) ?? false, text)
}

export async function clearAndType(page: Page, selector: string, text: string): Promise<void> {
  await page.click(selector, {clickCount: 3})
  await page.keyboard.press('Backspace')
  await page.type(selector, text)
}

/** Waits until every site tile has its icon or letter (Quick Links look icons up as they render). */
export async function waitIcons(page: Page): Promise<void> {
  await page.waitForFunction(() => !document.querySelector('ul li [aria-busy="true"]'))
}

/** The `src` of each list row's site icon, null for a letter tile. */
export async function rowIcons(page: Page): Promise<(string | null)[]> {
  await waitIcons(page)
  return page.$$eval('ul li', (items) => items.map((li) => li.querySelector('img')?.getAttribute('src') ?? null))
}

export function listItems(page: Page): Promise<string[]> {
  return page.$$eval('ul li', (items) => items.map((li) => li.textContent ?? ''))
}

export async function recoveryCodeOnScreen(page: Page): Promise<string> {
  const groups = await page.$$eval('code span', (spans) => spans.map((s) => s.textContent ?? ''))
  return groups.join('-')
}

/** Runs onboarding to the end and returns the recovery code that was shown. */
export async function onboard(page: Page, passphrase: string): Promise<string> {
  await clickText(page, '开始设置')
  await page.type('#pass', passphrase)
  await page.type('#pass2', passphrase)
  await clickText(page, '下一步')
  await waitText(page, '保存恢复码')
  const code = await recoveryCodeOnScreen(page)
  await page.click('[data-slot=checkbox]')
  await clickText(page, '下一步')
  await clickText(page, '完成')
  await waitText(page, '添加当前页')
  return code
}

/** Adds an entry through the form; `notice: false` when the save notice was turned off. */
export async function addEntry(
  page: Page,
  url: string,
  mode: 'site' | 'exact' = 'site',
  {notice = true}: {notice?: boolean} = {}
): Promise<void> {
  await clickText(page, '手动添加')
  await page.type('#url', url)
  if (mode === 'exact') {
    const radios = await page.$$('[data-slot=radio-group-item]')
    await radios[1]?.click()
  }
  await clickText(page, '保存')
  if (notice) await clickText(page, '确认保存')
  await waitText(page, '添加当前页')
}

/** Types into the decoy filter box (or classic lock screen), presses Enter, reports whether it unlocked. */
export async function submitUnlock(page: Page, secret: string, settleMs = 1200): Promise<boolean> {
  await clearAndType(page, 'input', secret)
  await page.keyboard.press('Enter')
  await sleep(settleMs)
  return hasText(page, '添加当前页')
}

export async function openSettings(page: Page, link?: string): Promise<void> {
  await page.click('button[aria-label="设置"]')
  if (link) await clickText(page, link)
}
