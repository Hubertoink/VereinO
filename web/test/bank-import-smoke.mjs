import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const general=process.env.WEB_TEST_PROFILE==='GENERAL'
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined})
try{
 for(const role of ['ADMIN','EDITOR','USER']){
  const page=await browser.newPage({viewport:{width:1360,height:900}}),errors=[],writes=[]
  page.on('pageerror',error=>errors.push(error.message))
  const source={id:1,version:1,bookingDate:'2026-09-15',direction:'OUT',amount:0.29,currency:'EUR',counterparty:'Testverein',purpose:'Bank Mitgliedsbeitrag',status:'OPEN',paymentAccountId:1,paymentAccountName:'Bank',sourceFileName:'bank.csv'}
  let rows=role==='ADMIN'?[]:[source],fail=false,commits=0
  await page.route('**/api/**',async route=>{
   const request=route.request(),url=new URL(request.url()),path=url.pathname,method=request.method();
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
      if(path==='/api/ai/documents')return route.fulfill({json:{rows:[]}})
      if(path==='/api/ai/settings')return route.fulfill({json:{enabled:false,hasApiKey:false}})
if(path==='/api/settings/profile'){await route.fulfill({json:{profile:general?'GENERAL':'NONPROFIT',version:0}});return}
if(path==='/api/classifications/primary'){await route.fulfill({json:{profile:general?'GENERAL':'NONPROFIT',definition:{primaryLabel:general?'Kategorie':'Sphäre'},values:[{id:7,name:'Office',isActive:true}]}});return}
if(path==='/api/settings/workflow'){await route.fulfill({json:{settings:{version:0,bookingView:'plus'}}});return}
if(path==='/api/settings/table'){await route.fulfill({json:{settings:{version:0,columns:{},columnOrder:[]}}});return}
let result={}
   if(path==='/api/auth/status')result={setupRequired:false}
   else if(path==='/api/auth/me')result={user:{id:1,email:'bank@example.org',role,organizationId:1}}
   else if(path==='/api/settings/preferences')result={preferences:{version:1,themeMode:'dark',colorTheme:'default',navLayout:'left',navIconColorMode:'color'}}
   else if(path==='/api/settings/organization')result={organization:{name:'Testverein',version:1}}
   else if(path==='/api/bookings')result={bookings:[]}
   else if(path==='/api/drafts')result={drafts:[]}
   else if(path==='/api/planning/budgets'||path==='/api/planning/earmarks')result={rows:[]}
   else if(path==='/api/bank-transactions/import-status')result={lastBookingDate:rows.length?'2026-09-15':null,total:rows.length,accounts:[],recentImports:[]}
   else if(path==='/api/bank-transactions'){
    if(fail){await route.fulfill({status:503,json:{message:'Test: Bankbelege nicht erreichbar'}});return}
    const filtered=rows.filter(row=>url.searchParams.get('status')==='ALL'||row.status===url.searchParams.get('status'))
    result={rows:filtered,total:filtered.length,stats:{total:rows.length,open:rows.filter(row=>row.status==='OPEN').length,linked:rows.filter(row=>row.status==='LINKED').length,checked:0}}
   }else if(path==='/api/bank-imports/preview'){
    assert.equal(role,'ADMIN');const body=request.postDataJSON();assert.equal(Buffer.from(body.fileBase64,'base64').toString(),'Datum;Betrag\n15.09.2026;-0,29\n')
    result={format:'CSV',headers:['Datum','Betrag'],suggestedMapping:{bookingDate:'Datum',amount:'Betrag'},accountIbans:[],detectedPaymentAccountId:1,rows:[{...source,sourceRow:2,errors:[]}],summary:{total:1,valid:1,errors:0}}
   }else if(path==='/api/bank-imports/commit'){
    assert.equal(role,'ADMIN');writes.push(path);commits++
    if(commits===1){rows=[source];result={batchId:1,imported:1,importedTransactionIds:[1],duplicates:0,duplicateRows:[],errors:[]}}
    else result={batchId:2,imported:0,importedTransactionIds:[],duplicates:1,duplicateRows:[{...source,sourceRow:2,duplicateBy:'FINGERPRINT',duplicateValue:'same',existing:rows[0]}],errors:[]}
   }else if(path==='/api/bank-transactions/1/book'){
    assert.equal(role,'ADMIN');const body=request.postDataJSON();assert.equal(body.version,1);if(general)assert.equal(body.primaryClassificationValueId,7);assert.equal(body.grossAmountCents,29);assert.equal(body.date,source.bookingDate);assert.equal(body.type,'OUT');assert.equal(body.paymentMethod,'BANK');assert.equal(body.budgets,undefined);writes.push(path);rows=[{...source,status:'LINKED',version:2,voucherId:1,voucherNo:'2026-000001'}];result={booking:{id:1}}
   }
   await route.fulfill({json:result})
  })
  await page.goto(process.env.WEB_TEST_URL||'http://localhost:5174')
  if(role==='USER'){
   await page.getByRole('heading',{name:'Buchungsentwürfe'}).waitFor();assert.equal(await page.getByRole('button',{name:'Bankimport',exact:true}).count(),0)
  }else{
   await page.getByRole('button',{name:'Bankimport',exact:true}).click()
   await page.getByRole('heading',{name:'Bankimport',exact:true}).waitFor()
   const upload=async()=>{
    await page.locator('button[aria-label="Bankdaten importieren"]').click()
    await page.locator('input[type=file]').first().setInputFiles({name:'bank.csv',mimeType:'text/csv',buffer:Buffer.from('Datum;Betrag\n15.09.2026;-0,29\n')})
    await page.getByRole('button',{name:'1 Beleg(e) importieren',exact:true}).waitFor()
   }
   if(role==='ADMIN'){
    await upload()
    for(const width of [390,800,1360]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`bank import dialog overflow ${width}`)}
    await page.getByRole('button',{name:'1 Beleg(e) importieren',exact:true}).click()
    await page.locator('.bank-table-card tbody tr').filter({hasText:'Bank Mitgliedsbeitrag'}).click()
    await page.getByRole('button',{name:'Buchung anlegen',exact:true}).click()
    const booking=page.getByRole('dialog',{name:'Buchung erfassen',exact:true})
    assert(await booking.getByRole('button',{name:'Ausgabe',exact:true}).isDisabled())
    assert(await booking.getByLabel('Datum der Buchung').evaluate(input=>input.readOnly))
    assert(await booking.getByLabel('Brutto-Betrag',{exact:true}).evaluate(input=>input.readOnly))
    assert(await booking.getByRole('button',{name:'Buchungskonto wählen'}).isDisabled())
    assert.equal(await booking.getByRole('button',{name:'Budget',exact:true}).count(),0)
    if(general){await booking.getByRole('button',{name:'Kategorie der Buchung'}).click();await page.getByRole('option',{name:'Office',exact:true}).click()}
    await booking.getByRole('button',{name:'Buchung speichern',exact:true}).click()
    await page.getByText('Bankbeleg als Buchung übernommen.',{exact:true}).waitFor()
    await upload();await page.getByRole('button',{name:'1 Beleg(e) importieren',exact:true}).click()
    await page.getByRole('heading',{name:'Import geprüft',exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:/Duplikat.*trotzdem importieren/}).count(),0)
    await page.getByRole('button',{name:'Fertig',exact:true}).click()
    assert.deepEqual(writes,['/api/bank-imports/commit','/api/bank-transactions/1/book','/api/bank-imports/commit'])
   }else{
    assert.equal(await page.locator('button[aria-label="Bankdaten importieren"]').count(),0)
    await page.locator('.bank-table-card tbody tr').filter({hasText:'Bank Mitgliedsbeitrag'}).click()
    await page.getByText('Offener Bankbeleg · Lesender Zugriff',{exact:true}).waitFor()
    assert.equal(await page.getByRole('button',{name:'Buchung anlegen',exact:true}).count(),0)
    assert.equal(await page.getByRole('button',{name:'Aktionen',exact:true}).count(),0)
    await page.getByRole('button',{name:'Schließen',exact:true}).last().click()
   }
   for(const width of [390,800,1360]){await page.setViewportSize({width,height:900});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`bank list overflow ${width}`)}
   fail=true;await page.getByRole('textbox',{name:'Bankbelege durchsuchen'}).fill('fehler');await page.getByText('Test: Bankbelege nicht erreichbar',{exact:true}).waitFor()
  }
  assert.deepEqual(errors,[]);console.log(`${role}: bank original import/review/booking, source locks, duplicates, permissions and responsive passed`);await page.close()
 }
}finally{await browser.close()}
