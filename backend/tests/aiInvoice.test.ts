import test from 'node:test'
import assert from 'node:assert/strict'
import { parseInvoiceResult, analyzeWebInvoice } from '../src/services/aiInvoice.js'
const fields = { date:'2026-09-16',description:'Büromaterial',counterparty:'Shop',grossAmountCents:1250,type:'OUT',sphere:'IDEELL',primaryClassificationValueId:7,warnings:[] }
test('invoice output validates money/dates and never accepts foreign or fabricated categories',()=>{
 const general = parseInvoiceResult(JSON.stringify(fields),'GENERAL',[7])
 assert.equal(general.sphere,null);assert.equal(general.primaryClassificationValueId,7)
 assert.equal(parseInvoiceResult(JSON.stringify(fields),'GENERAL',[8]).primaryClassificationValueId,null)
 assert.equal(parseInvoiceResult(JSON.stringify(fields),'NONPROFIT',[]).primaryClassificationValueId,null)
 for(const patch of [{grossAmountCents:12.5},{grossAmountCents:-1},{date:'2026-02-30'},{type:'TRANSFER'},{unexpected:true}])assert.throws(()=>parseInvoiceResult(JSON.stringify({...fields,...patch}),'GENERAL',[]))
 assert.throws(()=>parseInvoiceResult('not json','GENERAL',[]))
 assert.equal(parseInvoiceResult(JSON.stringify({...fields,grossAmountCents:null,date:null}),'GENERAL',[7]).grossAmountCents,null)
})
test('invoice transport attaches document and returns validated values without writing bookings',async()=>{
 const transport: typeof fetch = async(_url,init)=>{
  const body=JSON.parse(String(init?.body));assert.equal(body.input[0].content[1].type,'input_file')
  assert.equal(body.input[0].content[1].file_data,'data:application/pdf;base64,cGRm')
  return Response.json({status:'completed',output:[{type:'message',content:[{type:'output_text',text:JSON.stringify(fields)}]}]})
 }
 const result=await analyzeWebInvoice({provider:'openai',model:'test',apiKey:'test'},{mimeType:'application/pdf',fileName:'invoice.pdf',data:Buffer.from('pdf')},'GENERAL',[{id:7,name:'Office'}],transport)
 assert.equal(result.fields.grossAmountCents,1250)
})
