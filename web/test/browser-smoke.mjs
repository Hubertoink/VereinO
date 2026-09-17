// Run against Vite with WEB_TEST_URL; all API requests are isolated mocks.
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined })
const base = process.env.WEB_TEST_URL || 'http://localhost:5174'
try {
  for (const role of ['ADMIN', 'EDITOR', 'USER']) {
    const page = await browser.newPage({ viewport: { width: 1360, height: 900 } })
    const errors = []
    page.on('pageerror', error => errors.push(error.message))
    const user = { id: 1, email: 'team@verein.test', role, organizationId: 1 }
    const fields = { version: 1, date: '2026-09-15', type: 'OUT', description: 'Trainingsmaterial', grossAmountCents: 12345, sphere: 'IDEELL', paymentMethod: 'BANK', tags:['Training'] }
    const drafts = [{ ...fields, id: 1, status: 'SUBMITTED', createdBy: 2, createdByEmail: 'user@verein.test' }]
    const bookings = []
    const mutations = []
    await page.route('**/api/**', async route => {
      const request = route.request(), path = new URL(request.url()).pathname, method = request.method()
      if(path==='/api/settings/modules')return route.fulfill({json:{version:0}})
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
      if(path==='/api/planning/options')return route.fulfill({json:{budgets:[],earmarks:[]}})
      if(path==='/api/ai/documents')return route.fulfill({json:{rows:[]}})
      if(path==='/api/ai/settings')return route.fulfill({json:{enabled:false,hasApiKey:false}})
      if (method !== 'GET') { assert.equal(request.headers()['x-vereino-request'], '1'); mutations.push(path) }
      let result
      if (/^\/api\/bookings\/\d+\/attachments$/.test(path)) result = { files: [], canUpload: true, canDelete: true }
      else if (path === '/api/classifications/primary') result = { profile: 'NONPROFIT', definition: { primaryLabel: 'Sphäre' }, values: [] }
      else if (path === '/api/settings/preferences') result = { preferences: { version: 0, themeMode: 'dark', colorTheme: 'default', navLayout: 'left', navIconColorMode: 'color' } }
      else if (path === '/api/settings/workflow') result = { version: 0, settings: { version: 0, bookingView: 'plus', showBookingDraftTabs: false, showBookingEditTabs: false, bookingEntryPresentation: 'flyout', allowVoucherDeletion: false, quickAddAfterSave: 'close' } }
      else if (path === '/api/settings/table') result = { version: 0, settings: { version: 0, dateFormat: 'de', journalRowStyle: 'both', journalRowDensity: 'normal', journalLimit: 50, columns: { date: true, voucherNo: true, type: true, sphere: true, description: true, paymentMethod: true, gross: true }, columnOrder: ['date', 'voucherNo', 'type', 'sphere', 'description', 'paymentMethod', 'gross'] } }
      else if (path === '/api/settings/profile') result = { profile: 'NONPROFIT', version: 0 }
      else if (path === '/api/organizations') result = { organizations: [{ id: 1, name: 'VereinO', profile: 'NONPROFIT', role }] }
      else if (path === '/api/auth/status') result = { setupRequired: false }
      else if (path === '/api/auth/me') result = { user }
      else if (path === '/api/drafts' && method === 'GET') result = { drafts: role === 'USER' ? drafts.filter(d => d.createdBy === 1) : drafts }
      else if (path === '/api/drafts' && method === 'POST') {
        const draft = { ...request.postDataJSON(), id: 2, version: 1, status: 'DRAFT', createdBy: 1 }
        drafts.push(draft); result = { draft }
      } else if (path === '/api/drafts/1' && method === 'PATCH') {
        assert.equal(request.postDataJSON().version,1)
        Object.assign(drafts[0],request.postDataJSON(),{version:2});result={draft:drafts[0]}
      } else if (path === '/api/drafts/1/approve') {
        drafts[0].status = 'APPROVED'
        assert.equal(request.postDataJSON().version,drafts[0].version)
        const booking = { ...drafts[0], id: 1, voucherNo: 'WEB-0001' }
        bookings.push(booking); result = { booking }
      } else if (path === '/api/users') result = { users: [user] }
      else if (path === '/api/planning/budgets' || path === '/api/planning/earmarks') result = { rows: [] }
      else if (path === '/api/bookings' && method === 'GET') result = { bookings }
      else if (path === '/api/bookings' && method === 'POST') {
        const booking = { ...request.postDataJSON(), id: 2, version: 1, voucherNo: 'WEB-0002' }
        bookings.push(booking); result = { booking }
      } else if (path === '/api/bookings/2' && method === 'PATCH') {
        Object.assign(bookings.find(b => b.id === 2), request.postDataJSON()); result = { booking: bookings.find(b => b.id === 2) }
      } else throw new Error(`Unexpected API request: ${method} ${path}`)
      await route.fulfill({ json: result })
    })
    await page.goto(base)
    if (role !== 'USER') {
      await page.getByRole('heading', { name: 'Buchungen Plus', exact: true }).waitFor()
      await page.getByRole('button', { name: 'Entwürfe', exact: true }).click()
      await page.getByRole('button', { name: 'Prüfen', exact: true }).click()
      const review=page.getByRole('dialog',{name:'Entwurf prüfen',exact:true})
      await review.locator('.voucher-info-summary').waitFor()
      for(const viewport of [{width:390,height:700},{width:800,height:500},{width:1360,height:900}]){
        await page.setViewportSize(viewport)
        assert(await review.evaluate(el=>el.scrollWidth<=el.clientWidth),'review horizontal overflow')
        const box=await review.boundingBox();assert(box.y>=0&&box.y+box.height<=viewport.height+1)
      }
      if(role==='ADMIN')await page.screenshot({path:'/tmp/vereino-draft-review-new.png'})
      await review.getByRole('button',{name:'Bearbeiten',exact:true}).click()
      const draftEdit=page.getByRole('dialog',{name:'Entwurf bearbeiten',exact:true});await draftEdit.waitFor()
      await draftEdit.getByLabel('Neuen Tag hinzufügen').fill('Geprüft');await draftEdit.getByLabel('Neuen Tag hinzufügen').press('Enter')
      await draftEdit.getByRole('button',{name:'Entwurf speichern',exact:true}).click()
      await review.waitFor();await review.getByText('Geprüft',{exact:true}).waitFor()
      await page.getByRole('button', { name: 'Validieren und übernehmen' }).click()
      assert.deepEqual(bookings[0].tags,['Training','Geprüft'])
      await page.getByText('Entwurf freigegeben und als Buchung übernommen.').waitFor()
      assert(mutations.includes('/api/drafts/1/approve'))
    } else assert.equal(await page.getByRole('button', { name: 'Buchungen', exact: true }).count(), 0)
    await page.getByRole('heading', { name: 'Buchungsentwürfe' }).waitFor()
    await page.getByRole('button', { name: 'Entwurf erstellen' }).click()
    await page.getByPlaceholder('Was wurde gebucht?').fill('Mitgliedsbeitrag')
    await page.getByLabel('Brutto-Betrag', { exact: true }).fill('1234.56')
    await page.getByRole('button',{name:'+ Tag',exact:true}).click()
    await page.getByRole('button',{name:'Tag Training hinzufügen',exact:true}).click()
    await page.getByLabel('Neuen Tag hinzufügen',{exact:true}).fill('Neuer Entwurfstag')
    await page.getByLabel('Neuen Tag hinzufügen',{exact:true}).press('Enter')
    await page.getByRole('button',{name:'+ Kunde',exact:true}).click()
    const draftModal=page.getByRole('dialog',{name:'Entwurf erfassen',exact:true})
    for(const viewport of [{width:390,height:700},{width:800,height:500},{width:1360,height:900}]){
      await page.setViewportSize(viewport)
      assert(await draftModal.locator('.compact-booking-flyout__body').evaluate(el=>el.scrollWidth<=el.clientWidth),`${role}: draft body horizontal overflow`)
      const box=await draftModal.boundingBox();assert(box.x>=0&&box.y>=0&&box.x+box.width<=viewport.width+1&&box.y+box.height<=viewport.height+1)
    }
    if(role==='USER')await page.screenshot({path:'/tmp/vereino-draft-editor-tags.png'})
    await page.getByRole('button', { name: 'Entwurf speichern', exact: true }).click()
    await page.getByText('Entwurf gespeichert.').waitFor()
    assert.equal(drafts.at(-1).grossAmountCents, 123456)
    assert.deepEqual(drafts.at(-1).tags,['Training','Neuer Entwurfstag'])
    if (role !== 'USER') {
      await page.getByRole('button', { name: 'Buchungen', exact: true }).click()
      const row = page.locator('.bp-row').filter({ hasText: 'Trainingsmaterial' })
      await row.dblclick()
      await page.locator('.voucher-info-modal').waitFor()
      await page.keyboard.press('Escape')
      await page.getByRole('button', { name: 'Neue Buchung', exact: true }).click()
      const dialog = page.getByRole('dialog', { name: 'Buchung erfassen', exact: true })
      await dialog.getByPlaceholder('Was wurde gebucht?').fill('Spende')
      await dialog.getByRole('button', { name: 'Intelligente Buchungsvorschläge' }).waitFor()
      await dialog.getByRole('button', { name: 'Intelligente Buchungsvorschläge' }).click()
      await dialog.getByRole('dialog', { name: 'Intelligente Buchungsvorschläge' }).waitFor()
      await dialog.getByPlaceholder('Was wurde gebucht?').fill('Direkte Buchung')
      await dialog.getByLabel('Brutto-Betrag', { exact: true }).fill('42.50')
      await dialog.getByRole('button',{name:'+ Tag',exact:true}).click()
      await dialog.getByLabel('Neuen Tag hinzufügen',{exact:true}).fill('Direkt angelegt')
      await dialog.getByLabel('Neuen Tag hinzufügen',{exact:true}).press('Enter')
      await dialog.getByRole('button', { name: 'Buchung speichern', exact: true }).click()
      await page.locator('.bp-row').filter({ hasText: 'Direkte Buchung' }).click()
      assert.equal(bookings.at(-1).grossAmountCents, 4250)
      assert.deepEqual(bookings.at(-1).tags,['Direkt angelegt'])
      await page.locator('.bp-row').filter({hasText:'Direkte Buchung'}).getByRole('button',{name:'Nach Tag „Direkt angelegt“ filtern',exact:true}).waitFor()
      if (role === 'ADMIN') {
        await page.getByRole('button', { name: 'Bearbeiten', exact: true }).click()
        const edit = page.getByRole('dialog', { name: 'Buchung bearbeiten', exact: true })
        await edit.getByPlaceholder('Was wurde gebucht?').fill('Geänderte Buchung')
        await edit.getByRole('button', { name: 'Buchung speichern', exact: true }).click()
        await page.locator('.bp-row').filter({ hasText: 'Geänderte Buchung' }).waitFor()
        assert(mutations.includes('/api/bookings/2'))
      } else assert.equal(await page.getByRole('button', { name: 'Bearbeiten', exact: true }).count(), 0)
    }
    for (const width of [390, 800, 1360]) {
      await page.setViewportSize({ width, height: 900 })
      assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${role}: horizontal overflow at ${width}`)
    }
    assert.deepEqual(errors, [])
    await page.close()
    console.log(`${role}: original UI, role navigation, drafts, booking details, cents and responsive checks passed`)
  }
} finally { await browser.close() }
