// Uses authenticated pages on a disposable instance. This helper creates and archives test data.
import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

async function getJson(page,path){return page.evaluate(async path=>{const response=await fetch(`/api${path}`);return{status:response.status,body:await response.json()}},path)}
async function openTile(page,name){await page.getByRole('button',{name:'Einstellungen',exact:true}).click();await page.getByRole('button',{name:'Verein',exact:true}).click();await page.getByRole('button',{name,exact:true}).click()}
async function field(modal,label,control='input'){
 const accessible=modal.getByLabel(label,{exact:true})
 if(await accessible.count())return accessible
 return modal.locator('.field').filter({has:modal.page().locator('label').filter({hasText:new RegExp(`^${label}$`)})}).locator(control)
}
async function saveModal(page){const dialog=page.getByRole('dialog').last();await dialog.getByRole('button',{name:'Speichern',exact:true}).click();await dialog.waitFor({state:'hidden'})}
async function awaitRow(page,kind,name){await page.waitForFunction(async({kind,name})=>{const response=await fetch(`/api/settings/master-data/${kind}`);if(!response.ok)return false;return(await response.json()).rows.some(row=>row.name===name)}, {kind,name});return(await getJson(page,`/settings/master-data/${kind}`)).body.rows.find(row=>row.name===name)}

export async function verifyMasterSettings({admin,editor,user}){
 const errors=[]
 for(const page of [admin,editor,user])page.on('pageerror',error=>errors.push(error.message))
 const suffix=Date.now().toString(36)
 const names={accounts:`Testkonto ${suffix}`,categories:`Testkategorie ${suffix}`,parties:`Testpartner ${suffix}`,tags:`Testtag ${suffix}`}
 const rows={}
 const tiles={accounts:'Konten',categories:'Kategorien',parties:'Geschäftspartner',tags:'Tags'}
 const createButtons={accounts:'Neues Konto',categories:'Neue Kategorie',parties:'Neuer Geschäftspartner',tags:'Neuer Tag'}
 for(const kind of ['accounts','categories','parties','tags']){
  await openTile(admin,tiles[kind])
  await admin.getByRole('button',{name:createButtons[kind],exact:true}).click()
  let modal=admin.getByRole('dialog').last()
  if(kind==='parties'){
   await modal.getByText('Kontakt & Anschrift',{exact:true}).click()
   await modal.getByLabel('Name *',{exact:true}).fill(names[kind])
   await modal.getByLabel('E-Mail',{exact:true}).fill(`test-${suffix}@example.org`)
   await modal.getByLabel('Ort',{exact:true}).fill('Berlin')
   await modal.getByLabel('Rechtlicher Name',{exact:true}).fill('Testpartner GmbH')
   await modal.getByText('Zahlung & Steuer',{exact:true}).click()
   await modal.getByLabel('Zahlungsziel (Tage)',{exact:true}).fill('14')
   await modal.locator('summary').filter({hasText:'Notiz'}).click()
   await modal.getByLabel('Notiz',{exact:true}).fill('Live-Test Stammdaten')
  }else await(await field(modal,'Name')).fill(names[kind])
  if(kind==='accounts'){
   await modal.getByLabel('Kontoart',{exact:true}).selectOption('BANK')
   await modal.getByLabel('IBAN',{exact:true}).fill('DE89370400440532013000')
  }
  await saveModal(admin)
  rows[kind]=await awaitRow(admin,kind,names[kind])
  assert.equal(rows[kind].isActive,true)
  if(kind==='parties'){assert.equal(rows[kind].city,'Berlin');assert.equal(rows[kind].paymentTermDays,14);assert.equal(rows[kind].legalName,'Testpartner GmbH')}
  await admin.getByRole('button',{name:`${names[kind]} bearbeiten`,exact:true}).click()
  modal=admin.getByRole('dialog').last()
  const edited=`${names[kind]} geändert`
  if(kind==='parties')await modal.getByLabel('Name *',{exact:true}).fill(edited)
  else await(await field(modal,'Name')).fill(edited)
  await saveModal(admin)
  rows[kind]=await awaitRow(admin,kind,edited)
  assert(rows[kind].version>=2)
  await openTile(editor,tiles[kind])
  await editor.getByRole('article',{name:edited,exact:true}).waitFor()
  assert.equal(await editor.getByRole('button',{name:createButtons[kind],exact:true}).count(),0)
  assert.equal(await editor.getByRole('button',{name:`${edited} bearbeiten`,exact:true}).count(),0)
  const denied=await editor.evaluate(async({kind,row})=>(await fetch(`/api/settings/master-data/${kind}/${row.id}`,{method:'PATCH',headers:{'Content-Type':'application/json','X-VereinO-Request':'1'},body:JSON.stringify({name:'Unauthorized',version:row.version})})).status,{kind,row:rows[kind]})
  assert.equal(denied,403)
  await admin.getByRole('button',{name:`${edited} archivieren`,exact:true}).click()
  const archived=await awaitRow(admin,kind,edited)
  // The API write may still be pending when the card first responds; wait for persisted state.
  await admin.waitForFunction(async({kind,id})=>(await(await fetch(`/api/settings/master-data/${kind}`)).json()).rows.find(row=>row.id===id)?.isActive===false,{kind,id:archived.id})
  rows[kind]=(await getJson(admin,`/settings/master-data/${kind}`)).body.rows.find(row=>row.id===archived.id)
  assert.equal(rows[kind].isActive,false)
  await admin.getByRole('button',{name:`${edited} reaktivieren`,exact:true}).click()
  await admin.waitForFunction(async({kind,id})=>(await(await fetch(`/api/settings/master-data/${kind}`)).json()).rows.find(row=>row.id===id)?.isActive===true,{kind,id:rows[kind].id})
 }
 await openTile(admin,'Organisation')
 const orgName=`Live-Testverein ${suffix}`
 await admin.getByLabel('Organisationsname',{exact:true}).fill(orgName)
 await admin.getByRole('button',{name:'Organisationsdaten speichern',exact:true}).click()
 await admin.waitForFunction(async name=>(await(await fetch('/api/settings/organization')).json()).organization.name===name,orgName)
 await admin.getByLabel('Anschrift',{exact:true}).fill('Teststraße 7\n10115 Berlin')
 await admin.getByLabel('Kassenwart',{exact:true}).fill('Erika Prüfung')
 const logo=await admin.evaluate(()=>{const canvas=document.createElement('canvas');canvas.width=2;canvas.height=2;canvas.getContext('2d').fillRect(0,0,2,2);return canvas.toDataURL('image/png').split(',')[1]})
 await admin.getByLabel('Organisationslogo',{exact:true}).setInputFiles({name:'Testlogo.png',mimeType:'image/png',buffer:Buffer.from(logo,'base64')})
 const {PDFDocument}=createRequire(new URL('../../backend/package.json',import.meta.url))('pdf-lib')
 const pdf=await PDFDocument.create();pdf.addPage()
 const certificateBytes=Buffer.from(await pdf.save())
 await admin.getByLabel('Steuerbefreiungsbescheid',{exact:true}).setInputFiles({name:'Testbescheid.pdf',mimeType:'application/pdf',buffer:certificateBytes})
 await admin.getByRole('link',{name:'Testbescheid.pdf herunterladen',exact:true}).waitFor()
 await admin.getByRole('button',{name:'Organisationsdaten speichern',exact:true}).click()
 await admin.waitForFunction(async()=>(await(await fetch('/api/settings/organization')).json()).organization.cashier==='Erika Prüfung')
 const organization=(await getJson(admin,'/settings/organization')).body.organization
 assert.equal(organization.address,'Teststraße 7\n10115 Berlin');assert.match(organization.logoDataUrl,/^data:image\/png;base64,/);assert.equal(organization.taxCertificate.fileName,'Testbescheid.pdf');assert.deepEqual(Buffer.from(organization.taxCertificate.fileData,'base64'),certificateBytes)
 const pendingDownload=admin.waitForEvent('download');await admin.getByRole('link',{name:'Testbescheid.pdf herunterladen',exact:true}).click();const downloaded=await pendingDownload;assert.deepEqual(await readFile(await downloaded.path()),certificateBytes)
 await admin.reload();await openTile(admin,'Organisation')
 assert.equal(await admin.getByLabel('Organisationsname',{exact:true}).inputValue(),orgName)
 assert.equal(await admin.getByLabel('Anschrift',{exact:true}).inputValue(),'Teststraße 7\n10115 Berlin')
 await openTile(editor,'Organisation')
 assert.equal(await editor.getByRole('button',{name:'Organisationsdaten speichern',exact:true}).count(),0)
 assert.equal((await getJson(editor,'/settings/organization')).body.organization.cashier,'Erika Prüfung')
 await user.getByRole('button',{name:'Einstellungen',exact:true}).click()
 for(const name of [...Object.values(tiles),'Organisation'])assert.equal(await user.getByRole('button',{name,exact:true}).count(),0)
 for(const kind of Object.keys(tiles))assert.equal((await getJson(user,`/settings/master-data/${kind}`)).status,403)
 for(const width of [390,800,1360]){
  await admin.setViewportSize({width,height:950})
  for(const tile of [...Object.values(tiles),'Organisation']){await openTile(admin,tile);assert(await admin.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`${tile} horizontal overflow at ${width}`)}
  if(width===390)await admin.screenshot({path:'/tmp/vereino-master-settings-mobile.png',fullPage:true})
 }
 assert.deepEqual(errors,[])
 console.log('Live master settings passed: all four create/edit/archive, Editor read-only/API denied, User hidden/API denied, organization fields/files persist after reload, responsive layout.')
 return{rows,organization}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){
 if(process.env.PILOT_E2E!=='1')throw new Error('Requires PILOT_E2E=1 and disposable test instance with existing test accounts.')
 const {chromium}=await import('playwright'),browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined})
 try{
  const pages={}
  for(const role of ['admin','editor','user']){
   const page=await browser.newPage({viewport:{width:1360,height:950}});await page.goto(process.env.WEB_TEST_URL||'http://localhost:5174')
   await page.getByLabel('E-Mail',{exact:true}).fill(`${role}@pilot.test`)
   await page.getByLabel('Passwort',{exact:true}).fill(role==='admin'?'pilot-password-admin':'pilot-password-user')
   await page.getByRole('button',{name:'Anmelden',exact:true}).click();await page.getByRole('button',{name:'Abmelden',exact:true}).waitFor();pages[role]=page
  }
  await verifyMasterSettings(pages)
 }finally{await browser.close()}
}
