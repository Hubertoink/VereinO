import test from 'node:test'
import assert from 'node:assert/strict'
import { PDFDocument } from 'pdf-lib'
import sharp from 'sharp'
import { invoicePdfImages } from '../src/services/aiPdf.js'
import { analyzeWebInvoice } from '../src/services/aiInvoice.js'
test('PDF analysis renders every page, limits long files and sends images to Mittwald',async()=>{
 const pdf = await PDFDocument.create()
 pdf.addPage([300,400]).drawText('Invoice page 1')
 pdf.addPage([300,400]).drawText('Invoice page 2')
 const bytes = Buffer.from(await pdf.save())
 const pages = await invoicePdfImages(bytes)
 assert.equal(pages.length,2)
 for(const page of pages) { const metadata=await sharp(page).metadata(); assert.equal(metadata.format,'jpeg'); assert((metadata.width||0)<=1600); assert((metadata.height||0)<=1600) }
 const transport: typeof fetch = async(_url,init)=>{
  const content=JSON.parse(String(init?.body)).messages[1].content
  assert.equal(content.length,3)
  assert(content[1].image_url.url.startsWith('data:image/jpeg;base64,'))
  assert(content[2].image_url.url.startsWith('data:image/jpeg;base64,'))
  return Response.json({choices:[{finish_reason:'stop',message:{content:JSON.stringify({date:null,description:'Invoice',counterparty:'',grossAmountCents:null,type:'OUT',sphere:null,primaryClassificationValueId:null,warnings:['Missing amount']})}}]})
 }
 const result=await analyzeWebInvoice({provider:'mittwald',model:'test',apiKey:'test'},{data:bytes,fileName:'invoice.pdf',mimeType:'application/pdf'},'GENERAL',[],transport)
 assert.equal(result.fields.grossAmountCents,null)
 for(let i=2;i<13;i++)pdf.addPage()
 await assert.rejects(invoicePdfImages(Buffer.from(await pdf.save())), /12 Seiten/)
})
