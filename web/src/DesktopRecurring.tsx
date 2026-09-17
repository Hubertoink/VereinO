import { useMemo } from 'react'
import RecurringBookingsView from '../../src/renderer/views/RecurringBookings/RecurringBookingsView'
import { api, ApiError, type User } from './api'
function cents(amount:number) {
 const value=Math.round(amount*100)
 if(!Number.isSafeInteger(value)||value<=0||Math.abs(amount-value/100)>1e-9) throw new Error('Bitte einen positiven Betrag mit höchstens zwei Nachkommastellen eingeben.')
 return value
}
export function createRecurringApi(onSessionExpired:()=>void) {
 const request=async(path:string,method='GET',data?:unknown):Promise<any>=>{try{return await api(path,method,data)}catch(error){if(error instanceof ApiError&&error.status===401)onSessionExpired();throw error}}
 const display=(row:any)=>({...row,amount:row.grossAmountCents/100,amountMode:'GROSS',vatRate:0,paymentAccountId:row.paymentMethod==='CASH'?2:1,paymentAccountName:row.paymentMethod==='CASH'?'Kasse':'Bank',budgets:[],earmarks:[],tags:[],note:null,budgetId:null,earmarkId:null,suggestedVoucherId:null})
 return {
  primaryClassification:()=>request('/classifications/primary'),
  list:async(input:Record<string,unknown>={})=>{const query=new URLSearchParams();for(const[key,value]of Object.entries(input))if(value!=null)query.set(key,String(value));const result=await request(`/recurring?${query}`);return{rows:result.rows.map(display)}},
  summary:()=>request('/recurring/summary'),
  upsert:async(input:any)=>{
   if(input.amountMode!=='GROSS'||input.vatRate||input.budgets?.length||input.earmarks?.length||input.tags?.length||input.note) throw new Error('Diese Zusatzfelder sind für Dauerbuchungen im Web noch nicht verfügbar.')
   if(![1,2].includes(input.paymentAccountId))throw new Error('Bitte Bank oder Kasse auswählen.')
   const data={primaryClassificationValueId:input.primaryClassificationValueId,name:input.name,type:input.type,sphere:input.sphere,description:input.description,counterparty:input.counterparty,grossAmountCents:cents(input.amount),paymentMethod:input.paymentAccountId===2?'CASH':'BANK',frequency:input.frequency,startDate:input.startDate,nextDueDate:input.nextDueDate,endDate:input.endDate,variableAmount:input.variableAmount,status:input.status,...(input.id?{version:input.version}:{})}
   return request(input.id?`/recurring/${input.id}`:'/recurring',input.id?'PATCH':'POST',data)
  },
  setStatus:({id,status,version}:any)=>request(`/recurring/${id}/status`,'PATCH',{status,version}),
  skip:({recurringBookingId,version,expectedDueDate}:any)=>request(`/recurring/${recurringBookingId}/skip`,'POST',{version,expectedDueDate}),
  book:({recurringBookingId,version,expectedDueDate,bookingDate,amount}:any)=>request(`/recurring/${recurringBookingId}/book`,'POST',{version,expectedDueDate,bookingDate,grossAmountCents:cents(amount)}),
  link:async()=>{throw new Error('Bestehende Buchungen können hier noch nicht zugeordnet werden.')}
 }
}
export default function DesktopRecurring({user,onSessionExpired,notify}:{user:User;onSessionExpired:()=>void;notify:(type:'success'|'error'|'info',text:string,ms?:number)=>void}) {
 const backendApi=useMemo(()=>createRecurringApi(onSessionExpired),[onSessionExpired])
 if(user.role==='USER')return null
 return <RecurringBookingsView backendApi={backendApi} webMode canManage={user.role==='ADMIN'} notify={notify}/>
}
