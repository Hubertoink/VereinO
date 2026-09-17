import { chromium } from 'playwright'
import assert from 'node:assert/strict'
const browser = await chromium.launch({headless:true,executablePath:process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined})
try {
  for (const role of ['ADMIN','EDITOR','USER']) {
    const page = await browser.newPage({viewport:{width:1360,height:900}})
    const errors=[], writes=[]
    page.on('pageerror', error => errors.push(error.message))
    let members=[{id:1,version:1,name:'Erika Muster',memberNo:'M001',join_date:'2026-09-15',status:'ACTIVE',email:'erika@example.org',contribution_amount:12,contribution_interval:'MONTHLY'}]
    let failList=false
    await page.route('**/api/**',async route => {
      const request=route.request(), url=new URL(request.url()), path=url.pathname, method=request.method()
      if(path==='/api/tags')return route.fulfill({json:{rows:[{id:1,name:'Training',color:'#3366cc'}]}})
      if(path==='/api/ai/documents')return route.fulfill({json:{rows:[]}})
      if(path==='/api/ai/settings')return route.fulfill({json:{enabled:false,hasApiKey:false}})
      
if(path==='/api/settings/profile'){await route.fulfill({json:{profile:'NONPROFIT',version:0}});return}
if(path==='/api/classifications/primary'){await route.fulfill({json:{profile:'NONPROFIT',definition:{primaryLabel:'Sphäre'},values:[]}});return}
if(path==='/api/settings/workflow'){await route.fulfill({json:{settings:{version:0,bookingView:'plus'}}});return}
if(path==='/api/settings/table'){await route.fulfill({json:{settings:{version:0,columns:{},columnOrder:[]}}});return}
let result={}
      if (/^\/api\/bookings\/\d+\/attachments$/.test(path)) result = { files: [], canUpload: true, canDelete: true }
      else if (path === '/api/settings/preferences') result = { preferences: { version: 0, themeMode: 'dark', colorTheme: 'default', navLayout: 'left', navIconColorMode: 'color' } }
      else if(path==='/api/auth/status') result={setupRequired:false}
      else if(path==='/api/auth/me') result={user:{id:1,email:'test@example.org',role,organizationId:1}}
      else if(path==='/api/bookings') result={bookings:[]}
      else if(path==='/api/drafts') result={drafts:[]}
      else if(path==='/api/planning/budgets'||path==='/api/planning/earmarks') result={rows:[]}
      else if(path==='/api/members' && method==='GET') {
        if(failList) {await route.fulfill({status:503,json:{message:'Test: Mitglieder nicht erreichbar'}});return}
        const q=(url.searchParams.get('q')||'').toLowerCase()
        const rows=members.filter(member=>member.name.toLowerCase().includes(q)||member.memberNo.toLowerCase().includes(q))
        result={rows,total:rows.length}
      } else if(path.startsWith('/api/members') && method!=='GET') {
        assert.equal(role,'ADMIN')
        const body=request.postDataJSON();writes.push({method,body})
        if(method==='POST') {result={...body,id:2,version:1};members.push(result)}
        if(method==='PATCH') {assert.equal(body.version,1);result={...body,id:1,version:2};members[0]=result}
        if(method==='DELETE') {assert.equal(body.version,2);members=members.filter(member=>member.id!==1);result={success:true}}
      }
      await route.fulfill({json:result})
    })
    await page.goto(process.env.WEB_TEST_URL||'http://localhost:5174')
    if(role==='USER') {
      await page.getByRole('heading',{name:'Buchungsentwürfe',exact:true}).waitFor()
      assert.equal(await page.getByRole('button',{name:'Mitglieder',exact:true}).count(),0)
    } else {
      await page.getByRole('button',{name:'Mitglieder',exact:true}).click()
      await page.getByText('Erika Muster',{exact:true}).waitFor()
      assert.equal(await page.getByTitle('Beitragsstatus & Historie').count(),0)
      assert.equal(await page.getByTitle('Mitglieder als Excel oder PDF exportieren').count(),0)
      if(role==='ADMIN') {
        await page.getByRole('button',{name:'Neu',exact:true}).click()
        const create=page.getByRole('dialog',{name:'Mitglied anlegen',exact:true})
        await create.locator('#member-number').fill('M002')
        await create.locator('#member-name').fill('Max Web')
        await create.locator('#member-join-date').fill('2026-09-15')
        await create.getByRole('button',{name:'Speichern',exact:true}).click()
        await page.getByText('Max Web',{exact:true}).waitFor()
        await page.getByRole('row').filter({hasText:'Erika Muster'}).getByTitle('Bearbeiten',{exact:true}).click()
        const edit=page.getByRole('dialog',{name:'Mitglied bearbeiten',exact:true})
        await edit.locator('#member-status').selectOption('PAUSED')
        await edit.locator('#member-notes').fill('Geändert im Browser')
        for(const width of [390,800,1360]) {
          await page.setViewportSize({width,height:900})
          assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`member form overflow ${width}`)
        }
        await edit.getByRole('button',{name:'Speichern',exact:true}).click()
        await page.getByRole('row').filter({hasText:'Erika Muster'}).getByLabel('Status: Pause').waitFor()
        await page.getByRole('row').filter({hasText:'Erika Muster'}).getByTitle('Bearbeiten',{exact:true}).click()
        await page.getByRole('button',{name:'Löschen',exact:true}).click()
        await page.getByRole('button',{name:'Endgültig löschen',exact:true}).click()
        await page.getByText('Erika Muster',{exact:true}).waitFor({state:'detached'})
        assert.deepEqual(writes.map(write=>write.method),['POST','PATCH','DELETE'])
      } else {
        assert.equal(await page.getByRole('button',{name:'Neu',exact:true}).count(),0)
        await page.getByTitle('Details anzeigen',{exact:true}).click()
        const details=page.getByRole('dialog',{name:'Mitglied ansehen',exact:true})
        assert(await details.locator('#member-name').isDisabled())
        assert.equal(await details.getByRole('button',{name:'Speichern',exact:true}).count(),0)
        assert.equal(await details.getByRole('button',{name:'Löschen',exact:true}).count(),0)
        await page.keyboard.press('Control+s')
        assert.equal(writes.length,0)
        await page.keyboard.press('Escape')
      }
      for(const width of [390,800,1360]) {
        await page.setViewportSize({width,height:900})
        assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`members page overflow ${width}`)
      }
      failList=true
      await page.getByPlaceholder('Suche (Name, E-Mail, Tel., Nr.)').fill('fehler')
      await page.getByRole('alert').filter({hasText:'Test: Mitglieder nicht erreichbar'}).waitFor()
    }
    assert.deepEqual(errors,[])
    console.log(`${role}: Members CRUD / read-only details / hidden nav, responsive and error UI passed`)
    await page.close()
  }
} finally {await browser.close()}
