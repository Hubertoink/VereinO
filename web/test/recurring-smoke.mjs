import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const general=process.env.WEB_TEST_PROFILE==='GENERAL'
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined})
try{
 for(const role of ['ADMIN','EDITOR','USER']){
  const page=await browser.newPage({viewport:{width:1360,height:900}}),errors=[],writes=[]
  page.on('pageerror',error=>{errors.push(error.message);console.error(error.message)})
  let rows=[{id:1,version:1,name:'Software',type:'OUT',sphere:'IDEELL',description:'Monatliche Software',grossAmountCents:2900,paymentMethod:'BANK',frequency:'MONTHLY',startDate:'2020-01-31',nextDueDate:'2020-01-31',endDate:null,status:'ACTIVE',variableAmount:false,dueCount:2,earliestDueDate:'2020-01-31'}]
  let fail=false
  await page.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();let result={}
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
      if(path==='/api/ai/documents')return route.fulfill({json:{rows:[]}})
      if(path==='/api/ai/settings')return route.fulfill({json:{enabled:false,hasApiKey:false}})
   if(path==='/api/classifications/primary')result={profile:general?'GENERAL':'NONPROFIT',definition:{primaryLabel:general?'Kategorie':'Sphäre'},values:[{id:7,name:'Office',isActive:true}]}
   else if(path==='/api/settings/profile')result={profile:general?'GENERAL':'NONPROFIT',version:0}
   else if(path==='/api/settings/workflow')result={settings:{bookingView:'plus',version:0}}
   else if(path==='/api/settings/table')result={settings:{version:0,columns:{},columnOrder:[]}}
   else if(path==='/api/auth/status')result={setupRequired:false}
   else if(path==='/api/auth/me')result={user:{id:1,email:'admin@example.org',role,organizationId:1}}
   else if(path==='/api/bookings')result={bookings:[]}
   else if(path==='/api/drafts')result={drafts:[]}
   else if(path==='/api/settings/preferences')result={preferences:{version:1,themeMode:'dark',colorTheme:'default',navLayout:'left',navIconColorMode:'color'}}
   else if(path==='/api/settings/organization')result={organization:{name:'Testverein',version:1}}
   else if(path==='/api/planning/budgets'||path==='/api/planning/earmarks')result={rows:[]}
   else if(path==='/api/recurring/summary')result={due:2,upcoming:0,active:rows.length,paused:0}
   else if(path==='/api/recurring'&&method==='GET'){
    if(fail){await route.fulfill({status:503,json:{message:'Test: Dauerbuchungen nicht erreichbar'}});return}
    result={rows:rows.filter(row=>!url.searchParams.get('q')||row.name.includes(url.searchParams.get('q')))}
   }else if(path.startsWith('/api/recurring')&&method!=='GET'){
    assert.equal(role,'ADMIN');const body=request.postDataJSON();writes.push({path,body})
    if(path==='/api/recurring'){const row={...body,id:2,version:1,dueCount:1,earliestDueDate:body.nextDueDate};rows.push(row);result={row}}
    else if(path.endsWith('/book')){assert.equal(body.version,1);assert.equal(body.expectedDueDate,'2020-01-31');assert.equal(body.grossAmountCents,29);rows[0]={...rows[0],version:2,nextDueDate:'2020-02-29',earliestDueDate:'2020-02-29',dueCount:1};result={row:rows[0],voucherNo:'2020-000001'}}
    else if(path.endsWith('/skip')){assert.equal(body.version,2);assert.equal(body.expectedDueDate,'2020-02-29');rows[0]={...rows[0],version:3,nextDueDate:'2020-03-31',earliestDueDate:null,dueCount:0};result={row:rows[0]}}
   }
   await route.fulfill({json:result})
  })
  await page.goto(process.env.WEB_TEST_URL||'http://localhost:5174')
  if(role==='USER'){
   await page.getByRole('heading',{name:'Buchungsentwürfe'}).waitFor()
   assert.equal(await page.getByRole('button',{name:'Dauerbuchungen',exact:true}).count(),0)
  }else{
   await page.getByRole('button',{name:'Dauerbuchungen',exact:true}).click()
   await page.getByRole('table').getByText('Software',{exact:true}).waitFor()
   if(role==='ADMIN'){
    await page.getByRole('button',{name:'Dauerbuchung',exact:true}).click()
    const modal=page.getByRole('dialog',{name:'+ Dauerbuchung',exact:true})
    await modal.locator('#recurring-name').fill('Neue Vorlage')
    await modal.locator('#recurring-amount').fill('0.29')
    if(general){await modal.getByRole('button',{name:'Kategorie der Dauerbuchung'}).click();await page.getByRole('option',{name:'Office',exact:true}).click()}
    await modal.getByRole('button',{name:'Konto der Dauerbuchung'}).click()
    await page.getByRole('option',{name:'Bank',exact:true}).click()
    assert.equal(await modal.getByRole('button',{name:'Brutto oder Netto'}).count(),0)
    assert.equal(await modal.getByRole('button',{name:'Budget',exact:true}).count(),0)
    for(const width of [390,800,1360]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`recurring form overflow ${width}`)}
    await modal.getByRole('button',{name:'Speichern',exact:true}).click()
    await page.getByRole('table').getByText('Neue Vorlage',{exact:true}).waitFor()
    assert.equal(writes[0].body.grossAmountCents,29)
    if(general)assert.equal(writes[0].body.primaryClassificationValueId,7)
    await page.getByRole('row').filter({hasText:'Software'}).getByRole('button',{name:'Jetzt buchen',exact:true}).click()
    const booking=page.getByRole('dialog',{name:'Dauerbuchung buchen',exact:true})
    await booking.getByRole('spinbutton').fill('0.29')
    await booking.getByRole('button',{name:'Buchen',exact:true}).click()
    await page.getByText('Buchung erstellt: 2020-000001',{exact:true}).waitFor()
    await page.getByRole('row').filter({hasText:'Software'}).getByRole('button',{name:'Fälligkeit von Software überspringen'}).click()
    await page.getByRole('dialog',{name:'Fälligkeit überspringen?'}).getByRole('button',{name:'Überspringen',exact:true}).click()
    await page.getByText('Fälligkeit übersprungen',{exact:true}).waitFor()
    assert.equal(writes.length,3)
   }else{
    assert.equal(await page.getByRole('button',{name:'Dauerbuchung',exact:true}).count(),0)
    assert.equal(await page.getByRole('table').getByRole('button').count(),0)
   }
   for(const width of [390,800,1360]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`recurring list overflow ${width}`)}
   fail=true;await page.getByRole('textbox',{name:'Dauerbuchungen durchsuchen'}).fill('unreachable')
   await page.getByText(/Test: Dauerbuchungen nicht erreichbar/).waitFor()
  }
  assert.deepEqual(errors,[]);console.log(`${role}: recurring original UI, create/book/skip or read-only, precision, errors, responsive passed`);await page.close()
 }
}finally{await browser.close()}
