import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import type { DashboardTasks, DashboardTaskGroup } from '../shared/dashboardTasks'

const task = (kind: DashboardTaskGroup['kind'], title: string, level: DashboardTaskGroup['level'], value: string): DashboardTaskGroup => ({ kind, title, level, value, count: level === 'clear' ? 0 : 1, detail: kind === 'bank' ? '11 Bankbelege zuzuordnen' : '30,00 € offen', target: { kind, filter: 'overdue' }, items: level === 'clear' ? [] : [{ id: `${kind}-1`, title: kind === 'bank' ? 'Vereinskonto' : 'Max Muster', detail: 'Seit 12 Tagen offen', amount: 30, level, target: { kind, accountId: kind === 'bank' ? 1 : undefined, filter: 'open' } }] })
const fixture: DashboardTasks = { today: '2026-10-04', bankAccounts: [{ id: 1, name: 'Vereinskonto', reminderDays: 14, lastImportAt: '2026-09-16', lastBookingDate: '2026-09-16', openCount: 11 }], groups: [task('bank','Bankimport','soon','1 Konto prüfen'),task('members','Mitgliedsbeiträge','urgent','3 Mitglieder'),task('invoices','Verbindlichkeiten','urgent','2 überfällig'),task('recurring','Abos','soon','2 zu prüfen'),task('reimbursements','Kostenerstattungen','open','1 offen'),task('backup','Datensicherung','soon','Vor 18 Tagen'),task('bindings','Zweckbindungen','clear','0 offen')] }
let script: string, css: string
test.beforeAll(async () => {
  css = (await Promise.all(['src/renderer/styles.css','src/renderer/views/DashboardPlus/dashboardPlus.css'].map(file => readFile(file,'utf8')))).join('\n')
  script = (await build({ stdin: { resolveDir: process.cwd(), loader: 'tsx', contents: `
    import React, {useState} from 'react'
    import {createRoot} from 'react-dom/client'
    import DashboardTasks from './src/renderer/views/DashboardPlus/DashboardTasks'
    window.taskData = ${JSON.stringify(fixture)}
    window.nav = []; window.settingsWrites = []; window.failed = false; window.general = false
    window.api = {
      app:{ dashboardTasks: async () => { if(window.failed) throw Error('failed'); return window.taskData } },
      organizations:{ onSwitched: fn => {window.switchOrganization=fn;return ()=>{}} },
      settings:{set:async payload=>{window.settingsWrites.push(payload);return {ok:true}}},
      backup:{make:async()=>{window.taskData.groups.find(g=>g.kind==='backup').level='clear';window.taskData.groups.find(g=>g.kind==='backup').items=[];return {ok:true}}}
    }
    function App(){const [general,setGeneral]=useState(false);window.changeProfile=setGeneral;return <div className='dashboard-plus'><DashboardTasks today='2026-10-04' generalProfile={general} drafts={[{id:'draft',title:'Rechnung Jugendfahrt'}]} onOpenDraft={id=>window.nav.push({draft:id})} onNavigate={target=>window.nav.push(target)}/></div>}
    createRoot(document.getElementById('root')).render(<App/>);
  ` }, bundle: true, platform: 'browser', write: false, jsx: 'automatic', define: { 'process.env.NODE_ENV':'"production"' } })).outputFiles[0].text
})
test.beforeEach(async ({page}) => {
  await page.setViewportSize({width:1280,height:1000})
  await page.setContent('<html data-theme="light" data-color-theme="soft-blush"><div id="root"></div></html>')
  await page.addStyleTag({content:css}); await page.addScriptTag({content:script})
  await expect(page.getByRole('button',{name:'Mitgliedsbeiträge',exact:true})).toBeVisible()
})
test('urgent tasks appear first and drill-downs retain the destination filter', async ({page}) => {
  const primary = page.locator('.dp-task-grid > article')
  expect(await primary.nth(0).innerText()).toContain('Mitgliedsbeiträge')
  await page.getByRole('button',{name:'Bankimport',exact:true}).click()
  await expect(page.locator('.dp-task-account-status')).toContainText('Umsätze bis 16.09.2026')
  await page.locator('.dp-task-details li button').click()
  expect(await page.evaluate(()=> (window as any).nav[0])).toEqual({kind:'bank',accountId:1,filter:'open'})
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('reminders persist per account and disabling reminders is available', async ({page}) => {
  await page.getByRole('button',{name:'Erinnerungen',exact:true}).click()
  await page.getByRole('spinbutton',{name:'Vereinskonto Tage'}).fill('0')
  await page.getByRole('button',{name:'Speichern',exact:true}).click()
  await expect.poll(()=>page.evaluate(()=>(window as any).settingsWrites)).toEqual([{key:'dashboard.bankReminderDays.1',value:0}])
})
test('drafts open directly and backups can be created', async ({page}) => {
  await page.getByRole('button',{name:'Offene Entwürfe',exact:true}).click()
  await page.getByRole('button',{name:'Rechnung Jugendfahrt'}).click()
  expect(await page.evaluate(()=>(window as any).nav[0])).toEqual({draft:'draft'})
  await page.getByRole('button',{name:'Datensicherung',exact:true}).click()
  await page.getByRole('button',{name:'Jetzt sichern'}).click()
  await expect(page.getByRole('button',{name:'Datensicherung',exact:true})).toHaveCount(0)
  await page.getByRole('button',{name:'Nichts offen',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Nichts offen'})).toContainText('Datensicherung')
})
test('data changes refresh task counts and errors are retryable', async ({page}) => {
  await page.evaluate(()=>{ (window as any).failed=true; window.dispatchEvent(new Event('data-changed:bank-imports')) })
  await expect(page.getByRole('alert')).toContainText('Offene Aufgaben konnten nicht geladen werden')
  await page.evaluate(()=>{(window as any).failed=false; (window as any).taskData.groups.find((g:any)=>g.kind==='members').value='1 Mitglied'})
  await page.getByRole('button',{name:'Erneut versuchen'}).click()
  await expect(page.locator('.dp-task').filter({hasText:'Mitgliedsbeiträge'})).toContainText('1 Mitglied')
})
test('general profile omits membership and purpose-binding tasks', async ({page}) => {
  await page.evaluate(()=>(window as any).changeProfile(true))
  await expect(page.getByRole('button',{name:/Mitgliedsbeiträge/})).toHaveCount(0)
  await expect(page.getByRole('button',{name:/Zweckbindungen/})).toHaveCount(0)
  await page.getByRole('button',{name:'Nichts offen',exact:true}).click()
  await expect(page.getByRole('dialog')).not.toContainText('Zweckbindungen')
})
test('status and reminder dropdowns do not expand the page and close on Escape or outside clicks', async ({page}) => {
  const before = await page.locator('.dp-tasks').boundingBox()
  await expect(page.locator('.dp-task-clear-row')).toHaveCount(0)
  await page.getByRole('button',{name:'Nichts offen',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Nichts offen'})).toContainText('Zweckbindungen')
  expect(await page.locator('.dp-tasks').boundingBox()).toEqual(before)
  await page.getByRole('button',{name:'Erinnerungen',exact:true}).click()
  await expect(page.getByRole('dialog')).toHaveCount(1)
  await expect(page.getByRole('dialog',{name:'Erinnerungen'})).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.getByRole('button',{name:'Erinnerungen',exact:true})).toBeFocused()
  await page.getByRole('button',{name:'Mitgliedsbeiträge',exact:true}).click()
  await expect(page.getByRole('dialog',{name:'Mitgliedsbeiträge'})).toBeVisible()
  await page.getByRole('heading',{name:'Was zu tun ist'}).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('the task area fits desktop and narrow windows without clipping', async ({page},info) => {
  const errors: string[]=[]; page.on('pageerror',error=>errors.push(error.message))
  await page.locator('.dp-tasks').screenshot({path:info.outputPath('tasks-desktop.png'),animations:'disabled'})
  await page.setViewportSize({width:380,height:1000})
  await page.getByRole('button',{name:'Verbindlichkeiten',exact:true}).click()
  expect(await page.locator('.dp-tasks').evaluate(el=>el.scrollWidth<=el.clientWidth)).toBe(true)
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  const bounds = await page.getByRole('dialog').boundingBox()
  expect(bounds!.x).toBeGreaterThanOrEqual(0)
  expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(380)
  expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(1000)
  await page.screenshot({path:info.outputPath('tasks-narrow.png'),fullPage:true,animations:'disabled'})
  await page.keyboard.press('Escape')
  await page.setViewportSize({width:320,height:600})
  await page.evaluate(()=>{document.documentElement.removeAttribute('data-color-theme');document.documentElement.setAttribute('data-theme','dark')})
  await page.getByRole('button',{name:'Erinnerungen',exact:true}).click()
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth)).toBe(true)
  const reminder = await page.getByRole('dialog',{name:'Erinnerungen'}).boundingBox()
  expect(reminder!.x + reminder!.width).toBeLessThanOrEqual(320)
  expect(reminder!.y + reminder!.height).toBeLessThanOrEqual(600)
  await page.screenshot({path:info.outputPath('tasks-dark-reminders.png'),animations:'disabled'})
  expect(errors).toEqual([])
})
