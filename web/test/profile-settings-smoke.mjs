import { createRequire } from 'node:module'
import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const bookingView=process.env.WEB_TEST_BOOKING_VIEW==='plus'?'plus':'classic'
const browser = await chromium.launch({executablePath:'/usr/bin/chromium',headless:true})
try {
 const page=await browser.newPage({viewport:{width:1440,height:1000}})
 const errors=[];page.on('pageerror',error=>errors.push(error.message))
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
  if(path==='/api/settings/workflow')data={settings:{version:0,bookingView}}
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
  if(path==='/api/ai/settings'){
   if(req.method()==='PATCH'){const body=req.postDataJSON();savedKey=body.apiKey;assert.equal(body.version,ai.version);ai={...body,version:ai.version+1,hasApiKey:true};delete ai.apiKey}
   data=ai
  }
  if(path==='/api/ai/test'){tested=true;data={ok:true}}
  await route.fulfill({json:data})
 })
 await page.goto('http://localhost:5174')
 await page.getByRole('button',{name:'Mitglieder',exact:true}).waitFor()
 await page.locator('[data-shortcut-nav="Einstellungen"]').click()
 await page.locator('.settings-cluster-trigger').filter({hasText:'Verein'}).click()
 await page.locator('.settings-tab[aria-label="Organisation"]').click()
 await page.getByText('Steuerbefreiungsbescheid',{exact:true}).waitFor()
 assert.equal(await page.getByRole('button',{name:'Verwaltungsprofil speichern',exact:true}).count(),0)
 await page.getByText('Bei der Erstellung festgelegt · Organisationsart nicht änderbar',{exact:true}).waitFor()
 await page.getByRole('button',{name:'Organisation wechseln',exact:true}).click()
 await page.getByRole('button',{name:'Organisation erstellen',exact:true}).click()
 const create=page.getByRole('dialog',{name:'Neue Organisation anlegen',exact:true})
 assert.equal(await page.locator('.web-app').evaluate(element=>element.inert),true)
 const backgroundScroll=await page.locator('.web-app').evaluate(element=>Array.from(element.querySelectorAll('*')).map(node=>[node.scrollTop,node.scrollLeft]))
 await page.mouse.move(4,400);await page.mouse.wheel(0,900)
 assert.deepEqual(await page.locator('.web-app').evaluate(element=>Array.from(element.querySelectorAll('*')).map(node=>[node.scrollTop,node.scrollLeft])),backgroundScroll)
 await create.getByLabel('Organisationsname',{exact:true}).fill('Haushalt')
 await create.getByRole('radio',{name:/Allgemeine Budgetverwaltung/}).check()
 await create.getByRole('checkbox',{name:'editor@example.test',exact:true}).check()
 await create.getByLabel('Rolle für editor@example.test',{exact:true}).selectOption('USER')
 for(const width of [390,800,1440]){await page.setViewportSize({width,height:1000});assert(await create.evaluate(element=>element.getBoundingClientRect().width<=innerWidth))}
 await page.screenshot({path:'/tmp/vereino-create-organization.png'})
 await create.getByRole('button',{name:'Organisation erstellen',exact:true}).click()
 await create.waitFor({state:'hidden'})
 assert.equal(await page.locator('.web-app').evaluate(element=>element.inert),false)
 await page.getByRole('button',{name:/Haushalt Allgemeine Budgetverwaltung/}).click()
 await page.getByRole('button',{name:'Organisation wechseln',exact:true}).filter({hasText:'Haushalt'}).waitFor()
 await page.locator('[data-shortcut-nav="Einstellungen"]').click()
 await page.locator('.settings-cluster-trigger').filter({hasText:'Organisation'}).click()
 await page.locator('.settings-tab[aria-label="Organisation"]').click()
 await page.getByText('Bei der Erstellung festgelegt · Organisationsart nicht änderbar',{exact:true}).waitFor()
 for(const width of [390,800,1440]){await page.setViewportSize({width,height:1000});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`organization settings overflow ${width}`)}
 await page.screenshot({path:'/tmp/vereino-organization-settings.png'})
 assert.equal(await page.getByRole('button',{name:'Mitglieder',exact:true}).count(),0)
 assert.equal(await page.getByText('Steuerbefreiungsbescheid',{exact:true}).count(),0)
 await page.locator('.settings-cluster-trigger').filter({hasText:'Organisation'}).click()
 await page.getByRole('button',{name:'KI-Muster',exact:true}).click()
 await page.getByLabel('API-Schlüssel',{exact:true}).fill('fake-test-key')
 await page.getByRole('switch',{name:'KI verwenden',exact:true}).check()
 await page.getByRole('button',{name:'KI-Einstellungen speichern',exact:true}).click()
 await page.getByText('KI-Einstellungen gespeichert.',{exact:true}).waitFor()
 assert.equal(savedKey,'fake-test-key');assert.equal(await page.getByLabel('API-Schlüssel',{exact:true}).inputValue(),'')
 await page.getByRole('button',{name:'Gespeicherte Verbindung testen',exact:true}).click()
 await page.getByText('Verbindung erfolgreich geprüft.',{exact:true}).waitFor();assert(tested)
 await page.getByRole('button',{name:'Buchungen',exact:true}).click()
 await page.getByRole('button',{name:'Einzelne Rechnung erfassen',exact:true}).click()
 const {PDFDocument}=createRequire(new URL('../../backend/package.json',import.meta.url))('pdf-lib')
 const pdf=await PDFDocument.create();pdf.addPage().drawText('Rechnung 2026-123 Material 12.34 EUR')
 await page.locator('.invoice-batch-control__single-input').setInputFiles({name:'Preview.pdf',mimeType:'application/pdf',buffer:Buffer.from(await pdf.save())})
 await page.waitForFunction(()=>{const canvas=document.querySelector('.local-invoice-scan canvas');return canvas&&canvas.width>100})
 for(const viewport of [{width:1440,height:900},{width:900,height:550},{width:640,height:400},{width:390,height:700}]){
  await page.setViewportSize(viewport)
  await page.waitForTimeout(220)
  const modal=page.getByRole('dialog',{name:'Rechnung erfassen',exact:true});const b=await modal.boundingBox()
  assert(b.x>=0&&b.y>=0&&b.x+b.width<=viewport.width+1&&b.y+b.height<=viewport.height+1,JSON.stringify({b,viewport}))
  const close=page.getByRole('button',{name:'Rechnungserfassung schließen',exact:true})
  assert(await close.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}))
 }
 await page.setViewportSize({width:1440,height:1000})
 await page.screenshot({path:`/tmp/vereino-invoice-${bookingView}.png`})

 await page.getByRole('button',{name:'Rechnungserfassung schließen',exact:true}).click()
 await page.getByRole('button',{name:'Buchungen',exact:true}).click()
 await page.getByRole('button',{name:'Neue Buchung',exact:true}).click()
 await page.getByRole('button',{name:'Kategorie der Buchung',exact:true}).waitFor()
 await page.keyboard.press('Escape')
 assert.equal(await page.getByRole('button',{name:'Aktualisieren',exact:true}).count(),0)
 assert.deepEqual(errors,[])
 console.log('Organization creation with selected members and scoped switch updates navigation/settings; AI settings save and connection test passed')
} finally {await browser.close()}
