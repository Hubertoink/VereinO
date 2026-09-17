import sharp from 'sharp'
import { PDFDocument } from 'pdf-lib'
export const MAX_ATTACHMENT_SIZE=10*1024*1024
const fail=(message:string):never=>{throw Object.assign(new Error(message),{statusCode:400})}
export async function validateAttachment(data:Buffer,fileName:string,declaredMime:string){
 if(!data.length||data.length>MAX_ATTACHMENT_SIZE)fail('Datei muss zwischen 1 Byte und 10 MB groß sein.')
 if(!fileName||fileName.length>255||/[\\/\x00-\x1f\x7f]/.test(fileName)||fileName==='.'||fileName==='..')fail('Ungültiger Dateiname.')
 const ext=fileName.split('.').at(-1)?.toLowerCase()
 let mime=''
 if(data.subarray(0,5).toString()==='%PDF-'){
  if(ext!=='pdf')fail('Dateiendung stimmt nicht mit dem Inhalt überein.')
  try{const document=await PDFDocument.load(data,{ignoreEncryption:false,updateMetadata:false});if(document.getPageCount()<1||document.getPageCount()>2000)fail('PDF hat eine ungültige Seitenzahl.')}catch{fail('PDF ist beschädigt oder verschlüsselt.')}
  mime='application/pdf'
 }else{
  try{
   const image=sharp(data,{limitInputPixels:40000000,failOn:'warning',animated:false})
   const metadata=await image.metadata()
   const formats:Record<string,{mime:string;ext:string[]}>= {png:{mime:'image/png',ext:['png']},jpeg:{mime:'image/jpeg',ext:['jpg','jpeg']},webp:{mime:'image/webp',ext:['webp']}}
   const format=metadata.format&&formats[metadata.format]
   if(!format||!ext||!format.ext.includes(ext))fail('Nur PDF, PNG, JPEG und WebP mit passender Dateiendung sind erlaubt.')
   // Force actual decoding, not just recognition of a forged header.
   await image.resize({width:1,height:1,fit:'inside'}).raw().toBuffer()
   mime=format.mime
  }catch(error){if((error as any).statusCode)throw error;fail('Bilddatei ist beschädigt oder zu groß.')}
 }
 if(declaredMime&&declaredMime!=='application/octet-stream'&&declaredMime!==mime)fail('Dateityp stimmt nicht mit dem Inhalt überein.')
 return {fileName,mimeType:mime}
}
