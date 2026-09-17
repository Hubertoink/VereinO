import { useLayoutEffect, useState } from 'react'
import BudgetsView from '../../src/renderer/views/Budgets/BudgetsView'
import EarmarksView from '../../src/renderer/views/Earmarks/EarmarksView'
import type { RendererApi } from '../../src/types/api'
import { createPlanningApi } from './planningApi'
import type { User } from './api'

type Props={user:User;onSessionExpired:()=>void;onGoToBookings:(id:number)=>void}
function PlanningModule({kind,user,onSessionExpired,onGoToBookings}:Props&{kind:'budgets'|'earmarks'}) {
  const [ready,setReady]=useState(false)
  const [notice,setNotice]=useState<{type:string;text:string}|null>(null)
  useLayoutEffect(()=>{
    const previous=window.api
    const planning=createPlanningApi(onSessionExpired)
    window.api={...planning,classifications:{primary:{list:async()=>({profile:'VEREIN',values:[]})}}} as unknown as RendererApi
    setReady(true)
    return()=>{window.api=previous}
  },[user.id,onSessionExpired])
  if(!ready)return <div role="status">Wird geladen …</div>
  const notify=(type:'success'|'error'|'info',text:string)=>setNotice({type,text})
  return <>
    {notice&&<div className={`alert ${notice.type}`} role={notice.type==='error'?'alert':'status'}>{notice.text}<button className="btn ghost" onClick={()=>setNotice(null)} aria-label="Hinweis schließen">×</button></div>}
    {kind==='budgets'?<BudgetsView readOnly={user.role!=='ADMIN'} notify={notify} onGoToBookings={onGoToBookings}/>:<EarmarksView readOnly={user.role!=='ADMIN'} notify={notify} onGoToBookings={onGoToBookings} onLoadEarmarks={async()=>{}}/>}
  </>
}
export function DesktopBudgets(props:Props){return <PlanningModule {...props} kind="budgets"/>}
export function DesktopEarmarks(props:Props){return <PlanningModule {...props} kind="earmarks"/>}
