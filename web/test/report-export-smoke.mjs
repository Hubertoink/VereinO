import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
import {chromium} from 'playwright'
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined})
try{
 const page=await browser.newPage({viewport:{width:1360,height:950}}),errors=[]
 page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)})
 let fail=false
 const bookings=[{id:1,number:'2026-1',version:1,date:'2026-09-15',type:'OUT',description:'=1+1',counterparty:'A; "B"',sphere:'IDEELL',paymentMethod:'BANK',grossAmountCents:2345},{id:2,number:'2026-2',version:1,date:'2026-09-16',type:'IN',description:'Beitrag',sphere:'WGB',paymentMethod:'CASH',grossAmountCents:10000}]
 await page.route('**/api/**',async route=>{
  const path=new URL(route.request().url()).pathname;assert.equal(route.request().method(),'GET')
      if(path==='/api/settings/modules')return route.fulfill({json:{version:0}})
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
      if(path==='/api/ai/documents')return route.fulfill({json:{rows:[]}})
      if(path==='/api/ai/settings')return route.fulfill({json:{enabled:false,hasApiKey:false}})
  if(path==='/api/bookings'&&fail){await route.fulfill({status:503,json:{message:'Exportquelle nicht erreichbar'}});return}
  
if(path==='/api/settings/profile'){await route.fulfill({json:{profile:'NONPROFIT',version:0}});return}
if(path==='/api/classifications/primary'){await route.fulfill({json:{profile:'NONPROFIT',definition:{primaryLabel:'Sphäre'},values:[]}});return}
if(path==='/api/settings/workflow'){await route.fulfill({json:{settings:{version:0,bookingView:'plus'}}});return}
if(path==='/api/settings/table'){await route.fulfill({json:{settings:{version:0,columns:{},columnOrder:[]}}});return}
let result
  if(path==='/api/auth/status')result={setupRequired:false}
  else if(path==='/api/auth/me')result={user:{id:1,email:'admin@test.invalid',role:'ADMIN',organizationId:1}}
  else if(path==='/api/settings/preferences')result={preferences:{version:1,themeMode:'dark',colorTheme:'default',navLayout:'left',navIconColorMode:'color'}}
  else if(path==='/api/bookings')result={bookings}
  else if(path.startsWith('/api/planning/'))result={rows:[]}
  else if(path.endsWith('/attachments'))result={files:[]}
  else if (path === '/api/organizations') result = { organizations: [] }
    else throw new Error(`Unexpected ${path}`)
  await route.fulfill({json:result})
 })
 await page.goto(process.env.WEB_TEST_URL||'http://localhost:5174')
 await page.getByRole('button',{name:'Berichte',exact:true}).click()
 await page.getByRole('button',{name:'Filter',exact:true}).click()
 await page.locator('.filter-dropdown__field').filter({has:page.getByText('Sphäre',{exact:true})}).locator('select').selectOption('IDEELL')
 await page.getByRole('button',{name:'Übernehmen',exact:true}).click()
 await page.getByRole('button',{name:'Exportoptionen',exact:true}).click()
 await page.getByText('Buchungen als CSV exportieren',{exact:true}).waitFor()
 const pending=page.waitForEvent('download');await page.getByRole('button',{name:'CSV herunterladen',exact:true}).click();const download=await pending
 assert.match(download.suggestedFilename(),/^VereinO-Buchungen-.*\.csv$/)
 const csv=await readFile(await download.path(),'utf8')
 assert(csv.includes("\'=1+1"));assert(csv.includes(';-23,45\r\n'));assert(!csv.includes('Beitrag'));assert(!csv.includes('MwSt'))
 await page.getByText('1 Buchung exportiert.',{exact:true}).waitFor()
 fail=true;await page.getByRole('button',{name:'CSV herunterladen',exact:true}).click();await page.getByRole('alert').filter({hasText:'Exportquelle nicht erreichbar'}).waitFor()
 for(const width of [390,800]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth))}
 assert.deepEqual(errors,[]);console.log('Original report export: filtered real CSV download, formula safety, signed cents and failed-source handling passed')
}finally{await browser.close()}
