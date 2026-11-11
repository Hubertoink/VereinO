import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string
let css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/modalHeader.css', 'src/renderer/views/BankImport/bankAiBatch.css', 'src/renderer/components/finance/membershipPayments.css'].map(path => fs.readFile(path, 'utf8')))).join('\n')
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import BankAiBatchModal from './src/renderer/views/BankImport/BankAiBatchModal'
    const root = createRoot(document.getElementById('root'))
    window.renderBatch = (options = {}) => {
      window.applied = []; window.closes = 0; window.changed = 0; window.reviews = []
      const names = ['Canva Pty Ltd', 'REWE Markt GmbH', 'Raummiete Jugendhaus']
      const transactions = names.map((counterparty, i) => ({ id: i + 1, status: 'OPEN', direction: 'OUT', amount: 29.99 + i,
        bookingDate: '2026-08-13', currency: 'EUR', paymentAccountId: 1, paymentAccountName: 'Bank', counterparty, purpose: 'Jugendhaus August',
        aiSuggestion: { action: 'CREATE_BOOKING', reason: 'Wiederkehrende Ausgabe für das Jugendhaus.', warnings: [], evidence: [],
          bookingCandidate: { date: '2026-08-13', type: 'OUT', sphere: 'IDEELL', description: 'Ausgabe Jugendhaus', grossAmount: 29.99 + i, vatRate: 0, budgets: [], earmarks: [], tags: [] } }
      }))
      if (options.mixed) transactions[1].aiSuggestion = { action: 'LINK_EXISTING', voucherId: 41, voucherNo: '2026-41', reason: 'Passende Buchung.', warnings: [], evidence: [] }
      if (options.preassigned) Object.assign(transactions[0].aiSuggestion.bookingCandidate, { budgets: [{ id: 9, amount: 29.99 }], earmarks: [{ id: 11, amount: 29.99 }], tags: ['Freizeit'] })
      if (options.membership) {
        Object.assign(transactions[0], { direction:'IN', amount:25, counterparty:'Niko Dubio', purpose:'Mitgliedsbeitrag 0002 Vorauszahlung' })
        transactions[0].aiSuggestion.membership={memberId:2}
        Object.assign(transactions[0].aiSuggestion.bookingCandidate,{type:'IN',grossAmount:25,description:'Mitgliedsbeitrag Niko Dubio'})
      }
      if (options.single) transactions.splice(1)
      const rows = transactions.map(transaction => ({ transaction, token: 'a'.repeat(64), commentsEnabled: !!options.comments,
        candidate: transaction.aiSuggestion.bookingCandidate ? { ...transaction.aiSuggestion.bookingCandidate, note: options.comments ? 'Referenz BREF-123' : '' } : null,
        targetDescription: 'Verpflegung Jugendhaus', warnings: transaction.id === 1 ? ['Kein Budget zugeordnet.'] : [],
        blockers: transaction.id === 3 ? ['Mögliche Doppelbuchung. Bitte einzeln prüfen.'] : options.missingCategory && transaction.id === 1 ? ['Eine Kategorie ist erforderlich.'] : [] }))
      window.api = {
        payments: { previewAllocation: async () => rows[0].membershipPreview },
        bankTransactions: {
          validateAiBatchDraft: async ({ candidate }) => ({ blockers: candidate.description.trim() && (!options.missingCategory || candidate.primaryClassificationValueId)
            && [candidate.budgets || [], candidate.earmarks || []].every(values => values.every(value => value.id > 0 && value.amount > 0) && values.reduce((sum, value) => sum + value.amount, 0) <= candidate.grossAmount + .001)
            ? [] : ['Bitte Buchungstext, Kategorie und Zuordnungen prüfen.'] }),
          previewAiBatch: async () => { if (options.loadFailure) throw new Error('Vorschau nicht verfügbar'); return rows },
          applyAiBatch: async (payload) => {
            window.applied.push(payload)
            if (options.hold) await new Promise(resolve => window.finishApply = resolve)
            if (options.failSecond && payload.id === 2) { options.failSecond = false; throw new Error('Zeitraum geschlossen') }
            return { voucherId: 40 + payload.id, voucherNo: '2026-' + (40 + payload.id), warnings: [] }
          }
        },
        classifications: { primary: { list: async () => ({ profile: options.general ? 'GENERAL' : 'NONPROFIT', definition: { primaryLabel: options.general ? 'Kategorie' : 'Sphäre' }, values: [
          { id: 1, stableKey: 'IDEELL', name: options.general ? 'Verwaltung' : 'Ideeller Bereich', isActive: true },
          { id: 2, stableKey: 'ZWECK', name: options.general ? 'Veranstaltungen' : 'Zweckbetrieb', isActive: true }
        ] }) } },
        budgets: { list: async () => ({ rows: [{ id: 9, name: 'Jugendhaus' }, { id: 10, name: 'Freizeit' }] }) },
        bindings: { list: async () => ({ rows: [{ id: 11, name: 'Jugendförderung' }] }) },
        tags: { list: async () => ({ rows: [{ id: 1, name: 'Freizeit', color: '#287da6' }, { id: 2, name: 'Material', color: '#8656b8' }] }) }
      }
      window.changePreview = () => { rows[0].token = 'b'.repeat(64) }
      if (options.membership) rows[0].membershipPreview={token:'c'.repeat(64),memberId:2,memberName:'Niko Dubio',amount:25,credit:0,allocations:[
        {periodKey:'2026-11',interval:'MONTHLY',dueDate:'2026-11-01',expected:10,paidBefore:0,amount:10,remaining:0},
        {periodKey:'2026-12',interval:'MONTHLY',dueDate:'2026-12-01',expected:10,paidBefore:0,amount:10,remaining:0},
        {periodKey:'2027-01',interval:'MONTHLY',dueDate:'2027-01-01',expected:10,paidBefore:0,amount:5,remaining:5}
      ]}
      window.setBatchVisibility = (visible) => root.render(<BankAiBatchModal visible={visible} transactions={transactions} page={2} onClose={() => window.closes++} onChanged={() => window.changed++} onReview={t => window.reviews.push(t.id)} />)
      window.setBatchVisibility(true)
    }
  ` }, bundle: true, write: false, platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
})

test.beforeEach(async ({ page }) => {
  await page.route('http://batch.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="light"><div id="root"></div></html>' }))
  await page.goto('http://batch.test/')
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
})

test('requires selection, excludes blockers, shows results and retries only failed rows', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await page.evaluate(() => (window as any).renderBatch({ failSecond: true }))
  await expect(page.getByRole('dialog')).toBeVisible()
  await expect(page.getByRole('button', { name: 'Vorschau aktualisieren' })).toHaveCount(0)
  await expect(page.getByText('Hinweis: Kein Budget zugeordnet.')).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' })).toBeEnabled()
  await expect(page.getByRole('img', { name: 'Zur Übernahme bereit' })).toHaveCount(2)
  await page.getByRole('img', { name: 'Zur Übernahme bereit' }).first().hover()
  await expect(page.getByRole('tooltip')).toHaveText('Zur Übernahme bereit')
  await expect(page.getByText(/Seite 2/)).toBeVisible()
  await expect(page.getByRole('button', { name: '0 Vorschläge übernehmen' })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Bankbeleg 3 auswählen' })).toBeDisabled()
  await page.getByRole('checkbox', { name: 'Alle übernahmefähigen Vorschläge auswählen' }).check()
  await expect(page.getByRole('checkbox', { name: 'Bankbeleg 3 auswählen' })).not.toBeChecked()
  await page.getByRole('button', { name: 'Details zu Bankbeleg 1' }).click()
  await page.getByLabel('Buchungstext', { exact: true }).fill('Canva Pro Monatsabo Jugendhaus')
  await page.getByRole('button', { name: '+ Budget', exact: true }).click()
  await page.getByRole('button', { name: 'Budget 1', exact: true }).click()
  await page.getByRole('option', { name: 'Jugendhaus', exact: true }).click()
  await expect(page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' })).toBeEnabled()
  await page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' }).check()
  await expect(page.getByText('Hinweis: Kein Budget zugeordnet.')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '2 Buchungen anlegen' })).toBeEnabled()
  await page.screenshot({ path: info.outputPath('batch-review-edit.png') })
  await page.getByRole('button', { name: '2 Buchungen anlegen' }).click()
  await expect(page.getByText('Angelegt · 2026-41', { exact: true })).toBeVisible()
  await expect(page.getByText('Zeitraum geschlossen', { exact: true })).toBeVisible()
  await expect(page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' })).toBeDisabled()
  await page.getByRole('button', { name: '1 Buchung anlegen' }).click()
  await expect(page.getByText('Angelegt · 2026-42', { exact: true })).toBeVisible()
  const applied = await page.evaluate(() => (window as any).applied)
  expect(applied.map((p: any) => p.id)).toEqual([1, 2, 2])
  expect(applied[0].candidate).toMatchObject({ description: 'Canva Pro Monatsabo Jugendhaus', budgets: [{ id: 9, amount: 29.99 }] })
})

test('locks close, selection and submission while processing and exposes individual review', async ({ page }) => {
  await page.evaluate(() => (window as any).renderBatch({ hold: true, mixed: true }))
  await page.getByRole('button', { name: 'Einzeln prüfen' }).click()
  expect(await page.evaluate(() => (window as any).reviews)).toEqual([3])
  await page.getByRole('checkbox', { name: 'Bankbeleg 2 auswählen' }).check()
  await expect(page.getByText('0 neue Buchungen · 1 Zuordnungen · 0 Dauerbuchungen')).toBeVisible()
  await page.getByRole('button', { name: '1 Vorschlag übernehmen' }).click()
  await expect(page.getByRole('button', { name: 'Wird übernommen …', exact: true })).toBeDisabled()
  await expect(page.getByRole('button', { name: 'Schließen', exact: true }).first()).toBeDisabled()
  await page.keyboard.press('Escape')
  expect(await page.evaluate(() => (window as any).closes)).toBe(0)
  await page.evaluate(() => (window as any).finishApply())
  await expect(page.getByText('Zugeordnet · 2026-42')).toBeVisible()
})

test('keeps the footer reachable on small screens and supports general categories', async ({ page }, info) => {
  await page.setViewportSize({ width: 520, height: 740 })
  await page.evaluate(() => (window as any).renderBatch({ general: true }))
  await page.getByRole('button', { name: 'Details zu Bankbeleg 1' }).click()
  await page.getByLabel('Kategorie', { exact: true }).selectOption('2')
  await page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' }).check()
  const button = page.getByRole('button', { name: '1 Buchung anlegen' })
  const box = await button.boundingBox()
  await page.screenshot({ path: info.outputPath('batch-small-screen.png') })
  expect(box!.y + box!.height).toBeLessThanOrEqual(740)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(520)
  await button.click()
  await expect(page.getByText('Angelegt · 2026-41')).toBeVisible()
  expect((await page.evaluate(() => (window as any).applied))[0].candidate).toMatchObject({ primaryClassificationValueId: 2, sphere: 'IDEELL' })
})

test('failed preview never enables bulk approval', async ({ page }) => {
  await page.evaluate(() => (window as any).renderBatch({ loadFailure: true }))
  await expect(page.getByRole('alert')).toContainText('Vorschau nicht verfügbar')
  await expect(page.getByRole('button', { name: '0 Vorschläge übernehmen' })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: 'Alle übernahmefähigen Vorschläge auswählen' })).toBeDisabled()
})

test('a blocked draft remains editable and becomes selectable after fixing required data', async ({ page }) => {
  await page.evaluate(() => (window as any).renderBatch({ general: true, missingCategory: true }))
  const checkbox = page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' })
  await expect(checkbox).toBeDisabled()
  await page.getByRole('button', { name: 'Details zu Bankbeleg 1' }).click()
  await expect(page.getByLabel('Kategorie', { exact: true })).toBeEnabled()
  await page.getByLabel('Kategorie', { exact: true }).selectOption('2')
  await expect(checkbox).toBeEnabled()
  await checkbox.check()
  await page.getByRole('button', { name: '1 Buchung anlegen' }).click()
  await expect(page.getByText('Angelegt · 2026-41')).toBeVisible()
})

test('preserves repaired drafts and selection on return, but clears consent for changed suggestions', async ({ page }) => {
  await page.evaluate(() => (window as any).renderBatch({ general: true, missingCategory: true }))
  await page.getByRole('button', { name: 'Details zu Bankbeleg 1' }).click()
  await page.getByLabel('Kategorie', { exact: true }).selectOption('2')
  const checkbox = page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' })
  await expect(checkbox).toBeEnabled()
  await checkbox.check()
  await page.evaluate(() => (window as any).setBatchVisibility(false))
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => (window as any).setBatchVisibility(true))
  await expect(checkbox).toBeChecked()
  await expect(page.getByLabel('Kategorie', { exact: true })).toHaveValue('2')
  await page.evaluate(() => { (window as any).changePreview(); (window as any).setBatchVisibility(false) })
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.evaluate(() => (window as any).setBatchVisibility(true))
  await expect(checkbox).not.toBeChecked()
  await expect(checkbox).toBeDisabled()
})

test('opted-in comments are visible, editable and sent with the approved draft', async ({ page }) => {
  await page.evaluate(() => (window as any).renderBatch({ comments: true }))
  await page.getByRole('button', { name: 'Details zu Bankbeleg 1' }).click()
  await expect(page.getByLabel('Kommentar', { exact: true })).toHaveValue('Referenz BREF-123')
  await page.getByLabel('Kommentar', { exact: true }).fill('Referenz BREF-123 · Jugendhaus')
  const checkbox = page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' })
  await expect(checkbox).toBeEnabled()
  await checkbox.check()
  await page.getByRole('button', { name: '1 Buchung anlegen' }).click()
  await expect(page.getByText('Angelegt · 2026-41')).toBeVisible()
  expect((await page.evaluate(() => (window as any).applied))[0].candidate.note).toBe('Referenz BREF-123 · Jugendhaus')
})

test('booking modules edit tags and split assignments without losing hidden values', async ({ page }, info) => {
  await page.setViewportSize({ width: 1440, height: 1000 })
  await page.evaluate(() => (window as any).renderBatch({ comments: true }))
  await page.getByRole('button', { name: 'Details zu Bankbeleg 1' }).click()
  const editor = page.getByRole('region', { name: 'Buchungsentwurf bearbeiten' })
  await expect(page.getByRole('complementary', { name: 'Begründung der KI' })).toContainText('Wiederkehrende Ausgabe')
  await expect(page.getByLabel('Tags (durch Komma getrennt)')).toHaveCount(0)
  await editor.getByRole('button', { name: '+ Tag', exact: true }).click()
  await editor.getByRole('button', { name: 'Tag Freizeit hinzufügen' }).click()
  await editor.getByRole('textbox', { name: 'Neuen Tag hinzufügen' }).fill('Jugendhaus')
  await editor.getByRole('textbox', { name: 'Neuen Tag hinzufügen' }).press('Enter')
  await editor.getByRole('button', { name: '− Tag · 2', exact: true }).click()
  await expect(editor.getByRole('textbox', { name: 'Neuen Tag hinzufügen' })).toHaveCount(0)
  await editor.getByRole('button', { name: '+ Tag · 2', exact: true }).click()
  await expect(editor.getByRole('button', { name: 'Tag Jugendhaus entfernen' })).toBeVisible()
  await editor.getByRole('button', { name: '+ Budget', exact: true }).click()
  await editor.getByRole('button', { name: 'Budget 1', exact: true }).click()
  await page.getByRole('option', { name: 'Jugendhaus', exact: true }).click()
  await editor.getByRole('spinbutton', { name: 'Budgetbetrag 1', exact: true }).fill('10')
  await editor.getByRole('button', { name: '+ Budgetzeile', exact: true }).click()
  await expect(editor.getByRole('spinbutton', { name: 'Budgetbetrag 2', exact: true })).toHaveValue('19.99')
  await editor.getByRole('button', { name: 'Budget 2', exact: true }).click()
  await expect(page.getByRole('option', { name: 'Jugendhaus', exact: true })).toBeDisabled()
  await page.getByRole('option', { name: 'Freizeit', exact: true }).click()
  await editor.getByRole('button', { name: '+ Zweckbindung', exact: true }).click()
  await editor.getByRole('button', { name: 'Zweckbindung 1', exact: true }).click()
  await page.getByRole('option', { name: 'Jugendförderung', exact: true }).click()
  await page.screenshot({ path: info.outputPath('batch-booking-modules-light.png'), fullPage: true })
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'dark'))
  await page.screenshot({ path: info.outputPath('batch-booking-modules-dark.png'), fullPage: true })
  const checkbox = page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' })
  await expect(checkbox).toBeEnabled()
  await checkbox.check()
  await page.getByRole('button', { name: '1 Buchung anlegen' }).click()
  await expect(page.getByText('Angelegt · 2026-41', { exact: true })).toBeVisible()
  expect((await page.evaluate(() => (window as any).applied))[0].candidate).toMatchObject({
    tags: ['Freizeit', 'Jugendhaus'], budgets: [{ id: 9, amount: 10 }, { id: 10, amount: 19.99 }], earmarks: [{ id: 11, amount: 29.99 }]
  })
  const saved = page.getByRole('region', { name: 'Buchungsdaten', exact: true })
  await expect(saved.getByRole('button', { name: 'Budget 1', exact: true })).toBeDisabled()
  await expect(saved.getByRole('textbox', { name: 'Neuen Tag hinzufügen' })).toBeDisabled()
})

test('preassigned modules are expanded and removing them clears the draft assignments', async ({ page }) => {
  await page.evaluate(() => (window as any).renderBatch({ preassigned: true }))
  await page.getByRole('button', { name: 'Details zu Bankbeleg 1' }).click()
  await expect(page.getByRole('button', { name: 'Budget 1', exact: true })).toContainText('Jugendhaus')
  await expect(page.getByRole('button', { name: 'Zweckbindung 1', exact: true })).toContainText('Jugendförderung')
  await expect(page.getByRole('textbox', { name: 'Neuen Tag hinzufügen' })).toBeVisible()
  await page.getByRole('button', { name: 'Budget-Feld entfernen' }).click()
  await page.getByRole('button', { name: 'Zweckbindung-Feld entfernen' }).click()
  await page.getByRole('button', { name: 'Tag-Feld entfernen' }).click()
  await expect(page.getByLabel('Kommentar', { exact: true })).toHaveCount(0)
  const checkbox = page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' })
  await expect(checkbox).toBeEnabled()
  await checkbox.check()
  await page.getByRole('button', { name: '1 Buchung anlegen' }).click()
  await expect(page.getByText('Angelegt · 2026-41', { exact: true })).toBeVisible()
  expect((await page.evaluate(() => (window as any).applied))[0].candidate).toMatchObject({ budgets: [], earmarks: [], tags: [] })
})

test('approves a member payment together with its automatic contribution allocation', async ({ page }, info) => {
  await page.setViewportSize({width:1440,height:960})
  await page.evaluate(() => { document.documentElement.setAttribute('data-theme','dark'); (window as any).renderBatch({ membership: true, single: true }) })
  await expect(page.locator('.bank-ai-batch-membership-step')).toContainText('Niko Dubio')
  await expect(page.locator('.bank-ai-batch-booking-step')).toContainText('Neue Buchung')
  await expect(page.locator('.bank-ai-batch-membership-step')).toContainText('Anschließend')
  await page.screenshot({path:info.outputPath('membership-review-hierarchy-dark.png'), animations:'disabled'})
  const footer = page.locator('.bank-ai-batch-footer')
  const bounds = await footer.evaluate(el => {
    const outer = el.getBoundingClientRect(), summary = el.querySelector('.bank-ai-batch-selection')!.getBoundingClientRect(), buttons = el.querySelector('.bank-ai-batch-footer-actions')!.getBoundingClientRect()
    return {left:summary.left-outer.left,right:outer.right-buttons.right,top:buttons.top-outer.top,bottom:outer.bottom-buttons.bottom}
  })
  expect(bounds.left).toBeGreaterThanOrEqual(16)
  expect(bounds.right).toBeGreaterThanOrEqual(16)
  expect(bounds.top).toBeGreaterThanOrEqual(14)
  expect(bounds.bottom).toBeGreaterThanOrEqual(14)
  await page.getByRole('button', { name: 'Details zu Bankbeleg 1' }).click()
  const allocation = page.getByRole('region', { name: 'Beitragsaufteilung' })
  await expect(allocation.getByRole('row')).toHaveCount(4)
  await expect(allocation).toContainText('2027-01')
  await page.getByRole('checkbox', { name: 'Bankbeleg 1 auswählen' }).check()
  await page.getByRole('button', { name: '1 Buchung anlegen' }).click()
  expect(await page.evaluate(() => (window as any).applied[0])).toEqual(expect.objectContaining({ id: 1, membershipAllocation: { allocations: expect.arrayContaining([expect.objectContaining({ periodKey: '2027-01', amount: 5, remaining: 5 })]) } }))
})
