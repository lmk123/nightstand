import {readdirSync, readFileSync} from 'node:fs'
import {join} from 'node:path'
import {afterAll, describe, expect, it} from 'vitest'
import {historyUrls, launchChrome, openPopup, type ChromeSession} from './support/chrome'
import {DIST_CHROMIUM, hasChrome} from './support/env'
import {
  addEntry,
  clearAndType,
  clickText,
  listItems,
  onboard,
  openSettings,
  recoveryCodeOnScreen,
  sleep,
  submitUnlock,
  waitText
} from './support/popup'
import {cleanupTemp, grantBookmarks, patchedCopy} from './support/temp'

describe.skipIf(!hasChrome)('backup, passphrase management, bookmarks (Chrome)', () => {
  // `bookmarks` pre-granted: automation can't accept the real permission prompt.
  const extension = hasChrome ? patchedCopy(DIST_CHROMIUM, {manifest: grantBookmarks}) : ''
  const sessions: ChromeSession[] = []
  let backupFile = ''

  async function start() {
    const s = await launchChrome({extension})
    sessions.push(s)
    return s
  }

  afterAll(async () => {
    for (const s of sessions) await s.browser.close()
    cleanupTemp()
  })

  it('exports an encrypted backup and a plaintext list (after a warning)', async () => {
    const s = await start()
    const p = await openPopup(s)
    await onboard(p, 'notes')
    await addEntry(p, 'example.com')
    await addEntry(p, 'https://example.org/p?q=1', 'exact')
    await openSettings(p, '备份与恢复')
    await clickText(p, '导出备份')
    await sleep(1000)
    const [name] = readdirSync(s.downloads)
    expect(name).toMatch(/^nightstand-\d{8}\.nightstand$/)
    backupFile = join(s.downloads, name ?? '')
    const text = readFileSync(backupFile, 'utf8')
    expect(JSON.parse(text).format).toBe('nightstand-backup')
    expect(text).not.toContain('example')

    await clickText(p, '导出未加密的列表…')
    await waitText(p, '导出的文件没有加密')
    await clickText(p, '我了解，仍然导出')
    await sleep(800)
    expect(readdirSync(s.downloads).some((f) => f.startsWith('nightstand-plaintext-'))).toBe(true)
    await p.close()
  })

  it('changes the passphrase and rotates the recovery code', async () => {
    const s = sessions[0]!
    let p = await openPopup(s)
    expect(await submitUnlock(p, 'notes')).toBe(true)
    await openSettings(p, '修改口令')
    await p.type('#np1', 'harbor')
    await p.type('#np2', 'harbor')
    await clickText(p, '保存')
    await waitText(p, '打开方式')
    await clickText(p, '重新生成恢复码')
    await clickText(p, '生成新的恢复码')
    await waitText(p, '只显示这一次')
    const newCode = await recoveryCodeOnScreen(p)
    await p.click('[data-slot=checkbox]')
    await clickText(p, '完成')
    await p.close()

    p = await openPopup(s)
    expect(await submitUnlock(p, 'notes')).toBe(false)
    await sleep(1100)
    expect(await submitUnlock(p, 'harbor')).toBe(true)
    await p.close()
    p = await openPopup(s)
    await submitUnlock(p, newCode)
    await waitText(p, '设置新口令')
    await p.close()
  })

  it('imports the backup into another profile, merging duplicates', async () => {
    const s = await start()
    const p = await openPopup(s)
    await onboard(p, 'other')
    await addEntry(p, 'example.net')
    await addEntry(p, 'www.example.com/dup')
    await openSettings(p, '备份与恢复')
    const [chooser] = await Promise.all([p.waitForFileChooser(), clickText(p, '选择备份文件')])
    await chooser.accept([backupFile])
    await waitText(p, '备份的口令或恢复码')
    await p.type('#secret', 'wrong')
    await clickText(p, '导入')
    await waitText(p, '口令或恢复码不正确')
    await clearAndType(p, '#secret', 'notes')
    await clickText(p, '导入')
    await waitText(p, '导入完成：新增 1 条，更新 0 条。')
    await p.close()

    const q = await openPopup(s)
    expect(await submitUnlock(q, 'other')).toBe(true)
    expect(await listItems(q)).toHaveLength(3)
    await q.close()
  })

  it('finds bookmarks of a newly added site and deletes them on request', async () => {
    const s = sessions[1]!
    await s.sw.evaluate(async () => {
      await chrome.bookmarks.create({parentId: '1', title: 'A', url: 'https://www.example.org/a'})
      await chrome.bookmarks.create({parentId: '1', title: 'B', url: 'https://blog.example.org/b'})
      await chrome.bookmarks.create({parentId: '1', title: 'Evil', url: 'https://evil-example.org/'})
    })
    const p = await openPopup(s)
    expect(await submitUnlock(p, 'other')).toBe(true)
    await clickText(p, '手动添加')
    await p.type('#url', 'example.org')
    await clickText(p, '保存')
    await waitText(p, '删除原书签')
    await clickText(p, '删除原书签')
    await waitText(p, '已删除 2 个书签')
    const left = await s.sw.evaluate(async () =>
      (await chrome.bookmarks.search({})).flatMap((b) => (b.url ? [b.url] : []))
    )
    expect(left).toEqual(['https://evil-example.org/'])
    await p.close()
  })

  it('imports a bookmark folder, deletes the originals and purges their history', async () => {
    const s = sessions[1]!
    await s.sw.evaluate(async () => {
      const folder = await chrome.bookmarks.create({parentId: '1', title: 'Reading'})
      await chrome.bookmarks.create({parentId: folder.id, title: 'Alpha', url: 'https://alpha.example/'})
      await chrome.bookmarks.create({parentId: folder.id, title: 'Beta', url: 'https://beta.example/x'})
      await chrome.bookmarks.create({parentId: '1', title: 'Keep me', url: 'https://keep.example/'})
      await chrome.history.addUrl({url: 'https://alpha.example/old'})
    })
    const p = await openPopup(s)
    expect(await submitUnlock(p, 'other')).toBe(true)
    await openSettings(p, '从浏览器书签导入')
    await waitText(p, 'Reading')
    const rows = await p.$$('ul li label')
    const titles = await Promise.all(rows.map((r) => r.evaluate((el) => el.textContent)))
    await rows[titles.findIndex((t) => t?.startsWith('Reading'))]?.click()
    await clickText(p, '导入所选（2）')
    await waitText(p, '已导入 2 条')
    const left = await s.sw.evaluate(async () =>
      (await chrome.bookmarks.search({})).flatMap((b) => (b.url ? [b.url] : []))
    )
    expect(left.sort()).toEqual(['https://evil-example.org/', 'https://keep.example/'])
    expect(await historyUrls(s)).not.toContain('https://alpha.example/old')
    await p.close()
  })
})
