import {z} from 'zod'
import {createHash} from 'node:crypto'
import {validateAttachment} from './attachments.js'
const date=z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(value=>{const parsed=new Date(`${value}T00:00:00Z`);return Number.isFinite(parsed.getTime())&&parsed.toISOString().slice(0,10)===value&&value>='1900-01-01'},'Ungültiges Datum.')
const taxCertificate=z.object({fileName:z.string().min(1).max(255),fileData:z.string().max(7*1024*1024),mimeType:z.enum(['application/pdf','image/png','image/jpeg']),fileSize:z.number().int().positive().max(5*1024*1024),uploadDate:z.string().max(40).optional(),validFrom:date.optional(),validUntil:date.optional()}).strict().refine(value=>!value.validFrom||!value.validUntil||value.validFrom<=value.validUntil,'Gültigkeitsende darf nicht vor dem Beginn liegen.')
export const organizationPatchSchema=z.object({version:z.number().int().positive(),name:z.string().trim().min(1).max(255).optional(),address:z.string().trim().max(2000).optional(),cashier:z.string().trim().max(255).optional(),logoDataUrl:z.string().max(1500000).nullable().optional(),taxCertificate:taxCertificate.nullable().optional()}).strict().refine(value=>Object.keys(value).length>1,'Bitte mindestens ein Feld ändern.')
const fail=(message:string):never=>{throw Object.assign(new Error(message),{statusCode:400})}
function decode(value:string,max:number){if(!/^[A-Za-z0-9+/]+={0,2}$/.test(value)||value.length%4)fail('Ungültige Base64-Datei.');const data=Buffer.from(value,'base64');if(!data.length||data.length>max||data.toString('base64')!==value)fail('Datei ist leer, ungültig oder zu groß.');return data}
export async function normalizeOrganizationPatch(patch:z.infer<typeof organizationPatchSchema>){
 const normalized={...patch}
 if(patch.logoDataUrl){const match=/^data:(image\/png|image\/jpeg|image\/webp);base64,(.+)$/.exec(patch.logoDataUrl);if(!match)fail('Logo muss PNG, JPEG oder WebP sein.');const mime=match![1],data=decode(match![2],1024*1024);await validateAttachment(data,`logo.${mime==='image/png'?'png':mime==='image/jpeg'?'jpg':'webp'}`,mime)}
 else if(patch.logoDataUrl==='')normalized.logoDataUrl=null
 if(patch.taxCertificate){const data=decode(patch.taxCertificate.fileData,5*1024*1024);if(data.length!==patch.taxCertificate.fileSize)fail('Angegebene Dateigröße stimmt nicht mit dem Inhalt überein.');await validateAttachment(data,patch.taxCertificate.fileName,patch.taxCertificate.mimeType)}
 return normalized
}
export function organizationView(row:Record<string,any>){return{name:row.name,version:row.settings_version,...{address:'',cashier:'',logoDataUrl:null,taxCertificate:null},...row.settings_data}}
/** Audit records keep hashes and document metadata, never image/document bytes. */
export function organizationAudit(row:Record<string,any>){
 const {logoDataUrl,taxCertificate,...data}=row
 return{...data,logo:logoDataUrl?{sha256:createHash('sha256').update(logoDataUrl).digest('hex')}:null,taxCertificate:taxCertificate?{...Object.fromEntries(Object.entries(taxCertificate).filter(([key])=>key!=='fileData')),sha256:createHash('sha256').update(taxCertificate.fileData).digest('hex')}:null}
}
