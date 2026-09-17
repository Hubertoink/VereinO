import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || '/usr/bin/chromium',headless:true})
try {
 const page=await browser.newPage({viewport:{width:900,height:1000}})
 let savedBooking
 const errors=[];page.on('pageerror',e=>errors.push(e.message))
 await page.route('**/api/**',async route=>{
 const path=new URL(route.request().url()).pathname
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
      if(path==='/api/ai/documents')return route.fulfill({json:{rows:[]}})
      if(path==='/api/ai/settings')return route.fulfill({json:{enabled:false,hasApiKey:false}})
 let data={}
 if(path==='/api/settings/profile')data={profile:'GENERAL',version:1}
 if(path==='/api/classifications/primary')data={profile:'GENERAL',definition:{primaryLabel:'Kategorie'},values:[{id:17,name:'Haushalt',isActive:true}]}
 if(path==='/api/bookings' && route.request().method()==='POST'){savedBooking=route.request().postDataJSON();await route.fulfill({json:{booking:{...savedBooking,id:99}}});return}
 if(path==='/api/auth/status')data={setupRequired:false}
 if(path==='/api/auth/me')data={user:{id:1,role:'ADMIN',email:'test@example.test',organizationId:1}}
 if(path==='/api/settings/preferences')data={preferences:{version:0,themeMode:'dark',colorTheme:'default',navLayout:'left',navIconColorMode:'color'}}
 if(path==='/api/settings/workflow')data={settings:{version:0,bookingView:'classic'}}
 if(path==='/api/settings/table')data={settings:{version:0,journalLimit:20,dateFormat:'iso',columns:{},columnOrder:['date','description','gross']}}
 if(path.startsWith('/api/planning/'))data={rows:[]}
 if(path==='/api/bookings')data={bookings:Array.from({length:25},(_,i)=>({id:i+1,number:`2026-${i}`,date:'2026-09-09',type:i===0?'OUT':'IN',description:`Testbuchung ${i}`,grossAmountCents:1000,version:1,sphere:'IDEELL',paymentMethod:'BANK',tags:['Training']}))}
 await route.fulfill({json:data})
 })
 await page.goto('http://localhost:5174')
 await page.locator('.journal-table').waitFor()
 await page.getByText('Testbuchung 24',{exact:true}).waitFor()
 await page.getByTitle('Weiter',{exact:true}).click()
 await page.getByText('Testbuchung 0',{exact:true}).waitFor()
 await page.getByText('Testbuchung 0',{exact:true}).dblclick()
 await page.locator('.voucher-info-modal').waitFor()
 await page.locator('.voucher-info-modal').getByText('Training',{exact:true}).waitFor()
 await page.keyboard.press('Escape')
 for(const width of [900,390,1440]){await page.setViewportSize({width,height:1000});await page.waitForTimeout(200);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`)}
 await page.getByRole('button',{name:'Neue Buchung',exact:true}).click()
 await page.getByRole('button',{name:'Kategorie der Buchung'}).click()
 await page.getByRole('option',{name:'Haushalt',exact:true}).click()
 await page.getByPlaceholder('Was wurde gebucht?').fill('Allgemeines Budget')
 await page.getByLabel('Brutto-Betrag',{exact:true}).fill('12.34')
 await page.getByRole('button',{name:'+ Tag',exact:true}).click()
 await page.getByLabel('Neuen Tag hinzufügen',{exact:true}).fill('Klassisch neu')
 await page.getByLabel('Neuen Tag hinzufügen',{exact:true}).press('Enter')
 await page.getByRole('button',{name:'Buchung speichern',exact:true}).click()
 await page.getByRole('dialog',{name:'Buchung erfassen',exact:true}).waitFor({state:'hidden'})
 assert.equal(savedBooking.primaryClassificationValueId,17)
 assert.equal(savedBooking.grossAmountCents,1234)
 assert.deepEqual(savedBooking.tags,['Klassisch neu'])
 assert.deepEqual(errors,[])
 await page.screenshot({path:'/tmp/vereino-classic.png'})
 console.log('Original journal: pagination, details, responsive layout and runtime checks passed')
} finally{await browser.close()}
