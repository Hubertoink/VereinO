import { expect, test, type Page } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'
import path from 'node:path'

let script: string
let css: string
test.beforeAll(async () => {
  css = (
    await Promise.all(
      [
        'src/renderer/styles.css',
        'src/renderer/components/modalHeader.css',
        'src/renderer/views/Settings/settings.css'
      ].map((file) => fs.readFile(file, 'utf8'))
    )
  ).join('\n')
  const result = await build({
    stdin: {
      resolveDir: process.cwd(),
      loader: 'tsx',
      contents: `
      import React from 'react'
      import { createRoot } from 'react-dom/client'
      import { SettingsView } from './src/renderer/views/Settings/SettingsView'
      import { ToastProvider } from './src/renderer/context/ToastContext'
      const profile = new URLSearchParams(location.search).get('profile') || 'GENERAL'
      const tags = [{id:1,name:'Getränke',color:'#B00050',usage:12},{id:2,name:'Jugendarbeit',color:'#00A878',usage:4}]
      const accounts = [{id:1,name:'Vereinskonto',kind:'BANK',iban:'DE00 0000 0000 0000 0000 00',color:'#1976D2',sortOrder:1,isActive:1},{id:2,name:'Barkasse',kind:'CASH',color:'#00A878',sortOrder:2,isActive:1}]
      window.saved = []
      window.notifications = []
      const stored = {'org.name':'Beispielverein e.V.', 'org.address':'Musterstraße 12', 'org.cashier':'Erika Muster', 'backup.auto':'PROMPT'}
      const notify = (type,text) => window.notifications.push({type,text})
      window.api = {
        app:{version:async()=>({version:'4.15.2'})},
        settings:{get:async({key})=>({value:stored[key]??null}),set:async({key,value})=>{stored[key]=value;window.saved.push({key,value});return {ok:true}}},
        organizations:{active:async()=>({organization:{id:'demo',name:'Beispielverein',dbRoot:'C:/VereinO'}})},
        classifications:{primary:{list:async()=>({profile,canChangeProfile:false,values:[{id:1,name:'Material',color:'#1976D2',icon:null,isActive:true},{id:2,name:'Sonstiges',color:'#A949EF',icon:null,isActive:true}]})}},
        tags:{list:async()=>({rows:tags})},paymentAccounts:{list:async()=>({rows:accounts}),
          previewOpeningVoucher:async({accountId,voucherNo})=>{
            if(accountId!==1 || voucherNo!=='2026-08-03_00013') throw new Error("Error invoking remote method 'paymentAccounts.previewOpeningVoucher': Error: Keine Buchung mit dieser Belegnummer auf diesem Konto gefunden.")
            return {date:'2026-08-03',amountCents:-13025,description:'Übernommener Bankbestand'}
          },upsert:async value=>{window.saved.push(value);return {id:value.id}}},
        parties:{list:async()=>({rows:[{id:1,name:'Beispielhandel',role:'SUPPLIER',city:'Musterstadt',isActive:1,voucherCount:12,invoiceCount:0,submissionCount:0,email:'kontakt@example.test'}]})},
        receiptWidget:{getAutostart:async()=>({enabled:false,available:true})},
        budgets:{list:async()=>({rows:[]})},bindings:{list:async()=>({rows:[]})},
        ocr:{status:async()=>({available:true,languages:['deu','eng']})},
        taxExemption:{get:async()=>({certificate:null})},
        reports:{years:async()=>({years:[2026,2025]}),summary:async()=>({byType:[{key:'IN',gross:1200},{key:'OUT',gross:-400}]})},
        yearEnd:{status:async()=>({closedUntil:null}),preview:async({year})=>({from:year+'-01-01',to:year+'-12-31',totals:{inGross:1200,outGross:-400}})},
        cashChecks:{list:async()=>({rows:[{id:1,date:'2026-10-31',soll:500,ist:500,diff:0,inspector1Name:'Erika Muster'}]})},
        updates:{getState:async()=>({status:'idle',currentVersion:'4.15.2'}),onStateChanged:()=>()=>{}},
        db:{location:{get:async()=>({root:'C:/VereinO',dbPath:'C:/VereinO/database.sqlite',filesDir:'C:/VereinO/files',organization:{id:'demo',name:'Beispielverein'}})}},
        backup:{getDir:async()=>({ok:true,dir:'D:/VereinO/Sicherungen'}),getProgress:async()=>null,onProgress:()=>()=>{},list:async()=>({ok:true,backups:[{filePath:'D:/VereinO/Sicherungen/database_manual.sqlite',size:1234567,mtime:1794610800000}]})},
      }
      const labels={actions:'Aktionen',date:'Datum',description:'Beschreibung',gross:'Brutto',sphere:'Kategorie',paymentMethod:'Zahlweg'}
      const initial={organizationProfile:profile,displayDensity:'compact',cols:{actions:true,date:true,description:true,gross:true},order:['actions','date','description','gross'],journalLimit:20,dateFmt:'ISO',sidebarCollapsed:false,navLayout:'left',navIconColorMode:'color',colorTheme:'earthy-tones',journalRowStyle:'both',journalRowDensity:'normal',backgroundImage:'none',backgroundImageVisibility:60,customBackgroundImage:null,glassModals:false,bookingView:'classic',showBookingDraftTabs:true,showBookingEditTabs:false,bookingEntryPresentation:'modal',allowVoucherDeletion:false,quickAddAfterSave:'close',visibleNavItems:['Dashboard','Buchungen','Budgets','Einstellungen'],tagDefs:tags,paymentAccounts:accounts}
      function Fixture() {
        const [state,setState]=React.useState(initial)
        const setters=React.useMemo(()=>Object.fromEntries(Object.keys(initial).map(key=>['set'+key[0].toUpperCase()+key.slice(1),value=>setState(old=>({...old,[key]:typeof value==='function'?value(old[key]):value}))])),[])
        window.preferences=state
        return <SettingsView {...state} {...setters} defaultCols={initial.cols} defaultOrder={initial.order} labelForCol={key=>labels[key]||key} notify={notify} bumpDataVersion={()=>{}} openSetupWizard={()=>{window.setupOpened=true}} />
      }
      createRoot(document.getElementById('root')).render(<ToastProvider><Fixture /></ToastProvider>)
    `
    },
    bundle: true,
    platform: 'browser',
    jsx: 'automatic',
    write: false,
    loader: { '.css': 'empty', '.md': 'text' },
    alias: { '@renderer': path.resolve('src') },
    define: { 'process.env.NODE_ENV': '"production"' }
  })
  script = result.outputFiles[0].text
})

async function openSettings(page: Page, profile = 'GENERAL', theme = 'earthy-tones') {
  await page.route('http://settings-design.test/**', async (route) => {
    const url = new URL(route.request().url())
    if (url.pathname.startsWith('/assets/') && !url.pathname.includes('..')) {
      const file = path.join(process.cwd(), 'src/renderer', decodeURIComponent(url.pathname))
      return route.fulfill({
        body: await fs.readFile(file),
        contentType: file.endsWith('.woff2')
          ? 'font/woff2'
          : file.endsWith('.png')
            ? 'image/png'
            : 'image/jpeg'
      })
    }
    return route.fulfill({
      contentType: 'text/html',
      body: `<html data-theme="${theme === 'light' ? 'light' : 'dark'}" data-color-theme="${theme === 'light' ? 'professional-light' : theme}"><body><main id="root" style="padding:16px;box-sizing:border-box"></main></body></html>`
    })
  })
  await page.goto(`http://settings-design.test/?profile=${profile}`)
  await page.addStyleTag({ content: css })
  await page.addScriptTag({ content: script })
  await expect(page.locator('.settings-page-header h2')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
}

async function selectPane(page: Page, tile: string) {
  await page.evaluate(
    (tile) => window.dispatchEvent(new CustomEvent('settings:selectTile', { detail: { tile } })),
    tile
  )
}

test('opening voucher number alone previews the signed amount and actual date before conversion', async ({ page }) => {
  await openSettings(page)
  await selectPane(page, 'paymentAccounts')
  await page.getByRole('button', { name: 'Vereinskonto bearbeiten' }).click()
  const modal = page.getByRole('dialog', { name: 'Konto bearbeiten' })
  await modal.getByLabel('Stichtag').fill('2025-01-01')
  await modal.getByText('Bestehende Anfangsbuchung übernehmen').click()
  const voucherNo = modal.getByLabel('Belegnummer')
  await voucherNo.fill('fehlt')
  await modal.getByRole('button', { name: 'Beleg prüfen' }).click()
  await expect.poll(() => page.evaluate(() => (window as any).notifications.at(-1)?.text)).toBe('Keine Buchung mit dieser Belegnummer auf diesem Konto gefunden.')
  await voucherNo.fill('2026-08-03_00013')
  await modal.getByRole('button', { name: 'Beleg prüfen' }).click()
  await expect(modal.getByLabel('Stichtag')).toHaveValue('2026-08-03')
  await expect(modal.getByLabel('Anfangsbestand (€)')).toHaveValue('-130,25')
  await expect(modal.getByRole('status')).toContainText('Übernommener Bankbestand')
  expect(await page.evaluate(() => (window as any).saved.length)).toBe(0)
  await voucherNo.fill('')
  await expect(modal.getByLabel('Anfangsbestand (€)')).toHaveValue('')
  await voucherNo.fill('2026-08-03_00013')
  await modal.getByRole('button', { name: 'Beleg prüfen' }).click()
  await modal.getByRole('button', { name: 'Anfangsbuchung übernehmen' }).click()
  await expect(modal).toHaveCount(0)
  expect(await page.evaluate(() => (window as any).saved)).toEqual([expect.objectContaining({ openingVoucherNo: '2026-08-03_00013', opening: { date: '2026-08-03', amountCents: -13025 } })])
})

const panes = [
  ['general', 'Darstellung'],
  ['workflow', 'Arbeitsweise'],
  ['table', 'Tabelle'],
  ['storage', 'Speicher & Sicherungen'],
  ['docling', 'Texterkennung'],
  ['import', 'Datenimport'],
  ['org', 'Organisation'],
  ['categories', 'Kategorien'],
  ['paymentAccounts', 'Zahlungskonten'],
  ['parties', 'Geschäftspartner'],
  ['tags', 'Tags'],
  ['aiPatterns', 'KI-Muster'],
  ['cashCheck', 'Kassenprüfung'],
  ['yearEnd', 'Jahresabschluss'],
  ['updates', 'Updates']
]

for (const theme of ['earthy-tones', 'light']) {
  test(`all settings pages remain readable and contained in ${theme}`, async ({ page }, info) => {
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))
    await page.setViewportSize({ width: 1280, height: 1000 })
    await openSettings(page, 'GENERAL', theme)
    for (const [tile, title] of panes) {
      await selectPane(page, tile)
      const header = page.locator('.settings-page-header h2')
      await expect(header).toContainText(title)
      await expect(header).toHaveCSS('font-size', '14px')
      await page.screenshot({ path: info.outputPath(`${tile}-desktop.png`), fullPage: true })
      await page.setViewportSize({ width: 560, height: 850 })
      await expect
        .poll(
          () => page.locator('.settings-content').evaluate((el) => el.scrollWidth - el.clientWidth),
          { message: `${tile} must not overflow its content panel` }
        )
        .toBeLessThanOrEqual(1)
      await page.screenshot({ path: info.outputPath(`${tile}-narrow.png`), fullPage: true })
      await page.setViewportSize({ width: 1280, height: 1000 })
    }
    expect(errors).toEqual([])
  })
}

test('table preferences update the preview and survive pane navigation', async ({ page }) => {
  await openSettings(page)
  await expect(page.getByRole('group', { name: 'Zeilenhöhe' })).toHaveCount(0)
  await selectPane(page, 'table')
  await page.getByRole('button', { name: 'Kompakt', exact: true }).click()
  await page.getByLabel('Zeilenlayout').selectOption('zebra')
  await page
    .getByRole('group', { name: 'Einträge pro Seite' })
    .getByRole('button', { name: '50', exact: true })
    .click()
  await page
    .getByRole('group', { name: 'Datumsformat' })
    .getByRole('button', { name: '15.01.2025' })
    .click()
  const preview = page.locator('.settings-table-preview')
  await expect(preview).toHaveAttribute('data-density', 'compact')
  await expect(preview).toHaveAttribute('data-row-style', 'zebra')
  await expect(preview.locator('tbody')).toContainText('15.01.2025')
  await page.getByRole('checkbox', { name: 'Beschreibung', exact: true }).uncheck()
  await expect(preview.getByRole('columnheader', { name: 'Beschreibung' })).toHaveCount(0)
  await selectPane(page, 'general')
  await selectPane(page, 'table')
  await expect(page.getByRole('button', { name: 'Kompakt', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true'
  )
  await expect(page.getByLabel('Zeilenlayout')).toHaveValue('zebra')
  expect(await page.evaluate(() => (window as any).preferences.journalLimit)).toBe(50)
})

test('donation defaults still require explicit saving', async ({ page }, info) => {
  await openSettings(page, 'NONPROFIT')
  await selectPane(page, 'donations')
  await expect(page.locator('.settings-page-header h2')).toHaveText('Spenden')
  await page.getByTitle('Finanzamt', { exact: true }).fill('Finanzamt Musterstadt')
  expect(await page.evaluate(() => (window as any).saved)).toEqual([])
  await page.getByRole('button', { name: 'Speichern', exact: true }).click()
  expect(await page.evaluate(() => (window as any).saved)).toContainEqual({
    key: 'donation.taxOffice',
    value: 'Finanzamt Musterstadt'
  })
  await page.screenshot({ path: info.outputPath('donations-desktop.png'), fullPage: true })
  await page.setViewportSize({ width: 560, height: 850 })
  expect(
    await page.locator('.settings-content').evaluate((el) => el.scrollWidth - el.clientWidth)
  ).toBeLessThanOrEqual(1)
})


test('general budget management offers members as an optional navigation module', async ({ page }) => {
  await openSettings(page, 'GENERAL')
  await selectPane(page, 'general')
  const toggle = page.getByRole('checkbox', { name: 'Mitglieder in Navigation anzeigen', exact: true })
  await toggle.check()
  expect(await page.evaluate(() => (window as any).preferences.visibleNavItems)).toContain('Mitglieder')
  await toggle.uncheck()
  expect(await page.evaluate(() => (window as any).preferences.visibleNavItems)).not.toContain('Mitglieder')
})
