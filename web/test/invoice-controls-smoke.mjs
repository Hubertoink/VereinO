import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const bookingView=process.env.WEB_TEST_BOOKING_VIEW==='plus'?'plus':'classic'
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 const {PDFDocument}=createRequire(new URL('../../backend/package.json',import.meta.url))('pdf-lib')
 const pdf=await PDFDocument.create();pdf.addPage().drawText('Invoice test');const bytes=Buffer.from(await pdf.save())
 let queue=[],sequence=0,saved=null
 let activeOrg=1, organizations=[{id:1,name:'Test Organisation',profile:'NONPROFIT',role:'ADMIN'}], profile='NONPROFIT',ai={version:0,enabled:false,provider:'openai',model:'test',textModel:'test',hasApiKey:false},savedKey='',tested=false
 await page.route('**/api/**',async route=>{
  const req=route.request(),path=new URL(req.url()).pathname;let data={}
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
  if(path==='/api/auth/status')data={setupRequired:false}
  if(path==='/api/auth/me')data={user:{id:1,organizationId:activeOrg,organizationName:organizations.find(org=>org.id===activeOrg).name,role:'ADMIN',email:'test@example.test'}}
  if(path==='/api/users')data={users:[{id:1,email:'test@example.test',role:'ADMIN',isActive:true},{id:2,email:'editor@example.test',role:'EDITOR',isActive:true},{id:3,email:'user@example.test',role:'USER',isActive:true}]}
  if(path==='/api/organizations'){
   if(req.method()==='POST'){const body=req.postDataJSON();assert.deepEqual(body.members,[{userId:2,role:'USER'}]);assert.equal(body.profile,'GENERAL');organizations.push({id:2,name:body.name,profile:body.profile,role:'ADMIN'});data={organization:organizations[1]}}
   else data={organizations}
  }
  if(path==='/api/organizations/2/switch'){assert.equal(req.headers()['x-vereino-organization'],'1');activeOrg=2;profile='GENERAL';data={ok:true}}
  if(path==='/api/settings/preferences')data={preferences:{version:0,themeMode:'dark',colorTheme:'default',navLayout:'left',navIconColorMode:'color'}}
  if(path==='/api/settings/workflow')data={settings:{version:0,bookingView,showBookingDraftTabs:process.env.WEB_TEST_BOOKING_TABS==='1'}}
  if(path==='/api/settings/table')data={settings:{version:0,columns:{},columnOrder:['date','description','gross']}}
  if(path==='/api/settings/organization')data={organization:{version:1,name:'Test Organisation'}}
  if(path==='/api/settings/profile'){
   if(req.method()==='PATCH'){assert.equal(req.postDataJSON().version,0);profile=req.postDataJSON().profile}
   data={profile,version:profile==='GENERAL'?1:0}
  }
  if(path==='/api/classifications/primary')data={profile,definition:{primaryLabel:profile==='GENERAL'?'Kategorie':'Sphäre'},values:[]}
  if(path==='/api/bookings')data={bookings:[]}
  if(path==='/api/drafts')data={drafts:[]}
  if(path.startsWith('/api/planning/'))data={rows:[]}
  if(path==='/api/ai/documents')data={rows:queue}
  if(path==='/api/ai/invoice'){
    sequence++;data={documentId:`00000000-0000-4000-8000-${String(sequence).padStart(12,'0')}`,fields:{date:'2026-09-16',description:'Material aus Batch',counterparty:'Lieferant',grossAmountCents:1234,type:'OUT',sphere:'IDEELL',paymentMethod:'BANK'}}
    queue.push({...data,fileName:`Beleg-${sequence}.pdf`})
  }
  if(path.startsWith('/api/ai/documents/')&&path.endsWith('/content'))return route.fulfill({body:bytes,contentType:'application/pdf'})
  if(path.startsWith('/api/ai/documents/')&&req.method()==='DELETE')queue=queue.filter(item=>item.documentId!==path.split('/').pop())
  if(path==='/api/bookings'&&req.method()==='POST'){saved=req.postDataJSON();queue=queue.filter(item=>item.documentId!==saved.aiDocumentId);data={booking:{...saved,id:9,version:1}}}
  if(path==='/api/ai/settings'){
   if(req.method()==='PATCH'){const body=req.postDataJSON();savedKey=body.apiKey;assert.equal(body.version,ai.version);ai={...body,version:ai.version+1,hasApiKey:true};delete ai.apiKey}
   data=ai
  }
  if(path==='/api/ai/test'){tested=true;data={ok:true}}
  await route.fulfill({json:data})
 })

 await page.goto('http://localhost:5174')
 await page.getByRole('button',{name:'Buchungen',exact:true}).click()
 await page.getByRole('button',{name:'Mehrere PDF-Rechnungen vorbereiten',exact:true}).click()
 await page.locator('.invoice-batch-control__batch-input').setInputFiles([{name:'Beleg-1.pdf',mimeType:'application/pdf',buffer:bytes},{name:'Beleg-2.pdf',mimeType:'application/pdf',buffer:bytes}])
 await page.getByRole('button',{name:'Beleg-2.pdf verwerfen',exact:true}).click()
 await page.getByRole('button',{name:'Beleg-2.pdf verwerfen',exact:true}).waitFor({state:'hidden'})
 await page.reload()
 await page.getByRole('button',{name:'Buchungen',exact:true}).click()
 await page.getByRole('button',{name:'Mehrere PDF-Rechnungen vorbereiten',exact:true}).click()
 await page.locator('.invoice-batch-item__main').filter({hasText:'Beleg-1.pdf'}).click()
 const modal=page.getByRole('dialog',{name:'Rechnung erfassen',exact:true})
 await modal.waitFor()
 await page.waitForFunction(()=>{const canvas=document.querySelector('.local-invoice-scan canvas');return canvas&&canvas.width>100})
 assert.equal(await modal.getByLabel('Lieferant / Rechnungssteller',{exact:true}).inputValue(),'Lieferant')
 await modal.getByRole('button',{name:'Als Buchung übernehmen',exact:true}).click()
 const editor=page.getByRole('dialog',{name:'Buchung erfassen',exact:true});await editor.waitFor()
 if(process.env.WEB_TEST_BOOKING_TABS==='1'){await editor.getByRole('button',{name:'Buchungsflyout parken',exact:true}).click();await page.locator('.booking-draft-tab__open').filter({hasText:'Material aus Batch'}).click();await editor.waitFor()}
 await editor.getByRole('button',{name:'Buchung speichern',exact:true}).click()
 await editor.waitFor({state:'hidden'})
 assert.equal(saved.aiDocumentId,'00000000-0000-4000-8000-000000000001')
 assert.equal(saved.grossAmountCents,1234);assert.equal(saved.description,'Material aus Batch');assert.equal(queue.length,0)
 assert.deepEqual(errors,[])
 console.log(`Shared invoice batch upload, reload, discard, preview and booking handoff passed (${bookingView}).`)
} finally {await browser.close()}
