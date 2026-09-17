import assert from 'node:assert/strict'
import {readFile} from 'node:fs/promises'
export async function verifyReportExport({editor}) {
 await editor.locator('[data-shortcut-nav="Reports"]').click()
 await editor.getByRole('heading',{name:'Report',exact:true}).waitFor()
 const expected=await editor.evaluate(async()=>(await(await fetch('/api/bookings')).json()).bookings)
 await editor.getByRole('button',{name:'Exportoptionen',exact:true}).click()
 const [download]=await Promise.all([editor.waitForEvent('download'),editor.getByRole('button',{name:'CSV herunterladen',exact:true}).click()])
 const text=await readFile(await download.path(),'utf8')
 assert(text.startsWith('\uFEFF'))
 assert(text.includes('"Betrag EUR"'))
 for(const entry of expected) {
  assert(text.includes(`"${entry.number}"`))
  const cents=entry.grossAmountCents
  assert(text.includes(`${entry.type==='OUT'?'-':''}${Math.floor(cents/100)},${String(cents%100).padStart(2,'0')}`))
 }
}
