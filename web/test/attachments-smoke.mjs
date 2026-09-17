import {chromium} from 'playwright'
import assert from 'node:assert/strict'
const browser=await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE||undefined})
const image=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aD1sAAAAASUVORK5CYII=','base64')
try{
 for(const [role,ownsBooking] of [['ADMIN',true],['EDITOR',true],['EDITOR',false]]){
  const page=await browser.newPage({viewport:{width:1360,height:950}}),errors=[]
  page.on('pageerror',e=>errors.push(e.message))
  const user={id:1,email:'team@test.invalid',role,organizationId:1}
  let files=[],uploads=0
  const file={id:'67e566ea-7a1b-4b0a-93ef-42183eec16e8',fileName:'Beleg.png',mimeType:'image/png',size:image.length,createdAt:'2026-09-15T00:00:00Z'}
  if(!ownsBooking)files=[file]
  await page.route('**/api/**',async route=>{
   const req=route.request(),path=new URL(req.url()).pathname,method=req.method()
      if(path==='/api/settings/modules')return route.fulfill({json:{version:0}})
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
      if(path==='/api/ai/documents')return route.fulfill({json:{rows:[]}})
      if(path==='/api/ai/settings')return route.fulfill({json:{enabled:false,hasApiKey:false}})
   
if(path==='/api/settings/profile'){await route.fulfill({json:{profile:'NONPROFIT',version:0}});return}
if(path==='/api/classifications/primary'){await route.fulfill({json:{profile:'NONPROFIT',definition:{primaryLabel:'Sphäre'},values:[]}});return}
if(path==='/api/settings/workflow'){await route.fulfill({json:{settings:{version:0,bookingView:'plus'}}});return}
if(path==='/api/settings/table'){await route.fulfill({json:{settings:{version:0,columns:{},columnOrder:[]}}});return}
let result
   if(path==='/api/auth/status')result={setupRequired:false}
   else if(path==='/api/auth/me')result={user}
   else if(path==='/api/settings/preferences')result={preferences:{themeMode:'dark',colorTheme:'default',navLayout:'left',navIconColorMode:'color',version:1}}
   else if(path.startsWith('/api/planning/'))result={rows:[]}
   else if(path==='/api/bookings')result={bookings:[{id:1,version:1,number:'2026-000001',date:'2026-09-15',type:'OUT',description:'Belegtest',grossAmountCents:1200,sphere:'IDEELL',paymentMethod:'BANK',createdBy:ownsBooking?1:2,fileCount:files.length}]}
   else if(path==='/api/bookings/1/attachments'&&method==='GET')result={files,canUpload:role==='ADMIN'||ownsBooking,canDelete:role==='ADMIN'}
   else if(path==='/api/bookings/1/attachments'&&method==='POST'){assert.equal(req.headers()['x-vereino-request'],'1');assert.match(req.headers()['content-type'],/multipart\/form-data/);uploads++;files=[file];result={file}}
   else if(path.endsWith('/content')){await route.fulfill({body:image,contentType:'image/png'});return}
   else if(path===`/api/attachments/${file.id}`&&method==='DELETE'){assert.equal(role,'ADMIN');files=[];result={ok:true}}
   else if (path === '/api/organizations') result = { organizations: [] }
    else throw new Error(`Unexpected ${method} ${path}`)
   await route.fulfill({json:result})
  })
  await page.goto(process.env.WEB_TEST_URL||'http://localhost:5174')
  await page.locator('.bp-row').waitFor()
  await page.locator('.bp-attachment').click()
  await page.locator('.attachments-modal__file-count').waitFor()
  if(ownsBooking){await page.locator('.attachments-modal__sidebar input[type=file]').setInputFiles({name:'Beleg.png',mimeType:'image/png',buffer:image});await page.locator('.attachments-modal__file-item').waitFor();assert.equal(uploads,1)}
  else assert.equal(await page.getByTitle('Datei(en) hinzufügen').count(),0)
  await page.locator('.attachments-modal__preview-img').waitFor()
  const downloadPromise=page.waitForEvent('download');await page.getByTitle('Herunterladen',{exact:true}).click();assert.equal((await downloadPromise).suggestedFilename(),'Beleg.png')
  assert.equal(await page.getByTitle('Extern öffnen',{exact:true}).count(),0)
  if(role==='ADMIN'){
   await page.getByTitle('Löschen',{exact:true}).click()
   await page.locator('.modal-actions-end').getByRole('button',{name:'Löschen',exact:true}).click()
   await page.getByText('Keine Dateien',{exact:true}).waitFor()
  }else assert.equal(await page.getByTitle('Löschen',{exact:true}).count(),0)
  await page.locator('.attachments-modal__close').click()
  await page.getByRole('button',{name:'Belege',exact:true}).click()
  await page.getByRole('heading',{name:'Belege',exact:true}).waitFor()
  for(const width of [390,800,1360]){await page.setViewportSize({width,height:950});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${role}/${width}`)}
  assert.deepEqual(errors,[]);await page.close();console.log(`${role} owns=${ownsBooking}: original attachments preview/download/permissions passed`)
 }
}finally{await browser.close()}
