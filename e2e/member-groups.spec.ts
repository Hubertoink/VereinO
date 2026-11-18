import { _electron as electron, expect, test } from '@playwright/test'
import { mkdtemp, rm } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

test('member groups, selection across pages, recipients and history use the same organization data', async () => {
  const dir = await mkdtemp(path.join(os.tmpdir(), 'vereino-groups-'))
  const env = { ...process.env, ELECTRON_RENDERER_URL: pathToFileURL(path.resolve('dist/index.html')).href }
  delete (env as NodeJS.ProcessEnv).ELECTRON_RUN_AS_NODE
  const app = await electron.launch({ args: [path.resolve('dist-electron/main/index.cjs'), `--user-data-dir=${dir}`], env })
  try {
    const page = await app.firstWindow()
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1500, 900))
    await expect(page.getByRole('button', { name: 'Dashboard', exact: true })).toBeVisible({ timeout: 25000 })
    const later = page.getByRole('button', { name: 'Später einrichten', exact: true })
    await page.addLocatorHandler(later, () => later.click())
    const ids = await page.evaluate(async () => {
      localStorage.setItem('invite.activeOnly', '1')
      const ids: number[] = []
      for (let i = 1; i <= 52; i++) {
        const no = String(i).padStart(2, '0')
        const { id } = await window.api.members.create({ memberNo: no, name: 'Person ' + no, join_date: '2025-01-01',
          status: i === 1 ? 'PAUSED' : 'ACTIVE', email: i === 2 ? null : i === 3 ? 'POST1@example.org' : `post${i}@example.org`,
          ...(i === 4 ? { boardRole: 'V1', contribution_amount: 10, contribution_interval: 'MONTHLY' } : {}) })
        ids.push(id)
      }
      return ids
    })
    await page.locator('[data-shortcut-nav="Mitglieder"]').click()
    const select = (name: string) => page.getByRole('checkbox', { name, exact: true })
    const invite = page.getByRole('button', { name: 'Einladen (E-Mail)', exact: true })
    const bcc = page.getByLabel('Empfänger (BCC)', { exact: true })
    const groupBar = page.getByRole('region', { name: 'Mitgliedergruppen' })
    const table = page.locator('.members-table')
    await expect(select('Person 01 auswählen')).toBeEnabled()
    const tableOffset = () => table.evaluate(el => el.getBoundingClientRect().top - document.querySelector('.member-groups')!.getBoundingClientRect().top)
    const wideOffset = await tableOffset()
    await select('Person 01 auswählen').check()
    await expect(groupBar.getByRole('button', { name: 'Gruppe zuordnen' })).toBeVisible()
    expect(await tableOffset()).toBeCloseTo(wideOffset, 0)
    const rowCells = page.locator('.members-table tbody tr:first-child td, .members-board-table tbody tr:first-child td')
    const textSizes = () => rowCells.evaluateAll(cells => [...new Set(cells.map(el => getComputedStyle(el).fontSize))])
    expect(await textSizes()).toEqual(['12px'])
    await page.evaluate(() => document.documentElement.dataset.uiDensity = 'standard')
    expect(await textSizes()).toEqual(['16px'])
    await page.evaluate(() => document.documentElement.dataset.uiDensity = 'compact')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(800, 800))
    const menu = groupBar.getByRole('button', { name: '1 ausgewählt' })
    await expect(menu).toBeVisible()
    const narrowOffset = await tableOffset()
    await menu.click()
    await page.getByRole('dialog', { name: 'Auswahlaktionen' }).getByRole('button', { name: 'Auswahl aufheben' }).click()
    await expect(menu).toHaveCount(0)
    expect(await tableOffset()).toBeCloseTo(narrowOffset, 0)
    await select('Person 01 auswählen').check()
    await menu.click()
    await page.getByRole('dialog', { name: 'Auswahlaktionen' }).getByRole('button', { name: 'Einladen (1)', exact: true }).click()
    await expect(bcc).toHaveValue('post1@example.org')
    await page.keyboard.press('Escape')
    await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0].setContentSize(1500, 900))
    await select('Person 02 auswählen').check()
    await select('Person 03 auswählen').check()
    await invite.click()
    await expect(bcc).toHaveValue('post1@example.org')
    await expect(page.locator('.invite-stat-card').filter({ hasText: 'Ohne E-Mail' })).toContainText('1')
    await expect(page.getByRole('switch', { name: /Nur aktive/ })).toHaveCount(0)
    await page.keyboard.press('Escape')
    await page.getByRole('button', { name: 'Gruppe zuordnen', exact: true }).click()
    await page.getByLabel('Gruppenname').fill('Helferteam')
    await page.getByRole('button', { name: 'Zuordnen', exact: true }).click()
    const group = page.getByRole('button', { name: 'Helferteam', exact: true })
    await expect(groupBar.getByRole('table')).toHaveCount(0)
    await expect(group).toHaveAttribute('aria-pressed', 'false')
    await expect(group).toHaveCSS('background-color', 'rgba(0, 0, 0, 0)')
    const badgeBox = (await group.boundingBox())!
    const createBox = (await groupBar.getByRole('button', { name: 'Neue Gruppe' }).boundingBox())!
    expect(Math.abs((badgeBox.y + badgeBox.height / 2) - (createBox.y + createBox.height / 2))).toBeLessThan(2)
    await page.getByRole('button', { name: 'Dashboard', exact: true }).click()
    const expandSidebar = page.getByRole('button', { name: 'Seitenleiste ausklappen' })
    if (await expandSidebar.isVisible()) await expandSidebar.click()
    await page.getByRole('navigation', { name: 'Seitenleiste' }).getByRole('button', { name: /Helferteam.*3/ }).click()
    await expect(group).toHaveAttribute('aria-pressed', 'true')
    const activeColor = await group.evaluate(el => getComputedStyle(el).backgroundColor)
    expect(activeColor).not.toBe('rgba(0, 0, 0, 0)')
    await expect(page.locator('.members-table tbody tr')).toHaveCount(3)
    await select('Person 03 auswählen').check()
    await page.getByRole('button', { name: 'Aus Gruppe entfernen' }).click()
    await expect(page.locator('.members-table tbody tr')).toHaveCount(2)
    await invite.click()
    await expect(page.locator('.invite-stat-card').filter({ hasText: 'Gefilterte Mitglieder' })).toContainText('1')
    await page.getByRole('switch', { name: /Nur aktive/ }).uncheck()
    await expect(bcc).toHaveValue('post1@example.org')
    await page.keyboard.press('Escape')
    await select('Person 01 auswählen').check()
    await group.click()
    await expect(group).toHaveAttribute('aria-pressed', 'false')
    await expect(page.getByRole('group', { name: 'Mitgliederauswahl' })).toHaveCount(0)
    await select('Mitglieder dieser Seite auswählen').check()
    await page.getByTitle('Weiter', { exact: true }).click()
    await expect(select('Person 52 auswählen')).not.toBeChecked()
    await select('Person 52 auswählen').check()
    await page.getByTitle('Zurück', { exact: true }).click()
    await expect(select('Person 01 auswählen')).toBeChecked()
    await page.getByRole('button', { name: 'Alle 52 Treffer auswählen' }).click()
    await expect(page.getByRole('button', { name: 'Einladen (52)', exact: true })).toBeEnabled()
    await page.getByRole('button', { name: 'Gruppe zuordnen', exact: true }).click()
    await page.getByRole('combobox', { name: /Gruppe/ }).selectOption('new')
    await page.getByLabel('Gruppenname').fill('Verteiler')
    await page.getByRole('button', { name: 'Zuordnen', exact: true }).click()
    const distribution = groupBar.getByRole('button', { name: 'Verteiler', exact: true })
    await expect(distribution).toHaveAttribute('title', '52 Mitglieder')
    await distribution.click()
    await expect(page.locator('.members-table tbody tr')).toHaveCount(50)
    await group.click()
    await expect(distribution).toHaveAttribute('aria-pressed', 'false')
    await expect(group).toHaveCSS('background-color', activeColor)
    await expect(page.locator('.members-table tbody tr')).toHaveCount(2)
    const result = await page.evaluate(async ({ first, third }) => {
      const api = window.api.members
      const groups = await api.groups.list()
      const helperId = groups.find(g => g.name === 'Helferteam')!.id
      const count = (await api.history({ memberId: first })).rows.length
      const noop = await api.groups.change({ action: 'add', groupId: helperId, memberIds: [first, first] })
      const errors = []
      for (const change of [
        { action: 'create' as const, name: ' HELFERTEAM ', memberIds: [] },
        { action: 'create' as const, name: 'Rollback', memberIds: [first, 999999] }
      ]) {
        try { await api.groups.change(change) } catch { errors.push(change.name) }
      }
      const filters = { groupId: groups.find(g => g.name === 'Verteiler')!.id, q: 'Person', boardFilter: 'ANY' as const,
        intervalFilter: 'MONTHLY' as const, status: 'ACTIVE' as const, contributionFilter: 'DUE' as const }
      return { noop, errors, count, afterCount: (await api.history({ memberId: first })).rows.length, groups: await api.groups.list(),
        removal: (await api.history({ memberId: third })).rows.flatMap(r => r.changes),
        filtered: (await api.audience({ filters })).map(r => r.id), listed: (await api.list(filters)).rows.map(r => r.id) }
    }, { first: ids[0], third: ids[2] })
    expect(result.noop.changed).toBe(0)
    expect(result.errors).toHaveLength(2)
    expect(result.groups.map(g => g.memberCount)).toEqual([2, 52])
    expect(result.afterCount).toBe(result.count)
    expect(result.removal).toContainEqual({ field: 'groups', before: ['Helferteam'], after: [] })
    expect(result.filtered).toEqual([ids[3]])
    expect(result.listed).toEqual(result.filtered)
    await page.getByRole('button', { name: 'Filter', exact: true }).click()
    await page.getByLabel('Gruppe', { exact: true }).selectOption('none')
    await page.getByRole('button', { name: 'Übernehmen' }).click()
    await expect(page.locator('.members-table')).toContainText('Keine Einträge')
    await expect(group).toHaveAttribute('aria-pressed', 'false')
    await groupBar.getByRole('button', { name: 'Ohne Gruppe', pressed: true }).click()
    await expect(page.locator('.members-table tbody tr')).toHaveCount(50)
    await page.getByRole('button', { name: 'Neue Gruppe', exact: true }).click()
    await page.getByLabel('Gruppenname').fill('Jugend')
    await page.getByRole('button', { name: 'Gruppe erstellen' }).click()
    await expect(groupBar.getByRole('button', { name: 'Jugend', exact: true })).toHaveAttribute('title', '0 Mitglieder')
    await group.click({ button: 'right' })
    const editor = page.getByRole('dialog', { name: 'Helferteam', exact: true })
    await editor.getByRole('button', { name: 'Umbenennen' }).click()
    await editor.getByLabel('Gruppenname').fill('Verteiler')
    await editor.getByRole('button', { name: 'Speichern' }).click()
    await expect(editor.getByRole('alert')).toContainText('existiert bereits')
    await editor.getByLabel('Gruppenname').fill('Team West')
    await editor.getByRole('button', { name: 'Speichern' }).click()
    const renamed = groupBar.getByRole('button', { name: 'Team West', exact: true })
    await expect(renamed).toHaveAttribute('title', '2 Mitglieder')
    await renamed.click()
    const sidebarGroup = page.getByRole('navigation', { name: 'Seitenleiste' }).getByRole('button', { name: /Team West/ })
    await sidebarGroup.click({ button: 'right' })
    await page.getByRole('dialog', { name: 'Team West', exact: true }).getByRole('button', { name: 'Gruppe löschen' }).click()
    await page.getByRole('button', { name: 'Endgültig löschen' }).click()
    await expect(renamed).toHaveCount(0)
    await expect(sidebarGroup).toHaveCount(0)
    const acrossOrganizations = await page.evaluate(async () => {
      const original = (await window.api.organizations.active()).organization!
      const other = await window.api.organizations.create({ name: 'Projektbudget', profile: 'GENERAL' })
      await window.api.organizations.switch({ orgId: other.organization.id })
      const empty = await window.api.members.groups.list()
      const { id } = await window.api.members.create({ name: 'Projektleitung', memberNo: '01', join_date: '2025-01-01' })
      await window.api.members.groups.change({ action: 'create', name: 'Helferteam', memberIds: [id] })
      const general = await window.api.members.groups.list()
      await window.api.organizations.switch({ orgId: original.id })
      return { empty, general, original: await window.api.members.groups.list() }
    })
    expect(acrossOrganizations.empty).toEqual([])
    expect(acrossOrganizations.general).toMatchObject([{ name: 'Helferteam', memberCount: 1 }])
    expect(acrossOrganizations.original).toMatchObject([
      { name: 'Jugend', memberCount: 0 }, { name: 'Verteiler', memberCount: 52 }
    ])
  } finally {
    await app.close()
    await rm(dir, { recursive: true, force: true, maxRetries: 5 })
  }
})
