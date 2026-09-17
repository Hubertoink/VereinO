// Original settings controls with isolated API state; no real server writes.
import assert from 'node:assert/strict'
import { chromium } from 'playwright'
const browser = await chromium.launch({
  headless: true,
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
  args: ['--disable-dev-shm-usage', '--disable-gpu']
})
const base = process.env.WEB_TEST_URL || 'http://localhost:5174'
try {
  for (const role of ['ADMIN', 'EDITOR', 'USER']) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } })
    const errors = []
    page.on('pageerror', (error) => errors.push(error.message))
    let preferences = {
      version: 0,
      themeMode: 'dark',
      colorTheme: 'default',
      navLayout: 'left',
      navIconColorMode: 'color'
    }
    let modules = {version:0,visibleNavItems:['Dashboard','Buchungen','Dauerbuchungen','Bankimport','Belege','Mitglieder','Budgets','Zweckbindungen','Reports','KI','Einreichungen','Einstellungen']}
    let organization = { name: 'Testverein', version: 1 }
    let workflow = { version: 0, bookingView: 'plus', showBookingDraftTabs: false, showBookingEditTabs: false, bookingEntryPresentation: 'flyout', allowVoucherDeletion: false, quickAddAfterSave: 'close' }
    let table = { version: 0, dateFormat: 'de', journalRowStyle: 'both', journalRowDensity: 'normal', journalLimit: 50, columns: { actions: true, date: true, voucherNo: false, type: true, sphere: true, description: true, note: true, earmark: true, budget: true, paymentMethod: true, attachments: true, net: false, vat: false, gross: true }, columnOrder: ['actions', 'date', 'type', 'sphere', 'description', 'note', 'earmark', 'budget', 'paymentMethod', 'attachments', 'gross', 'voucherNo', 'net', 'vat'] }
    const users = [
      { id: 1, email: 'team@example.test', role, organizationId: 1, isActive: true },
      { id: 2, email: 'other@example.test', role: 'USER', organizationId: 1, isActive: true }
    ]
    let passwordChanged = false
    let preferencesReadDelay = 0
    const calls = []
    await page.route('**/api/**', async (route) => {
      const req = route.request(),
        path = new URL(req.url()).pathname
      if(path==='/api/settings/modules'){if(req.method()==='PATCH'){assert.equal(role,'ADMIN');modules={...req.postDataJSON(),version:modules.version+1}}return route.fulfill({json:modules})}
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
      if(path==='/api/ai/documents')return route.fulfill({json:{rows:[]}})
      if(path==='/api/ai/settings')return route.fulfill({json:{enabled:false,hasApiKey:false}})
      calls.push([req.method(), path])
      
if(path==='/api/settings/profile'){await route.fulfill({json:{profile:'NONPROFIT',version:0}});return}
if(path==='/api/classifications/primary'){await route.fulfill({json:{profile:'NONPROFIT',definition:{primaryLabel:'Sphäre'},values:[]}});return}
let result
      if (path === '/api/auth/status') result = { setupRequired: false }
      else if (path === '/api/auth/me')
        result = {
          user: {
            id: 1,
            email: 'team@example.test',
            role,
            organizationId: 1,
            organizationName: organization.name
          }
        }
      else if (path === '/api/settings/preferences') {
        if (req.method() === 'GET' && preferencesReadDelay)
          await new Promise((resolve) => setTimeout(resolve, preferencesReadDelay))
        if (req.method() === 'PATCH') {
          const body = req.postDataJSON()
          assert.equal(req.headers()['x-vereino-request'], '1')
          if (body.version !== preferences.version)
            return route.fulfill({
              status: 409,
              json: { message: 'Darstellung inzwischen geändert. Bitte neu laden.' }
            })
          preferences = { ...body, version: body.version + 1 }
        }
        result = { preferences }
      } else if (path === '/api/settings/organization') {
        assert.notEqual(role, 'USER', 'User must not request organizational settings')
        if (req.method() === 'PATCH') {
          assert.equal(role, 'ADMIN')
          organization = { ...req.postDataJSON(), version: organization.version + 1 }
        }
        result = { organization }
      } else if (path === '/api/settings/workflow') {
        if (req.method() === 'PATCH') workflow = { ...req.postDataJSON(), version: workflow.version + 1 }
        result = { settings: workflow }
      } else if (path === '/api/settings/table') {
        if (req.method() === 'PATCH') table = { ...req.postDataJSON(), version: table.version + 1 }
        result = { settings: table }
      } else if (path === '/api/users') {
        assert.equal(role, 'ADMIN')
        if (req.method() === 'POST') {
          const body = req.postDataJSON()
          users.push({
            id: users.length + 1,
            email: body.email,
            role: body.role,
            organizationId: 1,
            isActive: true
          })
        }
        result = { users }
      } else if (/^\/api\/users\/\d+\/password$/.test(path)) {
        assert.equal(role, 'ADMIN')
        result = { ok: true }
      } else if (/^\/api\/users\/\d+$/.test(path)) {
        assert.equal(role, 'ADMIN')
        Object.assign(
          users.find((user) => user.id === Number(path.split('/').at(-1))),
          req.postDataJSON()
        )
        result = { ok: true }
      } else if (path === '/api/auth/password') {
        assert.equal(req.method(), 'POST')
        passwordChanged = true
        result = { ok: true }
      } else if (path === '/api/bookings') result = { bookings: [] }
      else if (path === '/api/drafts') result = { drafts: [] }
      else if (path === '/api/planning/budgets' || path === '/api/planning/earmarks')
        result = { rows: [] }
      else if (path === '/api/organizations') result = { organizations: [] }
    else throw new Error(`Unexpected settings API request: ${req.method()} ${path}`)
      await route.fulfill({ json: result })
    })
    await page.goto(base)
    await page.locator('[data-shortcut-nav="Einstellungen"]').click()
    await page.getByRole('button', { name: 'Darstellung speichern', exact: true }).waitFor()
    const aiToggle=page.getByRole('checkbox',{name:'KI in Navigation anzeigen'})
    if(role==='ADMIN'){
      await aiToggle.uncheck();await page.getByRole('button',{name:'Modulauswahl speichern',exact:true}).click();await page.getByText('Modulauswahl gespeichert.',{exact:true}).waitFor()
      assert.equal(await page.locator('[data-shortcut-nav="KI"]').count(),0)
      await page.reload();await page.locator('[data-shortcut-nav="Einstellungen"]').click();await aiToggle.waitFor();assert.equal(await aiToggle.isChecked(),false)
      await aiToggle.check();await page.getByRole('button',{name:'Modulauswahl speichern',exact:true}).click();await page.locator('[data-shortcut-nav="KI"]').waitFor()
    }else assert.equal(await aiToggle.isDisabled(),true)
    assert.equal(await page.locator('.theme-picker-grid .theme-card').count(), 10)
    await page.getByTitle('Ocean Breeze', { exact: true }).click()
    await page.getByRole('button', { name: 'Oben', exact: true }).click()
    await page.getByRole('switch', { name: /Farbige Menüicons/ }).uncheck()
    await page.getByRole('button', { name: 'Darstellung speichern', exact: true }).click()
    await page.getByText('Einstellungen gespeichert.', { exact: true }).waitFor()
    assert.deepEqual(
      [preferences.colorTheme, preferences.navLayout, preferences.navIconColorMode],
      ['ocean-breeze', 'top', 'mono']
    )
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.colorTheme),
      'ocean-breeze'
    )
    await page.locator('.settings-cluster-trigger').filter({ hasText: 'Darstellung' }).click()
    await page.getByRole('button', { name: 'Arbeitsweise', exact: true }).click()
    if (role !== 'USER') await page.getByRole('button', { name: 'Arbeitsweise speichern', exact: true }).waitFor()
    if (role !== 'USER') {
      await page.getByRole('button', { name: 'Buchungen klassisch', exact: true }).click()
      await page.getByRole('button', { name: 'Arbeitsweise speichern', exact: true }).click()
      await page.getByText('Arbeitsweise gespeichert.', { exact: true }).waitFor()
      assert.equal(workflow.bookingView, 'classic')
    }
    await page.locator('.settings-cluster-trigger').filter({ hasText: 'Darstellung' }).click()
    await page.getByRole('button', { name: 'Tabelle', exact: true }).click()
    if (role !== 'USER') await page.getByRole('button', { name: 'Tabelle speichern', exact: true }).waitFor()
    if (role !== 'USER') {
      await page.getByRole('button', { name: 'ISO', exact: true }).click()
      await page.getByRole('button', { name: 'Tabelle speichern', exact: true }).click()
      await page.getByText('Tabelleneinstellungen gespeichert.', { exact: true }).waitFor()
      assert.equal(table.dateFormat, 'iso')
    }
    assert(await page.locator('.top-nav').count())
    // Authentication initially renders the sidebar. The separately fetched personal
    // preferences then replace it with TopNav; wait for that restoration before clicking.
    preferencesReadDelay = 150
    await page.reload()
    await page.waitForFunction(() => document.documentElement.dataset.colorTheme === 'ocean-breeze')
    const restoredSettings = page.locator('.top-nav [data-shortcut-nav="Einstellungen"]')
    await restoredSettings.waitFor({ state: 'visible' })
    await restoredSettings.click()
    preferencesReadDelay = 0
    await page.getByRole('button', { name: 'Darstellung speichern', exact: true }).waitFor()
    assert.equal(
      await page.getByTitle('Ocean Breeze', { exact: true }).getAttribute('aria-pressed'),
      'true'
    )
    // A second client changed the preference version; stale save must stay visibly unsaved.
    preferences = { ...preferences, version: preferences.version + 1, colorTheme: 'soft-blush' }
    await page.getByRole('button', { name: 'Darstellung speichern', exact: true }).click()
    await page
      .getByRole('alert')
      .getByText(/inzwischen geändert/)
      .waitFor()
    await page.getByRole('button', { name: 'Einstellungen neu laden', exact: true }).click()
    await page.waitForFunction(() => document.documentElement.dataset.colorTheme === 'soft-blush')
    assert.equal(
      await page.evaluate(() => document.documentElement.dataset.colorTheme),
      'soft-blush'
    )
    if (role !== 'USER') {
      await page.locator('.settings-cluster-trigger').filter({ hasText: 'Verein' }).click()
      const name = page.getByLabel('Organisationsname', { exact: true })
      await name.waitFor()
      if (role === 'ADMIN') {
        await name.fill('Gemeinsamer Vereinsname')
        await page.getByRole('button', { name: 'Organisationsdaten speichern', exact: true }).click()
        await page.getByText('Organisationsdaten gespeichert.', { exact: true }).waitFor()
        assert.equal(await page.locator('.web-org-trigger span').innerText(), 'Gemeinsamer Vereinsname')
      } else {
        assert.equal(await name.getAttribute('readonly'), '')
        assert.equal(await page.getByRole('button', { name: 'Organisationsdaten speichern', exact: true }).count(), 0)
      }
    } else assert(!calls.some(([, path]) => path === '/api/settings/organization'))
    assert.equal(
      await page.locator('.web-settings-tabs').count(),
      0,
      'settings must have one original navigation shell'
    )
    await page.locator('.settings-cluster-trigger').filter({ hasText: 'Zugang' }).click()
    await page
      .locator('.settings-content')
      .getByRole('heading', { name: 'Passwort ändern', exact: true })
      .waitFor()
    if (role === 'ADMIN') {
      await page.getByRole('button', { name: 'Benutzerverwaltung', exact: true }).click()
      await page.getByRole('cell', { name: 'other@example.test', exact: true }).waitFor()
      await page.getByLabel('E-Mail', { exact: true }).fill('created@example.test')
      await page.getByLabel('Startpasswort', { exact: true }).fill('test-password-created')
      await page.locator('select[name="role"]').selectOption('EDITOR')
      await page.getByRole('button', { name: 'Benutzer anlegen', exact: true }).click()
      await page.getByRole('cell', { name: 'created@example.test', exact: true }).waitFor()
      await page.getByLabel('Rolle von other@example.test', { exact: true }).selectOption('EDITOR')
      await page.getByText('Rolle aktualisiert.', { exact: true }).waitFor()
      const targetRow = page
        .getByRole('row')
        .filter({ has: page.getByRole('cell', { name: 'other@example.test', exact: true }) })
      await targetRow.getByRole('button', { name: 'Sperren', exact: true }).click()
      await targetRow.getByRole('button', { name: 'Aktivieren', exact: true }).waitFor()
      await targetRow.getByRole('button', { name: 'Passwort setzen', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Passwort neu setzen', exact: true })
      assert.match(await dialog.getAttribute('class'), /modal/)
      await dialog.getByLabel('Neues Passwort', { exact: true }).fill('test-password-reset')
      await dialog.getByRole('button', { name: 'Passwort setzen', exact: true }).click()
      await dialog.waitFor({ state: 'hidden' })
      assert.equal(users.find((user) => user.id === 2).role, 'EDITOR')
      assert.equal(users.find((user) => user.id === 2).isActive, false)
      await page.getByRole('button', { name: 'Mein Konto', exact: true }).click()
    } else {
      assert.equal(
        await page.getByRole('button', { name: 'Benutzerverwaltung', exact: true }).count(),
        0
      )
      assert(!calls.some(([, path]) => path.startsWith('/api/users')))
    }
    await page.setViewportSize({ width: 390, height: 900 })
    assert.equal(
      await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
      false
    )
    await page.getByLabel('Aktuelles Passwort', { exact: true }).fill('test-current-password')
    await page.getByLabel('Neues Passwort', { exact: true }).fill('test-new-password')
    await page.getByRole('button', { name: 'Passwort speichern', exact: true }).click()
    await page.getByRole('button', { name: 'Anmelden', exact: true }).waitFor()
    assert.equal(passwordChanged, true)
    assert.deepEqual(errors, [])
    await page.close()
  }
  console.log(
    'Original settings: shared controls, preference persistence/conflicts, role access and responsive layout passed.'
  )
} finally {
  await browser.close()
}
