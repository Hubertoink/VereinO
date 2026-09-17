import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const bookingView=process.env.WEB_TEST_BOOKING_VIEW==='plus'?'plus':'classic'
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
 let bookings=[],writes=0,failPatch=true
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
  if(path==='/api/settings/workflow')data={settings:{version:0,bookingView,showBookingDraftTabs:true,showBookingEditTabs:true,quickAddAfterSave:'close'}}
  if(path==='/api/settings/table')data={settings:{version:0,columns:{},columnOrder:['date','description','gross']}}
  if(path==='/api/settings/organization')data={organization:{version:1,name:'Test Organisation'}}
  if(path==='/api/settings/profile'){
   if(req.method()==='PATCH'){assert.equal(req.postDataJSON().version,0);profile=req.postDataJSON().profile}
   data={profile,version:profile==='GENERAL'?1:0}
  }
  if(path==='/api/classifications/primary')data={profile,definition:{primaryLabel:profile==='GENERAL'?'Kategorie':'Sphäre'},values:[]}
  if(path==='/api/bookings'){
    if(req.method()==='POST'){writes++;const booking={...req.postDataJSON(),id:writes,number:`2026-${writes}`,version:1};bookings.push(booking);data={booking}}
    else data={bookings}
  }
  if(path==='/api/bookings/1'&&req.method()==='PATCH'){
    if(failPatch){failPatch=false;return route.fulfill({status:409,json:{message:'Zwischenzeitlich geändert'}})}
    bookings[0]={...bookings[0],...req.postDataJSON(),version:2};data={booking:bookings[0]}
  }
  if(path==='/api/drafts')data={drafts:[]}
  if(path.startsWith('/api/planning/'))data={rows:[]}
  if(path==='/api/ai/settings'){
   if(req.method()==='PATCH'){const body=req.postDataJSON();savedKey=body.apiKey;assert.equal(body.version,ai.version);ai={...body,version:ai.version+1,hasApiKey:true};delete ai.apiKey}
   data=ai
  }
  if(path==='/api/ai/test'){tested=true;data={ok:true}}
  await route.fulfill({json:data})
 })

 await page.goto('http://localhost:5174')
 const newBooking=page.getByRole('button',{name:'Neue Buchung',exact:true})
 const description=()=>page.getByPlaceholder('Was wurde gebucht?')
 const park=()=>page.getByRole('button',{name:'Buchungsflyout parken',exact:true}).click()
 const openTab=label=>page.locator('.booking-draft-tab__open').filter({hasText:label}).click()
 await newBooking.click()
 await description().fill('Erster Reiter')
 await page.getByLabel('Brutto-Betrag',{exact:true}).fill('12.34')
 await page.getByRole('button',{name:'+ Tag',exact:true}).click()
 await page.getByLabel('Neuen Tag hinzufügen').fill('Bleibt erhalten');await page.getByLabel('Neuen Tag hinzufügen').press('Enter')
 await page.getByRole('button',{name:'Neuen Buchungsreiter öffnen',exact:true}).click()
 await description().fill('Zweiter Reiter')
 await page.getByLabel('Brutto-Betrag',{exact:true}).fill('56.78')
 await page.getByRole('button',{name:'Buchungsreiter wechseln',exact:true}).click()
 await page.getByRole('option',{name:/Erster Reiter/}).click()
 assert.equal(await description().inputValue(),'Erster Reiter')
 assert.equal(await page.getByLabel('Brutto-Betrag',{exact:true}).inputValue(),'12.34')
 await page.getByRole('button',{name:'Tag Bleibt erhalten entfernen',exact:true}).waitFor()
 await park()
 assert.equal(await page.locator('.booking-draft-tab').count(),2)
 await page.getByRole('button',{name:'KI',exact:true}).click()
 await page.getByRole('button',{name:'Buchungen',exact:true}).click()
 await page.locator('.booking-draft-tab').nth(1).waitFor()
 assert.equal(await page.locator('.booking-draft-tab').count(),2)
 await openTab('Zweiter Reiter')
 assert.equal(await page.getByLabel('Brutto-Betrag',{exact:true}).inputValue(),'56.78')
 await page.getByRole('button',{name:'Buchung speichern',exact:true}).click()
 await page.getByRole('dialog',{name:'Buchung erfassen',exact:true}).waitFor({state:'hidden'})
 assert.equal(writes,1);assert.equal(bookings[0].description,'Zweiter Reiter')
 assert.equal(await page.locator('.booking-draft-tab').count(),1)
 if(bookingView==='plus')await page.locator('.bp-row').filter({hasText:'Zweiter Reiter'}).click()
 else await page.getByText('Zweiter Reiter',{exact:true}).dblclick()
 await page.getByRole('button',{name:'Bearbeiten',exact:true}).click()
 await description().fill('Geänderter Reiter')
 await park()
 assert.equal(await page.locator('.booking-draft-tab').count(),2)
 await openTab('Geänderter Reiter')
 await page.getByRole('button',{name:'Buchung speichern',exact:true}).click()
 await page.getByText('Zwischenzeitlich geändert',{exact:true}).waitFor()
 assert.equal(await description().inputValue(),'Geänderter Reiter')
 await page.getByRole('button',{name:'Buchung speichern',exact:true}).click()
 await page.getByRole('dialog',{name:'Buchung bearbeiten',exact:true}).waitFor({state:'hidden'})
 assert.equal(bookings[0].description,'Geänderter Reiter')
 await openTab('Erster Reiter')
 assert.equal(await description().inputValue(),'Erster Reiter');await park()
 await page.getByRole('button',{name:'Erster Reiter schließen',exact:true}).click()
 assert.equal(await page.locator('.booking-draft-tab').count(),0);assert.equal(writes,1)
 await page.evaluate(bookingView=>window.dispatchEvent(new CustomEvent('vereino-workflow-changed',{detail:{version:1,bookingView,showBookingDraftTabs:true,showBookingEditTabs:true,quickAddAfterSave:'new'}})),bookingView)
 await newBooking.click();await description().fill('Danach neuer Reiter');await page.getByLabel('Brutto-Betrag',{exact:true}).fill('1.00')
 await page.getByRole('button',{name:'Buchung speichern',exact:true}).click()
 await page.waitForFunction(()=>{const input=document.querySelector('input[placeholder="Was wurde gebucht?"]');return input&&input.value===''});
 for(const viewport of [{width:390,height:700},{width:800,height:500},{width:1440,height:1000}]){
   await page.setViewportSize(viewport)
   const editor=page.getByRole('dialog',{name:'Buchung erfassen',exact:true})
   assert(await editor.evaluate(el=>el.scrollWidth<=el.clientWidth))
 }
 await park();await page.locator('.booking-draft-tab__close').click()
 assert.deepEqual(errors,[])
 console.log(`${bookingView}: booking tabs create/switch/park/navigation, field preservation, independent save, edit and conflict passed`)
} finally {await browser.close()}
