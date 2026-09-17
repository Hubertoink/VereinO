import test from 'node:test'
import assert from 'node:assert/strict'
import { requestAiText } from '../src/services/aiProvider.js'
const settings = {provider:'openai' as const,model:'test-model',apiKey:'private-test-key'}
test('provider adapter uses fixed destination, server credentials and non-stored Responses request',async()=>{
 const transport: typeof fetch = async(url, init)=>{
  assert.equal(url,'https://api.openai.com/v1/responses')
  assert.equal(init?.redirect,'error')
  assert.equal((init?.headers as Record<string,string>).Authorization,'Bearer private-test-key')
  const body=JSON.parse(String(init?.body));assert.equal(body.store,false);assert.equal(body.model,'test-model')
  assert.equal(body.input,'Hello')
  return Response.json({status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:' Answer '}]}],usage:{input_tokens:4,output_tokens:2}})
 }
 assert.deepEqual(await requestAiText(settings,'Instructions','Hello',transport),{text:'Answer',usage:{inputTokens:4,outputTokens:2}})
})
test('Mittwald uses Chat Completions and normalizes text and usage',async()=>{
 const transport: typeof fetch = async(url,init)=>{
  assert.equal(url,'https://llm.aihosting.mittwald.de/v1/chat/completions')
  const body=JSON.parse(String(init?.body));assert.deepEqual(body.messages,[{role:'system',content:'System'},{role:'user',content:'Hello'}])
  return Response.json({choices:[{finish_reason:'stop',message:{content:'OK'}}],usage:{prompt_tokens:3,completion_tokens:1}})
 }
 assert.deepEqual(await requestAiText({...settings,provider:'mittwald'},'System','Hello',transport),{text:'OK',usage:{inputTokens:3,outputTokens:1}})
})
test('provider failures, partial responses and malformed or oversized payloads fail without leaking details',async()=>{
 const responses=[
  new Response('private-test-key internal upstream details',{status:401}),
  Response.json({status:'incomplete',output:[]}),
  new Response('not json'),
  Response.json({output:[]}),
  new Response('x'.repeat(2_000_001))
 ]
 for(const response of responses) await assert.rejects(requestAiText(settings,'System','Hello',async()=>response),(error: any)=>error.statusCode===502&&!error.message.includes('private-test-key'))
 await assert.rejects(requestAiText(settings,'System','Hello',async()=>{throw new Error('private-test-key')}),(error: any)=>!error.message.includes('private-test-key'))
})
