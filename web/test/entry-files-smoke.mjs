import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true,executablePath:'/usr/bin/chromium'})
const buffer=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')
try{
 for(const [role,bookingView] of [['USER','classic'],['ADMIN','classic'],['EDITOR','plus']]){
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[]
  page.setDefaultTimeout(15000)
  page.on('pageerror',e=>errors.push(e.message))
  let entries=[],uploads=0,saves=0,failSave=true
  const file={id:'67e566ea-7a1b-4b0a-93ef-42183eec16e8',fileName:'Beleg.png',mimeType:'image/png',size:buffer.length}
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname,method=req.method();let data={}
   if(path==='/api/auth/status')data={setupRequired:false}
   if(path==='/api/auth/me')data={user:{id:1,organizationId:1,role,email:'test@example.test',organizationName:'Test'}}
   if(path==='/api/organizations')data={organizations:[]}
   if(path==='/api/settings/preferences')data={preferences:{version:0,themeMode:'dark',colorTheme:'default',navLayout:'left'}}
   if(path==='/api/settings/workflow')data={settings:{version:0,bookingView,showBookingDraftTabs:true,showBookingEditTabs:true,quickAddAfterSave:'close'}}
   if(path==='/api/settings/table')data={settings:{version:0,columns:{},columnOrder:[]}}
   if(path==='/api/settings/profile')data={profile:'NONPROFIT',version:0}
   if(path==='/api/classifications/primary')data={profile:'NONPROFIT',definition:{primaryLabel:'Sphäre'},values:[]}
   if(path.startsWith('/api/planning/')||path==='/api/tags')data={rows:[]}
   if(path==='/api/ai/settings')data={enabled:false,hasApiKey:false}
   if(path==='/api/attachments/staged'){uploads++;assert.match(req.headers()['content-type'],/multipart\/form-data/);data={file}}
   if(path==='/api/drafts'||path==='/api/bookings'){
    const isDraft=path.endsWith('drafts')
    if(method==='POST'){
     if(failSave){failSave=false;return route.fulfill({status:409,json:{message:'Bitte erneut speichern'}})}
     const body=req.postDataJSON();assert.deepEqual(body.attachmentIds,[file.id]);saves++
     const entry={...body,id:1,version:1,status:'DRAFT',createdBy:1,fileCount:1,number:'2026-1'};entries=[entry];data={[isDraft?'draft':'booking']:entry}
    }else data={[isDraft?'drafts':'bookings']:entries}
   }
   if(/\/1\/attachments$/.test(path))data={files:[file],canUpload:true,canDelete:true}
   if(path.endsWith('/content'))return route.fulfill({body:buffer,contentType:'image/png'})
   await route.fulfill({json:data})
  })
  await page.goto(process.env.WEB_TEST_URL||'http://localhost:5174')
  await page.getByRole('button',{name:role==='USER'?/Entwurf erstellen/:'Neue Buchung',exact:role!=='USER'}).click()
  await page.getByPlaceholder('Was wurde gebucht?').fill('Belegtest')
  await page.getByLabel('Brutto-Betrag',{exact:true}).fill('12.34')
  await page.getByRole('button',{name:'+ Anhang',exact:true}).click()
  await page.locator('.compact-booking-flyout input[type=file]').setInputFiles({name:'Beleg.png',mimeType:'image/png',buffer})
  await page.getByRole('button',{name:'Beleg.png entfernen',exact:true}).waitFor()
  if(role!=='USER'){
   await page.getByRole('button',{name:'Buchungsflyout parken',exact:true}).click()
   await page.locator('.booking-draft-tab__open').filter({hasText:'Belegtest'}).click()
   await page.getByRole('button',{name:'Beleg.png entfernen',exact:true}).waitFor()
  }
  const save=page.getByRole('button',{name:role==='USER'?'Entwurf speichern':'Buchung speichern',exact:true})
  await save.click();await page.getByText('Bitte erneut speichern',{exact:true}).waitFor()
  await save.click();await page.getByPlaceholder('Was wurde gebucht?').waitFor({state:'hidden'})
  assert.equal(uploads,1,'Retry reuses staged upload');assert.equal(saves,1)
  if(role==='USER')await page.getByRole('button',{name:/Anhänge/}).click()
  else if(bookingView==='plus')await page.locator('.bp-attachment').click()
  else {await page.getByText('Belegtest',{exact:true}).dblclick();await page.getByRole('button',{name:/Anhang hinzufügen/}).click()}
  await page.locator('.attachments-modal__preview-img').waitFor()
  for(const width of [390,800,1440]){
   await page.setViewportSize({width,height:800});assert(await page.locator('.attachments-modal').evaluate(el=>el.scrollWidth<=el.clientWidth))
  }
  if(role==='USER'){
   await page.setViewportSize({width:1440,height:1000});await page.locator('.attachments-modal__close').click()
   await page.getByRole('button',{name:'Bearbeiten',exact:true}).click();await page.getByRole('button',{name:'+ Anhang',exact:true}).click()
   await page.getByRole('button',{name:'Vorhandene Anhänge anzeigen',exact:true}).click();await page.locator('.attachments-modal__preview-img').waitFor()
   await page.locator('.attachments-modal__close').click();await page.getByPlaceholder('Was wurde gebucht?').waitFor()
  }
  if(role==='EDITOR'){
   await page.setViewportSize({width:1440,height:1000});await page.locator('.attachments-modal__close').click()
   await page.locator('[data-shortcut-nav="Einreichungen"]').click();await page.getByRole('button',{name:'Prüfen',exact:true}).click()
   await page.getByRole('button',{name:'Anhänge ansehen / hinzufügen',exact:true}).click();await page.locator('.attachments-modal__preview-img').waitFor()
   assert.equal(await page.locator('dialog[open].web-draft-review').count(),0)
   await page.locator('.attachments-modal__close').click();await page.getByRole('dialog',{name:'Entwurf prüfen'}).waitFor()
  }
  assert.deepEqual(errors,[]);await page.close();console.log(`${role}/${bookingView}: create with receipt, retry without duplicate upload, tab preservation and preview passed`)
 }
}finally{await browser.close()}
