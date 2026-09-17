import test from 'node:test'
import assert from 'node:assert/strict'
import {reportCsv,csvText,signedEuro} from '../src/reportCsv'
import type {Entry} from '../src/api'
const row=(id:number,fields:Partial<Entry>={}):Entry=>({id,number:`2026-${id}`,version:1,type:'IN',date:'2026-09-15',description:'Beitrag',grossAmountCents:29,sphere:'IDEELL',paymentMethod:'BANK',...fields})
test('CSV quotes and formula-neutralizes untrusted text while preserving signed exact cents',()=>{
 assert.equal(csvText('A; "B"\nC'),'"A; ""B""\nC"')
 for(const value of ['=1+1','+SUM(A1)','-1','@cmd',' \t=1','\rformula'])assert(csvText(value).startsWith('"\''))
 assert.equal(signedEuro(29,'IN'),'0,29');assert.equal(signedEuro(2345,'OUT'),'-23,45')
 assert.throws(()=>signedEuro(0.1,'IN'))
 const {text,count}=reportCsv([row(1,{description:'=1+1',counterparty:'A; "B"',type:'OUT',grossAmountCents:2345})])
 assert.equal(count,1);assert(text.startsWith('\uFEFF'));assert(text.includes('"\'=1+1"'));assert(text.includes('"A; ""B"""'));assert(text.endsWith(';-23,45\r\n'));assert(!text.includes('MwSt'))
})
test('CSV exports only intersection of all report filters and sorts deterministically',()=>{
 const match=row(1,{type:'OUT',paymentMethod:'CASH',budgets:[{budgetId:2,amount:0.1}],earmarksAssigned:[{earmarkId:3,amount:0.1}]})
 const entries=[match,row(2,{...match,id:2,date:'2026-09-16'}),row(3),row(4,{...match,id:4,sphere:'WGB'}),row(5,{...match,id:5,budgets:[]}),row(6,{...match,id:6,earmarksAssigned:[]}),row(7,{...match,id:7,date:'2026-08-01'})]
 const filters={from:'2026-09-01',to:'2026-09-30',sphere:'IDEELL' as const,type:'OUT' as const,paymentMethod:'BAR' as const,budgetId:2,earmarkId:3}
 const result=reportCsv(entries,filters,'DESC');assert.equal(result.count,2);assert(result.text.split('\r\n')[1].startsWith('2;'));assert(result.text.split('\r\n')[2].startsWith('1;'))
 assert.equal(reportCsv(entries,{...filters,to:'2026-09-15'}).count,1)
 assert.throws(()=>reportCsv(entries,{from:'2026-10-01',to:'2026-09-01'}))
 assert.equal(reportCsv([]).text.split('\r\n').length,2)
})
test('general profile CSV exports category labels and respects the category filter',()=>{
 const entries=[row(1,{primaryClassificationValueId:17,primaryClassificationName:'Haushalt'}),row(2)]
 const result=reportCsv(entries,{primaryClassificationValueId:17},'ASC','GENERAL')
 assert.equal(result.count,1)
 assert(result.text.includes('"Kategorie"'))
 assert(result.text.includes('"Haushalt"'))
 assert(!result.text.includes('"Sphäre"'))
 assert(reportCsv(entries,{},'ASC','GENERAL').text.includes('"Ohne Kategorie"'))
})
