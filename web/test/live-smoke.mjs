// Destructive only to the fresh disposable pilot database supplied by the operator.
// Run with PILOT_E2E=1 after starting a fresh backend and Vite on port 5174.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
import { verifyMasterSettings } from './live-master-settings.mjs'
import { verifyBankImport } from './live-bank-import.mjs'
import { verifyReportExport } from './live-report-export.mjs'
import { verifyUnifiedAccount } from './live-unified-account.mjs'
import { verifyNextModules } from './live-next-modules.mjs'
if (process.env.PILOT_E2E !== '1')
  throw new Error('Requires PILOT_E2E=1 and a disposable empty database.')
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined, headless: true })
const base = process.env.WEB_TEST_URL || 'http://localhost:5174'
try {
  const admin = await browser.newPage({ viewport: { width: 1360, height: 950 } })
  const errors = []
  admin.on('pageerror', (e) => errors.push(e.message))
  await admin.goto(base)
  await admin.getByLabel('Vereinsname').fill('VereinO Testverein')
  await admin.getByLabel('Einrichtungsschlüssel').fill(process.env.WEB_TEST_SETUP_TOKEN || 'pilot-browser-setup-token-123456')
  await admin.getByLabel('E-Mail').fill('admin@pilot.test')
  await admin.locator('input[name=password]').fill('pilot-password-admin')
  await admin.getByRole('button', { name: 'Verein einrichten' }).click()
  await admin.getByRole('heading', { name: 'Buchungen Plus', exact: true }).waitFor()
  await admin.getByRole('button', { name: 'Einstellungen', exact: true }).click()
  await admin.locator('.settings-cluster-trigger').filter({ hasText: 'Zugang' }).click()
  await admin.getByRole('button', { name: 'Benutzerverwaltung', exact: true }).click()
  for (const role of ['EDITOR', 'USER']) {
    await admin.getByLabel('E-Mail', { exact: true }).fill(`${role.toLowerCase()}@pilot.test`)
    await admin.getByLabel('Startpasswort').fill('pilot-password-user')
    await admin.locator('select[name=role]').selectOption(role)
    await admin.getByRole('button', { name: 'Benutzer anlegen' }).click()
    await admin
      .getByRole('cell', { name: `${role.toLowerCase()}@pilot.test`, exact: true })
      .waitFor()
  }
  async function login(email) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 900 } })
    page.on('pageerror', (e) => errors.push(e.message))
    await page.goto(base)
    await page.getByLabel('E-Mail').fill(email)
    await page.getByLabel('Passwort', { exact: true }).fill('pilot-password-user')
    await page.getByRole('button', { name: 'Anmelden', exact: true }).click()
    await page.getByRole('heading', { name: email.startsWith('user@') ? 'Buchungsentwürfe' : 'Buchungen Plus', exact: true }).waitFor()
    return page
  }
  const user = await login('user@pilot.test')
  await user.getByRole('button', { name: 'Entwurf erstellen' }).click()
  await user.getByPlaceholder('Was wurde gebucht?').fill('Live-Test Trainingsmaterial')
  await user.getByLabel('Brutto-Betrag', { exact: true }).fill('1234.56')
  await user.getByRole('button', { name: 'Entwurf speichern', exact: true }).click()
  await user.getByText('Eintrag gespeichert.').waitFor()
  await user.getByRole('button', { name: 'Einreichen', exact: true }).click()
  await user.getByText('Entwurf zur Prüfung eingereicht.').waitFor()
  const denied = await user.evaluate(async () => (await fetch('/api/bookings')).status)
  assert.equal(denied, 403)
  const editor = await login('editor@pilot.test')
  await editor.getByRole('button', { name: 'Entwürfe', exact: true }).click()
  await editor.getByRole('button', { name: 'Prüfen', exact: true }).click()
  await editor.getByRole('button', { name: 'Validieren und übernehmen' }).click()
  await editor.getByText('Entwurf freigegeben und als Buchung übernommen.').waitFor()
  await editor.locator('[data-shortcut-nav="Buchungen"]').click()
  const approvedRow = editor.locator('.bp-row').filter({ hasText: 'Live-Test Trainingsmaterial' })
  await approvedRow.waitFor()
  await approvedRow.dblclick()
  await editor.locator('.voucher-info-modal').waitFor()
  assert.equal(await editor.locator('.voucher-info-edit-btn').count(), 0)
  await editor.keyboard.press('Escape')
  assert.equal(await editor.getByRole('button', { name: 'Bearbeiten', exact: true }).count(), 0)
  await editor.getByRole('button', { name: 'Neue Buchung', exact: true }).click()
  const create = editor.getByRole('dialog', { name: 'Buchung erfassen', exact: true })
  await create.getByPlaceholder('Was wurde gebucht?').fill('Direkte Editor-Buchung')
  await create.getByLabel('Brutto-Betrag', { exact: true }).fill('42.50')
  await create.getByRole('button', { name: 'Buchung speichern', exact: true }).click()
  await editor.locator('.bp-row').filter({ hasText: 'Direkte Editor-Buchung' }).waitFor()
  const created = await editor.evaluate(async () => (await (await fetch('/api/bookings')).json()).bookings.find(b => b.description === 'Direkte Editor-Buchung'))
  assert.equal(created.grossAmountCents, 4250)
  const editorDenied = await editor.evaluate(async booking => (await fetch(`/api/bookings/${booking.id}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json', 'X-VereinO-Request': '1' }, body: JSON.stringify({ ...booking, description: 'Unauthorized change' })
  })).status, created)
  assert.equal(editorDenied, 403)
  await admin.locator('[data-shortcut-nav="Buchungen"]').click()
  await admin.locator('.bp-row').filter({ hasText: 'Direkte Editor-Buchung' }).click()
  await admin.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
  const edit = admin.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true })
  await edit.getByPlaceholder('Was wurde gebucht?').fill('Vom Admin bearbeitet')
  await edit.getByRole('button', { name: 'Buchung speichern', exact: true }).click()
  await admin.locator('.bp-row').filter({ hasText: 'Vom Admin bearbeitet' }).waitFor()
  // Original planning dialogs persist definitions; the original booking editor links them atomically.
  await admin.getByRole('button', { name: 'Budgets', exact: true }).click()
  await admin.getByRole('heading', { name: 'Budgets', exact: true }).waitFor()
  await admin.getByRole('button', { name: 'Neu', exact: true }).click()
  await admin.locator('#budget-name').fill('Jugendtraining')
  await admin.locator('#budget-amount').fill('500')
  await admin.getByRole('button', { name: 'Speichern', exact: true }).click()
  await admin.locator('#budget-name').waitFor({ state: 'hidden' })
  await admin.getByRole('button', { name: 'Zweckbindungen', exact: true }).click()
  await admin.getByRole('button', { name: 'Neu', exact: true }).click()
  await admin.locator('#binding-code').fill('JUGEND')
  await admin.locator('#binding-name').fill('Jugendförderung')
  await admin.getByRole('button', { name: 'Speichern', exact: true }).click()
  await admin.locator('#binding-name').waitFor({ state: 'hidden' })
  await editor.getByRole('button', { name: 'Budgets', exact: true }).click()
  await editor.getByRole('heading', { name: 'Budgets', exact: true }).waitFor()
  assert.equal(await editor.getByRole('button', { name: 'Neu', exact: true }).count(), 0)
  await editor.locator('[data-shortcut-nav="Buchungen"]').click()
  await editor.getByRole('button', { name: 'Neue Buchung', exact: true }).click()
  const allocation = editor.getByRole('dialog', { name: 'Buchung erfassen', exact: true })
  await allocation.getByPlaceholder('Was wurde gebucht?').fill('Zugeordnete Förderung')
  await allocation.getByLabel('Brutto-Betrag', { exact: true }).fill('100')
  await allocation.getByRole('button', { name: '+ Budget', exact: true }).click()
  await allocation.getByRole('button', { name: 'Budget 1', exact: true }).click()
  await editor.getByRole('listbox').getByRole('option', { name: /Jugendtraining/ }).click()
  await allocation.getByRole('button', { name: '+ Zweckbindung', exact: true }).click()
  await allocation.getByRole('button', { name: 'Zweckbindung 1', exact: true }).click()
  await editor.getByRole('listbox').getByRole('option', { name: /Jugendförderung/ }).click()
  await allocation.getByRole('button', { name: 'Buchung speichern', exact: true }).click()
  await editor.locator('.bp-row').filter({ hasText: 'Zugeordnete Förderung' }).waitFor()
  const linked = await editor.evaluate(async () => (await (await fetch('/api/bookings')).json()).bookings.find(b => b.description === 'Zugeordnete Förderung'))
  assert.equal(linked.budgets[0].amount, 100)
  assert.equal(linked.earmarksAssigned[0].amount, 100)
  const usage = await editor.evaluate(async b => (await fetch(`/api/planning/budgets/${b.budgets[0].budgetId}/usage`)).json(), linked)
  assert.equal(usage.inflow, 100)
  for (const label of ['Dashboard', 'Berichte', 'Mitglieder', 'Budgets', 'Zweckbindungen']) {
    assert.equal(await user.getByRole('button', { name: label, exact: true }).count(), 0)
    await editor.getByRole('button', { name: label, exact: true }).click()
    await editor.getByRole('heading', { name: label === 'Berichte' ? 'Report' : label, exact: true }).waitFor()
  }
  for (const endpoint of ['/members', '/planning/budgets', '/planning/earmarks']) {
    assert.equal(await user.evaluate(async path => (await fetch(`/api${path}`)).status, endpoint), 403)
  }
  await editor.locator('[data-shortcut-nav="Buchungen"]').click()
  await verifyNextModules({ admin, editor, user })
  await verifyBankImport({ admin, editor, user })
  await verifyReportExport({ editor })
  await verifyUnifiedAccount({ admin, base })
  await verifyMasterSettings({ admin, editor, user })
  await editor.locator('[data-shortcut-nav="Buchungen"]').click()
  for (const width of [1360, 800, 390]) {
    await editor.setViewportSize({ width, height: 900 })
    assert(await editor.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    await editor.screenshot({ path: `/tmp/vereino-web-${width}.png`, fullPage: true })
  }
  assert.deepEqual(errors, [])
  console.log(
    'Live smoke passed: setup, users, USER draft submission, EDITOR validation, original booking details and editor creation, admin editing, original planning dialogs and atomic booking assignments with usage, PDF upload/preview/exact download, recurring execution, persistent personal/organization settings, CSV bank import and duplicate detection, bank booking, filtered CSV export, unified account settings and password change, master data CRUD and organization documents, all module navigation, USER/EDITOR API forbidden, no page errors or responsive overflow.'
  )
} finally {
  await browser.close()
}
