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
 const hit=async locator=>{
   await locator.scrollIntoViewIfNeeded()
   const box=await locator.boundingBox();assert(box)
   assert(await locator.evaluate(el=>{const b=el.getBoundingClientRect();return el.contains(document.elementFromPoint(b.x+b.width/2,b.y+b.height/2))}), 'visual button center must be its hit target')
   await page.mouse.click(box.x+box.width/2,box.y+box.height/2)
 }
 const bounds=async()=>{
   const panel=page.locator('.web-viewport-popover');await panel.waitFor()
   await page.waitForTimeout(80)
   const b=await panel.boundingBox(),v=page.viewportSize()
   assert(b.x>=0&&b.y>=0&&b.x+b.width<=v.width+1&&b.y+b.height<=v.height+1,JSON.stringify({b,v}))
   assert.equal(await page.evaluate(()=>window.scrollY),0)
   assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false)
 }
 for(const viewport of [{width:1440,height:900},{width:900,height:550},{width:640,height:400},{width:390,height:700}]){
   await page.setViewportSize(viewport)
   await page.getByRole('button',{name:'KI',exact:true}).click()
   for(const name of ['KI-Einstellungen','KI-Verlauf','KI-Regelkatalog','Agent-Kontext']){
     await hit(page.getByRole('button',{name,exact:true}));await bounds()
     const panel=page.locator('.web-viewport-popover')
     await panel.hover();await page.mouse.wheel(0,750);await page.waitForTimeout(100);await bounds()
     if(name==='KI-Einstellungen')await page.getByRole('button',{name:'KI-Einstellungen speichern',exact:true}).scrollIntoViewIfNeeded()
     await hit(page.getByRole('button',{name:'Bereich schließen',exact:true}))
     await panel.waitFor({state:'hidden'})
   }
   await page.getByRole('button',{name:'Buchungen',exact:true}).click()
   for(const name of ['Einzelne Rechnung erfassen','Mehrere PDF-Rechnungen vorbereiten']){
     await hit(page.getByRole('button',{name,exact:true}));await bounds()
     await page.locator('.web-viewport-popover').hover();await page.mouse.wheel(0,500);await bounds()
     await hit(page.getByRole('button',{name,exact:true}))
     await page.locator('.web-viewport-popover').waitFor({state:'hidden'})
   }
 }
 assert.deepEqual(errors,[])
 console.log(`Viewport bounds and button hit targets passed (${bookingView}, 4 viewport sizes, 6 panels).`)
} finally {await browser.close()}
