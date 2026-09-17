import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', headless: true })
try {
 const page = await browser.newPage()
 const errors = []; page.on('pageerror', error => errors.push(error.message))
 let requested = '', history = [], queue = [], invoiceCount = 0
 let savedDraft, failSave = true
 const documentId = '00000000-0000-4000-8000-000000000001'
 await page.route('**/api/**', async route => {
  const path = new URL(route.request().url()).pathname
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
  let data = {}
  if (path === '/api/planning/options') data = { budgets: [], earmarks: [] }
  if (path === '/api/auth/status') data = { setupRequired: false }
  if (path === '/api/auth/me') data = { user: { id: 1, organizationId: 1, role: 'USER', email: 'test@example.test' } }
  if (path === '/api/drafts') {
   data = { drafts: [] }
   if (route.request().method() === 'POST') {
    savedDraft = route.request().postDataJSON()
    if (failSave) return route.fulfill({ status: 503, json: { message: 'Speichern testweise nicht möglich' } })
    queue = queue.filter(item => item.documentId !== savedDraft.aiDocumentId)
    data = { draft: { ...savedDraft, id: 1, version: 1 } }
   }
  }
  if (path === '/api/classifications/primary') data = { profile: 'GENERAL', definition: { primaryLabel: 'Kategorie' }, values: [{ id: 7, name: 'Haushalt', isActive: true }] }
  if (path === '/api/ai/documents') data = { rows: queue }
  if (path.startsWith('/api/ai/documents/')) queue = queue.filter(item => item.documentId !== path.split('/').pop())
  if (path === '/api/ai/settings') data = { enabled: true, hasApiKey: true, provider: 'openai' }
  if (path === '/api/ai/invoice') {
   assert.match(route.request().headers()['content-type'], /^multipart\/form-data;/)
   data = { documentId, fields: { date: '2026-09-16', description: 'Rechnung Material', counterparty: 'Shop', grossAmountCents: 1234, type: 'OUT', sphere: null, primaryClassificationValueId: 7, warnings: ['Bitte Betrag prüfen.'] } }
  }
  if (path === '/api/ai/invoice') { invoiceCount++; data.documentId = invoiceCount === 1 ? documentId : `00000000-0000-4000-8000-${String(invoiceCount).padStart(12, '0')}`; queue.push({ ...data, fileName: `Beleg ${invoiceCount}.pdf` }) }
  if (path === '/api/settings/profile') data = { profile: 'GENERAL', version: 1 }
  if (path === '/api/ai/booking-proposal') data = { fields: { date: '2026-09-16', description: 'Büromaterial aus Text', counterparty: '', grossAmountCents: 2345, type: 'OUT', sphere: null, primaryClassificationValueId: 7, warnings: [] } }
  if (path === '/api/ai/assistant') {
   requested = route.request().postDataJSON().prompt
   history = route.request().postDataJSON().history
   assert.equal(route.request().headers()['x-vereino-request'], '1')
   data = { text: '**Deine Entwürfe:** 12,00 €', scope: 'Nur eigene Entwürfe.' }
  }
  await route.fulfill({ json: data })
 })
 await page.goto('http://localhost:5174')
 await page.getByRole('button', { name: 'KI', exact: true }).click()
 await page.getByText('Schön, dich zu sehen. Was möchtest du erledigen?',{exact:true}).waitFor()
 await page.screenshot({path:'/tmp/vereino-desktop-ai-web.png'})
 assert.equal(await page.getByRole('button',{name:'Helles Design aktivieren',exact:true}).count(),0)
 await page.getByLabel('Deine Frage').fill('Wie hoch sind meine Entwürfe?')
 await page.getByRole('button', { name: 'Senden', exact: true }).click()
 await page.getByText('Nur eigene Entwürfe.', { exact: true }).waitFor()
 assert.equal(requested, 'Wie hoch sind meine Entwürfe?')
 assert.match(await page.locator('.ai-message--assistant').innerText(), /12,00/)
 assert.deepEqual(history, [])
 await page.getByLabel('Deine Frage').fill('Kannst du das genauer erklären?')
 await page.getByRole('button', { name: 'Senden', exact: true }).click()
 await page.waitForFunction(() => document.querySelectorAll('.ai-message--assistant').length === 2)
 assert.equal(history.length, 2)
 assert.equal(history[0].role, 'user')
 assert.equal(history[1].role, 'assistant')
 await page.getByRole('button', { name: '+ Neuer Chat' }).click()
 assert.equal(await page.locator('.ai-message').count(), 0)
 await page.getByLabel('Beleg auswählen').setInputFiles({ name: 'invoice.png', mimeType: 'image/png', buffer: Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64') })
 await page.getByRole('button', { name: 'Senden', exact: true }).click()
 await page.getByRole('button', { name: 'Mit KI auslesen', exact: true }).click()
 await page.getByText(/KI-Auswertung übernommen/).waitFor()
 await page.screenshot({path:'/tmp/vereino-desktop-invoice-web.png'})
 await page.getByRole('button', { name: 'Als Entwurf übernehmen', exact: true }).click()
 const dialog = page.getByRole('dialog', { name: 'Entwurf erfassen', exact: true })
 await dialog.waitFor()
 await dialog.getByText('Bitte Betrag prüfen.', { exact: true }).waitFor()
 assert.equal(await dialog.getByLabel('Brutto-Betrag', { exact: true }).inputValue(), '12.34')
 const storageBefore = await page.evaluate(() => JSON.stringify(localStorage))
 await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click()
 await dialog.getByText('Speichern testweise nicht möglich', { exact: true }).waitFor()
 assert.equal(await page.evaluate(() => JSON.stringify(localStorage)), storageBefore, 'failed save must not learn patterns')
 failSave = false
 await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click()
 await dialog.waitFor({ state: 'hidden' })
 assert.equal(savedDraft.aiDocumentId, documentId)
 assert.equal(savedDraft.primaryClassificationValueId, 7)
 assert.equal(savedDraft.grossAmountCents, 1234)
 await page.getByLabel('Deine Frage').fill('Büromaterial 23,45 Euro heute')
 await page.getByRole('button', { name: 'Buchung vorschlagen', exact: true }).click()
 await dialog.waitFor()
 assert.equal(await dialog.getByLabel('Brutto-Betrag', { exact: true }).inputValue(), '23.45')
 await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click()
 await dialog.waitFor({ state: 'hidden' })
 assert.equal(savedDraft.aiDocumentId, undefined, 'text proposal must not reuse previous invoice document')
 assert.equal(savedDraft.grossAmountCents, 2345)
 await page.getByLabel('Beleg auswählen').setInputFiles([{ name: 'one.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture') }, { name: 'two.pdf', mimeType: 'application/pdf', buffer: Buffer.from('fixture') }])
 await page.getByRole('button', { name: 'Senden', exact: true }).click()
 await page.getByRole('heading', { name: 'Belege zur Prüfung (2)', exact: true }).waitFor()
 await page.reload()
 await page.getByRole('button', { name: 'KI', exact: true }).click()
 await page.getByRole('heading', { name: 'Belege zur Prüfung (2)', exact: true }).waitFor()
 await page.getByRole('button', { name: 'Verwerfen', exact: true }).first().click()
 await page.getByRole('heading', { name: 'Belege zur Prüfung (1)', exact: true }).waitFor()
 await page.getByRole('button', { name: 'Prüfen', exact: true }).click()
 await dialog.waitFor()
 await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click()
 await dialog.waitFor({ state: 'hidden' })
 await page.getByRole('heading', { name: 'Belege zur Prüfung (1)', exact: true }).waitFor({ state: 'hidden' })
 assert.deepEqual(errors, [])
 console.log('AI assistant navigation, submit, response rendering and clear passed')
} finally { await browser.close() }
