import { useMemo, useState } from 'react'
import BankImportView, { BankImportWebContext, type BankTransaction } from '../../src/renderer/views/BankImport/BankImportView'
import BookingEditor from './BookingEditor'
import { api, ApiError, type Fields, type User } from './api'
import { dispatchDataChanged } from '../../src/renderer/utils/refresh'
const paymentAccounts=[{id:1,name:'Bank',kind:'BANK' as const,isActive:1}]
function encode(bytes:Uint8Array){let text='';for(let i=0;i<bytes.length;i+=8192)text+=String.fromCharCode(...bytes.subarray(i,i+8192));return btoa(text)}
export function createBankImportApi(onSessionExpired:()=>void){
 const request=async(path:string,method='GET',data?:unknown):Promise<any>=>{try{return await api(path,method,data)}catch(error){if(error instanceof ApiError&&error.status===401)onSessionExpired();throw error}}
 const filePayload=({fileBytes,fileName,mapping}:any)=>({fileBase64:encode(fileBytes),fileName,...(mapping?{mapping}:{})})
 return{
  bankImports:{preview:(input:any)=>request('/bank-imports/preview','POST',filePayload(input)),commit:(input:any)=>{if(input.forceImportSourceRows?.length)throw new Error('Bereits importierte Zeilen werden nicht erneut übernommen.');return request('/bank-imports/commit','POST',{...filePayload(input),paymentAccountId:input.paymentAccountId})}},
  bankTransactions:{list:(input:Record<string,unknown>)=>{const query=new URLSearchParams();for(const[key,value]of Object.entries(input))if(value!=null)query.set(key,String(value));return request(`/bank-transactions?${query}`)},importStatus:()=>request('/bank-transactions/import-status')}
 }
}
export default function DesktopBankImport({user,onSessionExpired,notify,onOpenVoucher}:{user:User;onSessionExpired:()=>void;notify:(type:'success'|'error'|'info',text:string)=>void;onOpenVoucher:(id:number,voucherNo?:string|null,date?:string)=>void}){
 const backendApi=useMemo(()=>createBankImportApi(onSessionExpired),[onSessionExpired])
 const context=useMemo(()=>({api:backendApi,canManage:user.role==='ADMIN'}),[backendApi,user.role])
 const [transaction,setTransaction]=useState<BankTransaction|null>(null)
 if(user.role==='USER')return null
 const initialFields:Fields|undefined=transaction?{date:transaction.bookingDate,type:transaction.direction,description:transaction.purpose||transaction.counterparty||'Bankbuchung',grossAmountCents:Math.round(transaction.amount*100),paymentMethod:'BANK',sphere:'IDEELL',counterparty:transaction.counterparty||''}:undefined
 return <BankImportWebContext.Provider value={context}>
  <BankImportView paymentAccounts={paymentAccounts} notify={notify} onCreateBooking={setTransaction} onOpenVoucher={onOpenVoucher}/>
  {transaction&&<BookingEditor user={user} initialFields={initialFields} saveBooking={fields=>api(`/bank-transactions/${transaction.id}/book`,'POST',{...fields,version:transaction.version})} onClose={()=>setTransaction(null)} onSessionExpired={onSessionExpired} onSaved={()=>{setTransaction(null);notify('success','Bankbeleg als Buchung übernommen.');dispatchDataChanged(['bank-imports','vouchers'])}}/>}
 </BankImportWebContext.Provider>
}
