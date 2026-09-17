import {useLayoutEffect,useState} from 'react'
import ReceiptsView from '../../src/renderer/views/ReceiptsView'
import type {RendererApi} from '../../src/types/api'
import {createRendererReadApi} from './rendererApi'
import {createAttachmentsApi} from './attachmentsApi'
import type {User} from './api'
export default function DesktopReceipts({user,onSessionExpired,onGoToBooking}:{user:User;onSessionExpired:()=>void;onGoToBooking:(id:number)=>void}){
 const [ready,setReady]=useState(false)
 useLayoutEffect(()=>{const previous=window.api,adapter=createRendererReadApi(onSessionExpired);window.api={...adapter.bridge,attachments:createAttachmentsApi(onSessionExpired)} as unknown as RendererApi;setReady(true);return()=>{adapter.dispose();window.api=previous}},[user.id,onSessionExpired])
 if(!ready)return <div role="status">Belege werden geladen …</div>
 return <ReceiptsView onGoToBooking={onGoToBooking}/>
}
