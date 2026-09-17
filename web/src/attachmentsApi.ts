import { webFetch, api, ApiError } from './api'
type FileId=number|string
export function createAttachmentsApi(onSessionExpired:()=>void, kind: 'bookings' | 'drafts' = 'bookings'){
 const names=new Map<FileId,string>()
 const check=async(response:Response)=>{if(response.ok)return response;if(response.status===401)onSessionExpired();const detail=await response.json().catch(()=>({}));throw new ApiError(response.status,detail.message||detail.error||'Datei konnte nicht geladen werden.')}
 const list=async({voucherId}:{voucherId:number})=>{
  try{const result=await api<{files:Array<{id:string;fileName:string;mimeType:string;size:number;createdAt:string}>;canUpload:boolean;canDelete:boolean}>(`/${kind}/${voucherId}/attachments`);for(const f of result.files)names.set(f.id,f.fileName);return{...result,canOpenExternal:false,acceptedFileTypes:'.pdf,.png,.jpg,.jpeg,.webp'}}catch(error){if(error instanceof ApiError&&error.status===401)onSessionExpired();throw error}
 }
 const content=async(fileId:FileId)=>check(await webFetch(`/api/attachments/${encodeURIComponent(fileId)}/content`,{credentials:'same-origin'}))
 const download=async({fileId}:{fileId:FileId})=>{
  const response=await content(fileId),blob=await response.blob(),url=URL.createObjectURL(blob)
  const anchor=document.createElement('a');anchor.href=url;anchor.download=names.get(fileId)||'Beleg';document.body.append(anchor);anchor.click();anchor.remove();setTimeout(()=>URL.revokeObjectURL(url),60000)
  return{downloadStarted:true}
 }
 return{
  list,
  async add({voucherId,fileName,dataBytes,dataBase64,mimeType}:{voucherId:number;fileName:string;dataBytes?:Uint8Array|number[];dataBase64?:string;mimeType?:string}){
   const bytes=dataBytes?new Uint8Array(dataBytes):Uint8Array.from(atob(dataBase64||''),char=>char.charCodeAt(0))
   const form=new FormData();form.append('file',new Blob([bytes],{type:mimeType||'application/octet-stream'}),fileName)
   const response=await check(await webFetch(`/api/${kind}/${voucherId}/attachments`,{method:'POST',credentials:'same-origin',headers:{'X-VereinO-Request':'1'},body:form}));return response.json()
  },
  async read({fileId}:{fileId:FileId}){const response=await content(fileId);return{dataBytes:new Uint8Array(await response.arrayBuffer()),mimeType:response.headers.get('content-type')}},
  saveAs:download,
  open:download,
  async delete({fileId}:{fileId:FileId}){try{return await api(`/attachments/${encodeURIComponent(fileId)}`,'DELETE')}catch(error){if(error instanceof ApiError&&error.status===401)onSessionExpired();throw error}}
 }
}
