import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string, css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/modalHeader.css', 'src/renderer/components/finance/membershipPayments.css'].map(file => fs.readFile(file, 'utf8')))).join('\n')
  script = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import { createRoot } from 'react-dom/client'
    import MemberContributionDialog from './src/renderer/views/Mitglieder/MemberContributionDialog'
    window.applied=[]; window.toasts=[]; window.periods=Array.from({length:12},(_,i)=>({periodKey:'2027-'+String(i+1).padStart(2,'0'),interval:'MONTHLY',dueDate:'2027-'+String(i+1).padStart(2,'0')+'-01',expected:10,paidAmount:0,remaining:10}))
    window.api={members:{get:async()=>({name:'Niko Dubio'}),writeLetter:async()=>({ok:true})}, payments:{
      status:async()=>({hasPlan:1,state:'OK',amount:10,interval:'MONTHLY',nextDue:window.periods.find(p=>p.remaining)?.dueDate,dueAmount:0,prepaidAmount:window.periods.filter(p=>p.dueDate>new Date().toISOString().slice(0,10)).reduce((sum,p)=>sum+p.paidAmount,0),credit:0,credits:[],joinDate:'2026-06-01'}),
      periods:async()=>window.periods,history:async()=>({rows:[],total:0}),
      availableVouchers:async({q})=>[{id:9,voucherNo:'2026-00009',date:'2026-11-11',description:'Mitgliedsbeitrag Niko Dubio 100 EUR',available:100},{id:10,voucherNo:'2026-00010',date:'2026-11-11',description:'Mitgliedsbeitrag Niko Dubio 15 EUR',available:15}].filter(v=>!window.applied.some(p=>p.voucherId===v.id) && (v.description+' '+v.voucherNo).toLowerCase().includes(q.toLowerCase())),
      previewAllocation:async input=>{
        let rest=Math.round(input.amount*100)
        if(!rest) throw new Error('Bitte einen Zahlbetrag angeben.')
        const allocations=[]
        for(const p of window.periods.filter(p=>p.remaining>0 && (!input.startPeriod || p.periodKey>=input.startPeriod))){
          if(rest<=0) break
          const amount=Math.min(rest,Math.round(p.remaining*100))/100;rest-=Math.round(amount*100)
          allocations.push({...p,amount,paidBefore:p.paidAmount,remaining:p.remaining-amount})
        }
        return {token:'a'.repeat(64),memberId:2,memberName:'Niko Dubio',amount:input.amount,credit:rest/100,allocations}
      },
      allocate:async input=>{window.applied.push(input);const preview=await window.api.payments.previewAllocation(input);for(const a of preview.allocations){const p=window.periods.find(p=>p.periodKey===a.periodKey);p.paidAmount+=a.amount;p.remaining-=a.amount}return {ok:true,receiptId:1,preview}}
    }}
    createRoot(document.getElementById('root')).render(<MemberContributionDialog memberId={2} name="Niko Dubio" memberNo="0002" onClose={()=>{}} />)
  ` }, bundle: true, write: false, loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' }, plugins: [{ name: 'toast', setup(builder) {
    builder.onResolve({ filter: /\/context\/useToast$/ }, () => ({ path: 'toast', namespace: 'mock' }))
    builder.onLoad({ filter: /.*/, namespace: 'mock' }, () => ({ contents: 'export const useToast=()=>({notify:(...args)=>window.toasts.push(args)})', loader: 'js' }))
  } }] })).outputFiles[0].text
})
test.beforeEach(async ({ page }) => {
  await page.clock.setFixedTime(new Date('2026-11-11T12:00:00Z'))
  await page.setViewportSize({ width: 1280, height: 1000 })
  await page.route('http://contributions.test/**', route => route.fulfill({ contentType: 'text/html', body: '<html data-theme="dark"><div id="root"></div></html>' }))
  await page.goto('http://contributions.test/')
  await page.addStyleTag({ content: css }); await page.addScriptTag({ content: script })
})

test('assigns a whole payment to a member and automatically previews ten future months', async ({ page }, info) => {
  await expect(page.getByText('01.01.2027', { exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'Zahlung zuordnen', exact: true }).click()
  const save = page.getByRole('button', { name: 'Zahlung diesem Mitglied zuordnen' })
  await expect(save).toBeDisabled()
  await expect(page.getByLabel('Buchung suchen')).toHaveValue('Niko Dubio')
  const bookings = page.getByRole('table', { name: 'Noch nicht zugeordnete Buchungen' })
  await expect(bookings.getByRole('row')).toHaveCount(3)
  await page.getByRole('radio', { name: 'Buchung 2026-00009 auswählen' }).check()
  await expect(page.getByRole('status')).toContainText('2027-01 bis 2027-10')
  await expect(page.getByRole('combobox')).toHaveCount(0)
  await expect(page.getByLabel('Zahlbetrag (€)')).toHaveCount(0)
  await expect(page.getByLabel('Zahlungsdatum')).toHaveCount(0)
  await expect(save).toBeEnabled()
  await bookings.getByRole('row').filter({ hasText: '2026-00009' }).click()
  await expect(save).toBeEnabled()
  await save.scrollIntoViewIfNeeded()
  await page.screenshot({ path: info.outputPath('membership-prepayment-dark.png'), fullPage: true })
  await save.click()
  await expect(page.locator('.contribution-period[data-state="prepaid"]')).toHaveCount(6)
  const prepaid = page.locator('.contribution-kpis > div').filter({hasText:'Vorausbezahlt'})
  await expect(prepaid).toContainText('100,00')
  await page.getByRole('button', {name:'Drei Intervalle weiter'}).click()
  await expect(prepaid).toContainText('100,00')
  await expect(page.getByText('Nicht verrechnet', {exact:true})).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).applied[0])).toEqual(expect.objectContaining({memberId:2,voucherId:9,amount:100,token:'a'.repeat(64)}))
  expect(await page.evaluate(() => (window as any).applied[0].allocations)).toBeUndefined()
  await page.getByRole('button', { name: 'Zahlung zuordnen', exact: true }).click()
  await expect(bookings.getByRole('row')).toHaveCount(2)
  await expect(bookings).not.toContainText('2026-00009')
  await page.getByLabel('Buchung suchen').fill('2026-00010')
  await expect(bookings).toContainText('2026-00010')
  await page.getByLabel('Buchung suchen').fill('unbekannt')
  await expect(bookings).toContainText('Keine noch nicht zugeordneten Einnahmen gefunden.')
})

test('shows partial future coverage without marking it overdue and works on narrow screens', async ({ page }, info) => {
  await page.setViewportSize({width:430,height:900})
  await page.getByRole('button', { name: 'Zahlung zuordnen', exact: true }).click()
  await page.getByRole('radio', { name: 'Buchung 2026-00010 auswählen' }).check()
  const save = page.getByRole('button', { name: 'Zahlung diesem Mitglied zuordnen' })
  await expect(save).toBeEnabled()
  await save.click()
  await expect(page.locator('.contribution-period[data-state="prepaid"]')).toHaveCount(1)
  await expect(page.locator('.contribution-period[data-state="partial"]')).toHaveCount(1)
  await expect(page.locator('.contribution-kpis > div').filter({hasText:'Vorausbezahlt'})).toContainText('15,00')
  await expect(page.locator('.contribution-period[data-state="overdue"]')).toHaveCount(0)
  expect(await page.locator('.member-contribution-modal').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  expect(await page.locator('.contribution-panel').evaluate(el => el.scrollWidth <= el.clientWidth + 1)).toBe(true)
  await page.screenshot({ path: info.outputPath('membership-partial-mobile.png'), fullPage: true })
  await page.evaluate(() => {
    const readStatus = window.api.payments.status
    window.api.payments.status = async input => ({ ...await readStatus(input), credit: 25 })
    window.dispatchEvent(new Event('data-changed:members'))
  })
  await expect(page.locator('.contribution-kpis > div').filter({hasText:'Nicht verrechnet'})).toContainText('25,00')
  await expect(page.locator('.contribution-kpis > div').filter({hasText:'Vorausbezahlt'})).toContainText('15,00')
})

test('shows six intervals and moves the timeline by three in either direction', async ({ page }) => {
  const cards = page.locator('.contribution-period')
  const forward = page.getByRole('button', { name: 'Drei Intervalle weiter' })
  const back = page.getByRole('button', { name: 'Drei Intervalle zurück' })
  await expect(cards).toHaveCount(6)
  await expect(cards.first()).toContainText('2027-01')
  await expect(cards.last()).toContainText('2027-06')
  await expect(back).toBeDisabled()
  await expect(page.getByText('Weitere zwölf Monate anzeigen')).toHaveCount(0)
  await forward.click()
  await expect(cards).toHaveCount(6)
  await expect(cards.first()).toContainText('2027-04')
  await expect(cards.last()).toContainText('2027-09')
  await forward.click()
  await expect(cards.first()).toContainText('2027-07')
  await expect(cards.last()).toContainText('2027-12')
  await expect(forward).toBeDisabled()
  await back.click()
  await expect(cards.first()).toContainText('2027-04')
})
