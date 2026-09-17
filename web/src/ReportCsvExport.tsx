import {useRef,useState} from 'react'
import {api,ApiError,type Entry} from './api'
import {reportCsv,type ReportExportFilters} from './reportCsv'
export default function ReportCsvExport({filters,count,onSessionExpired,profile='NONPROFIT'}:{profile?:'NONPROFIT'|'GENERAL';filters:ReportExportFilters;count:number;onSessionExpired:()=>void}){
 const [sort,setSort]=useState<'ASC'|'DESC'>('ASC'),[busy,setBusy]=useState(false),[error,setError]=useState(''),[notice,setNotice]=useState('')
 const saving=useRef(false)
 const exportCsv=async()=>{
  if(saving.current)return
  saving.current=true;setBusy(true);setError('');setNotice('')
  try{
   const {bookings}=await api<{bookings:Entry[]}>('/bookings')
   const result=reportCsv(bookings,filters,sort,profile),url=URL.createObjectURL(new Blob([result.text],{type:'text/csv;charset=utf-8'}))
   const anchor=document.createElement('a');anchor.href=url;anchor.download=`VereinO-Buchungen-${new Date().toLocaleDateString('sv-SE')}.csv`;document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)
   setNotice(`${result.count} ${result.count === 1 ? 'Buchung' : 'Buchungen'} exportiert.`)
  }catch(error){if(error instanceof ApiError&&error.status===401)onSessionExpired();else setError(error instanceof Error?error.message:'Export fehlgeschlagen.')}
  finally{saving.current=false;setBusy(false)}
 }
 return <div className="export-options-modal" style={{display:'grid',gap:12,padding:16}}>
  <h3 style={{margin:0}}>Buchungen als CSV exportieren</h3>
  <p className="helper" style={{margin:0}}>{count} {count === 1 ? 'Buchung' : 'Buchungen'} in der aktuellen Ansicht. Alle aktiven Berichtsfilter werden übernommen. Ausgaben erhalten ein negatives Vorzeichen.</p>
  <label className="field">Reihenfolge<select className="input" value={sort} onChange={event=>setSort(event.target.value as 'ASC'|'DESC')} disabled={busy}><option value="ASC">Datum aufsteigend</option><option value="DESC">Datum absteigend</option></select></label>
  {error&&<p role="alert" className="error-text">{error}</p>}
  {notice&&<p role="status">{notice}</p>}
  <div><button className="btn primary" onClick={()=>void exportCsv()} disabled={busy||!!(filters.from&&filters.to&&filters.from>filters.to)}>{busy?'Wird exportiert …':'CSV herunterladen'}</button></div>
 </div>
}
