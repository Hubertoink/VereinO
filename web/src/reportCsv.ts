import type { RendererApi } from '../../src/types/api'
import type { Entry } from './api'
import { filteredBookings } from './rendererApi'
export type ReportExportFilters=Parameters<RendererApi['reports']['summary']>[0]
/** Quote every text cell and neutralize spreadsheet formula prefixes, including leading controls. */
export function csvText(value:unknown):string{
 let text=String(value??'')
 if(/^[\s\u0000-\u001f]*[=+\-@]/u.test(text)||/^[\t\r\n]/.test(text))text=`'${text}`
 return `"${text.replace(/"/g,'""')}"`
}
export function signedEuro(cents:number,type:Entry['type']):string{
 if(!Number.isSafeInteger(cents)||cents<=0)throw new Error('Ungültiger Buchungsbetrag.')
 return `${type==='OUT'?'-':''}${Math.floor(cents/100)},${String(cents%100).padStart(2,'0')}`
}
export function reportCsv(entries:Entry[],filters:ReportExportFilters={},sort:'ASC'|'DESC'='ASC',profile:'NONPROFIT'|'GENERAL'='NONPROFIT'){
 if(filters.from&&filters.to&&filters.from>filters.to)throw new Error('„Von“ darf nicht nach „Bis“ liegen.')
 const rows=filteredBookings(entries,filters).sort((a,b)=>{const order=a.date.localeCompare(b.date)||a.id-b.id;return sort==='ASC'?order:-order})
 const spheres={IDEELL:'Ideell',ZWECK:'Zweckbetrieb',VERMOEGEN:'Vermögensverwaltung',WGB:'Wirtschaftlicher Geschäftsbetrieb'}
 const headers=['ID','Belegnummer','Datum','Art',profile==='GENERAL'?'Kategorie':'Sphäre','Beschreibung','Geschäftspartner','Zahlweg','Betrag EUR']
 const lines=[headers.map(csvText).join(';'),...rows.map(row=>[
  String(row.id),csvText(row.number||String(row.id)),csvText(row.date),csvText(row.type==='IN'?'Einnahme':'Ausgabe'),csvText(profile==='GENERAL'?(row.primaryClassificationName||'Ohne Kategorie'):spheres[row.sphere]),csvText(row.description),csvText(row.counterparty),csvText(row.paymentMethod==='CASH'?'Kasse':'Bank'),signedEuro(row.grossAmountCents,row.type)
 ].join(';'))]
 return {text:`\uFEFF${lines.join('\r\n')}\r\n`,count:rows.length}
}
