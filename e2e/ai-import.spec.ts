import { expect, test } from '@playwright/test'
import { build } from 'esbuild'
import fs from 'node:fs/promises'

let script: string, css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css', 'src/renderer/components/modalHeader.css', 'src/renderer/views/Settings/components/aiImportModal.css'].map(p => fs.readFile(p, 'utf8')))).join('\n')
  const result = await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React from 'react'
    import {createRoot} from 'react-dom/client'
    import {AiImportModal} from './src/renderer/views/Settings/components/AiImportModal'
    const clone = x => JSON.parse(JSON.stringify(x))
    let job
    const row = (id, description, amount) => ({ draft: { id, sourceRow: Number(id), status: 'error', issues: [{level:'error', code:'relation', message:'Mögliche Beziehung prüfen.'}], original: {Datum:'2026-06-01',Beschreibung:description,Betrag:amount}, values:{date:'2026-06-01',description,type:amount>0?'IN':'OUT',category:'Verwaltung',paymentAccount:'Testkasse',grossAmount:Math.abs(amount),tags:'Bürobedarf'} }, sourceValues:{description},origins:{date:'source',description:'source',category:'ai',paymentAccount:'default',tags:'ai',grossAmount:'source'}, reasons:{tags:'Wiederkehrende Büroausgaben'},selected:true,relationsChecked:false })
    window.calls = {commit:0,save:0}
    window.api = { imports: {
      aiList: async () => job ? [clone(job)] : [],
      aiPreview: async () => ({sheets:[{name:'Buchungen',headerRow:1,headers:['Datum','Beschreibung','Betrag'],sample:[{Datum:'2026-06-01',Beschreibung:'Papier Büro',Betrag:20}],count:2,mapping:{date:'Datum',description:'Beschreibung',grossAmount:'Betrag'}}],profile:'GENERAL',accounts:[{id:1,name:'Testkasse',label:'Testkasse'}],classifications:[],hasApiKey:true}),
      aiCreate: async input => { window.input = input; job = {id:'fixture',revision:1,fileName:input.fileName,sheetName:input.sheetName,profile:'GENERAL',status:'paused',phase:'mapping',total:2,completed:0,options:input.options,rows:[],masterData:[],relations:[],warnings:[],masterDataAccepted:false,updatedAt:new Date().toISOString()};return clone(job)},
      aiStart: async () => {job.status='running';return clone(job)},
      aiGet: async () => {if(job.status==='running'){Object.assign(job,{status:'review',phase:'done',rows:[row('2','Papier Büro',-20),row('3','Erstattung Papier Büro',20)],relations:[{id:'r1',rowIds:['2','3'],kind:'refund',reason:'Gleicher Betrag und passende Erstattung.'}],masterData:[{id:'tag',entity:'tags',name:'Bürobedarf',reference:'Bürobedarf',sourceSheet:'KI-Vorschlag',sourceRow:2,kind:'',year:'',amountPlanned:'',sphere:'',category:'',code:'',status:'new',issues:[]}]})}return clone(job)},
      aiDelete: async () => {job=null;return {deleted:true}},
      aiReview: async input => {const next={...clone(job),...clone(input)};next.rows.forEach(r=>{r.draft.issues=r.selected&&!r.relationsChecked?[{level:'error',code:'relation',message:'Beziehung offen'}]:[]});return next},
      aiSave: async input => {window.calls.save++; job={...job,...clone(input),revision:job.revision+1};job.rows.forEach(r=>{r.draft.issues=r.selected&&!r.relationsChecked?[{level:'error',code:'relation',message:'Mögliche Beziehung prüfen.'}]:[];r.draft.status=r.draft.issues.length?'error':'ok'});return clone(job)},
      aiCommit: async () => {window.calls.commit++;job.status='committed';job.imported=job.rows.filter(r=>r.selected).length;return clone(job)},
      aiCancel: async () => {job.status='paused';return clone(job)}
    }}
    function App(){const[open,setOpen]=React.useState(true);return open?<AiImportModal onClose={()=>setOpen(false)}/>:<button onClick={()=>setOpen(true)}>Import öffnen</button>}
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, write: false, jsx: 'automatic', platform: 'browser', loader: { '.css': 'empty' }, define: { 'process.env.NODE_ENV': '"production"' } })
  script = result.outputFiles[0].text
})

async function open(page: import('@playwright/test').Page) {
  await page.route('http://ai-import.test/**', route => route.fulfill({contentType:'text/html',body:'<html data-theme="dark"><div id="root"></div></html>'}))
  await page.goto('http://ai-import.test/')
  await page.addStyleTag({content:css})
  await page.addScriptTag({content:script})
  await page.locator('input[type=file]').setInputFiles({name:'KI-Test.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:Buffer.from('fixture')})
}

for (const width of [1280, 640]) test(`overlays booking details without moving the table or KPIs at ${width}px`, async ({page}, info) => {
  await page.setViewportSize({width, height:900})
  await open(page)
  await page.getByRole('button',{name:'KI-Analyse starten'}).click()
  await expect(page.getByRole('button',{name:'Zeile 2',exact:true})).toBeVisible()
  const dimensions = () => page.evaluate(() => ['.ai-import-metrics', '.ai-import-table-scroll'].map(selector => {
    const r = document.querySelector(selector)!.getBoundingClientRect()
    return {x:r.x, y:r.y, width:r.width, height:r.height}
  }))
  const before = await dimensions()
  await page.getByRole('button',{name:'Zeile 2',exact:true}).click()
  const detail = page.getByRole('dialog',{name:'Details Zeile 2'})
  await expect(detail).toBeVisible()
  expect(await dimensions()).toEqual(before)
  const bounds = await detail.boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(width)
  await page.screenshot({path:info.outputPath('overlay-details.png'),fullPage:true,animations:'disabled'})
  await page.keyboard.press('Escape')
  await expect(detail).toHaveCount(0)
  await expect(page.getByRole('dialog',{name:'KI-Import',exact:true})).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  expect(await dimensions()).toEqual(before)
})

test('keeps invalid source dates visible and uses the shared date picker for correction', async ({page}, info) => {
  await open(page)
  await page.evaluate(() => {
    const api = (window as any).api.imports
    const get = api.aiGet
    api.aiGet = async (input: unknown) => {
      const result = await get(input)
      if (result.rows[0]) {
        result.rows[0].draft.values.date = '2026-02-30'
        result.rows[0].draft.original.Datum = '2026-02-30'
      }
      return result
    }
  })
  await page.getByRole('button',{name:'KI-Analyse starten'}).click()
  await page.getByRole('button',{name:'Zeile 2',exact:true}).click()
  await page.getByRole('button',{name:'Bearbeiten',exact:true}).click()
  const date = page.getByLabel('Datum Zeile 2',{exact:true})
  await expect(date).toHaveAttribute('type','date')
  await expect(date).toHaveValue('')
  await expect(page.getByText(/Ungültiger Datumswert: 2026-02-30/)).toBeVisible()
  await date.evaluate((input: HTMLInputElement) => {
    input.showPicker = () => input.setAttribute('data-picker-opened','true')
  })
  await page.getByRole('button',{name:'Kalender für Zeile 2 öffnen'}).click()
  await expect(date).toHaveAttribute('data-picker-opened','true')
  await date.fill('2026-02-28')
  await expect(date).toHaveValue('2026-02-28')
  await expect(page.getByText(/Ungültiger Datumswert:/)).toHaveCount(0)
  await page.screenshot({path:info.outputPath('date-picker.png'),fullPage:true,animations:'disabled'})
})

test('reviews source, saves edits on close, requires relationships and master approval, and commits once', async ({page}, info) => {
  await open(page)
  await page.getByLabel('Standardkonto für leere Kontofelder').selectOption('Testkasse')
  await page.getByRole('combobox', {name:'Tags',exact:true}).selectOption('suggest')
  await page.getByLabel('Hinweise an die KI').fill('Büroausgaben gemeinsam gruppieren.')
  await page.screenshot({path:info.outputPath('setup.png'),fullPage:true,animations:'disabled'})
  await page.getByRole('button',{name:'KI-Analyse starten'}).click()
  await expect(page.getByRole('tab',{name:'Buchungen (2)'})).toBeVisible()
  const commit=page.getByRole('button',{name:/Auswahl übernehmen/})
  await expect(commit).toBeDisabled()
  await page.getByRole('button',{name:'Zeile 2',exact:true}).click()
  await page.getByRole('button',{name:'Bearbeiten',exact:true}).click()
  await expect(page.getByText('Originalquelle: Buchungen, Zeile 2')).toBeVisible()
  await page.getByRole('button',{name:'Details anzeigen',exact:true}).click()
  await page.screenshot({path:info.outputPath('booking-details.png'),fullPage:true,animations:'disabled'})
  await page.getByRole('button',{name:'Bearbeiten',exact:true}).click()
  await page.getByLabel('Beschreibung Zeile 2',{exact:true}).fill('Papier Verwaltung')
  await page.getByRole('button',{name:'Schließen',exact:true}).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button',{name:'Weiter bearbeiten'}).click()
  await expect(page.getByRole('cell',{name:'Papier Verwaltung'})).toBeVisible()
  await page.locator('.ai-import-overlay').click({position:{x:2,y:2}})
  await page.getByRole('button',{name:'Import schließen',exact:true}).click()
  await page.getByRole('button',{name:'Import öffnen'}).click()
  await page.getByText('Gespeicherte Importaufträge (1)').click()
  await page.getByRole('button',{name:/KI-Test.xlsx · Bereit zur Prüfung/}).click()
  await expect(page.getByRole('cell',{name:'Papier Verwaltung'})).toBeVisible()
  await page.getByRole('button',{name:'Zeile 2',exact:true}).click()
  await page.getByRole('button',{name:'Bearbeiten',exact:true}).click()
  await expect(page.getByLabel('Beschreibung Zeile 2',{exact:true})).toHaveValue('Papier Verwaltung')
  await expect(page.getByRole('button',{name:'1 Beziehung offen'})).toBeVisible()
  await page.getByRole('tab',{name:'Beziehungen (1)'}).click()
  for(const checkbox of await page.getByLabel('Beziehung geprüft').all()) await checkbox.check()
  await expect(page.getByRole('button',{name:'Beziehungen geprüft'})).toBeVisible()
  await page.getByRole('button',{name:'Speichern & prüfen'}).click()
  await expect(commit).toBeDisabled()
  await page.getByRole('tab',{name:'Stammdaten (1)'}).click()
  await page.getByRole('button',{name:/Neue Stammdaten freigeben/}).click()
  await expect(commit).toBeEnabled()
  await page.getByRole('tab',{name:'Buchungen (2)'}).click()
  await page.getByRole('button',{name:'Suche',exact:true}).click()
  await page.getByRole('textbox',{name:'Suche',exact:true}).fill('Papier Verwaltung')
  await expect(page.getByRole('cell',{name:'Erstattung Papier B\u00fcro'})).toHaveCount(0)
  await page.screenshot({path:info.outputPath('shared-search.png'),fullPage:true,animations:'disabled'})
  await page.getByRole('button',{name:'Suche leeren'}).click()
  await page.getByRole('dialog',{name:'Suche',exact:true}).getByRole('button',{name:'Schließen',exact:true}).click()
  await expect(page.getByRole('combobox',{name:'Nach Status filtern'})).toHaveCount(0)
  await page.screenshot({path:info.outputPath('review.png'),fullPage:true,animations:'disabled'})
  await commit.click()
  await expect(page.getByText('2 Buchungen übernommen.')).toBeVisible()
  expect(await page.evaluate(()=>(window as any).calls.commit)).toBe(1)
  expect(await page.evaluate(()=>(window as any).input.options.tags)).toBe('suggest')
  await page.getByRole('button',{name:'Weitere Datei importieren'}).click()
  await page.getByRole('button',{name:/KI-Test.xlsx/}).click({button:'right'})
  await page.getByRole('menuitem',{name:'Importauftrag entfernen'}).click()
  await page.getByRole('button',{name:'Entfernen',exact:true}).click()
  await expect(page.getByText('Gespeicherte Importauftr\u00e4ge (1)')).toHaveCount(0)
})

test('dismisses details on outside clicks, preserves edits, and keeps row switching available', async ({page}) => {
  await open(page)
  await page.getByRole('button',{name:'KI-Analyse starten'}).click()
  await page.getByRole('button',{name:'Zeile 2',exact:true}).click()
  await page.getByRole('button',{name:'Bearbeiten',exact:true}).click()
  await page.getByLabel('Beschreibung Zeile 2',{exact:true}).fill('Erhaltener Entwurf')
  await expect(page.getByRole('dialog',{name:'Details Zeile 2'})).toBeVisible()
  await page.getByRole('heading',{name:'KI-Import',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Details Zeile 2'})).toHaveCount(0)
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
  await page.getByRole('button',{name:'Zeile 2',exact:true}).click()
  await page.getByRole('button',{name:'Bearbeiten',exact:true}).click()
  await expect(page.getByLabel('Beschreibung Zeile 2',{exact:true})).toHaveValue('Erhaltener Entwurf')
  await page.getByRole('button',{name:'Zeile 3',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Details Zeile 3'})).toBeVisible()
  await page.locator('.ai-import-overlay').click({position:{x:2,y:2}})
  await expect(page.getByRole('dialog',{name:'Details Zeile 3'})).toHaveCount(0)
  await expect(page.getByRole('dialog',{name:'KI-Import',exact:true})).toBeVisible()
  await expect(page.getByRole('alertdialog')).toHaveCount(0)
})

test('keeps header and actions inside a narrow viewport and pauses/resumes a saved job',async({page},info)=>{
  await page.setViewportSize({width:390,height:844})
  await open(page)
  await page.screenshot({path:info.outputPath('mobile.png'),fullPage:true,animations:'disabled'})
  const box=await page.getByRole('dialog').boundingBox()
  expect(box!.x).toBeGreaterThanOrEqual(0)
  expect(box!.x+box!.width).toBeLessThanOrEqual(390)
  await page.getByRole('button',{name:'KI-Analyse starten'}).click()
  await page.getByRole('button',{name:'Analyse pausieren'}).click()
  await expect(page.getByRole('button',{name:'Analyse fortsetzen'})).toBeVisible()
  await page.getByRole('button',{name:'Analyse fortsetzen'}).click()
  await expect(page.getByRole('tab',{name:'Buchungen (2)'})).toBeVisible()
})

 test('accepts a dropped CSV and renders German step labels intact', async ({page}) => {
  await open(page)
  const transfer = await page.evaluateHandle(() => {
    const dt = new DataTransfer()
    dt.items.add(new File(['Datum;Betrag\n2026-01-01;10'], 'abgelegt.csv', {type:'text/csv'}))
    return dt
  })
  await page.locator('.ai-import-file').dispatchEvent('drop', {dataTransfer:transfer})
  await expect(page.locator('.ai-import-file')).toContainText('abgelegt.csv')
  await expect(page.locator('.ai-import-steps')).toContainText('Datei ausw\u00e4hlen')
  await expect(page.locator('.ai-import-steps')).toContainText('Daten pr\u00fcfen')
  await expect(page.getByRole('dialog')).not.toContainText('\ufffd')
 })
