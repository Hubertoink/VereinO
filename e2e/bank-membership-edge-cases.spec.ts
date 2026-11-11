import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

test('imports ten CAMT cases and keeps donations, expenses and reimbursements out of member contributions', async () => {
  const require = createRequire(path.join(process.cwd(), 'package.json'))
  const xml = await readFile('test-data/bankimport/mitgliedsbeitraege-edge-cases-10-camt053.xml', 'utf8')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vereino-membership-edge-'))
  const script = path.join(directory, 'fixture.cjs')
  try {
    const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
      import assert from 'node:assert/strict'
      import { applyMigrations } from './electron/main/db/migrations'
      import { createMember } from './electron/main/repositories/members'
      import { commitBankImport, listBankTransactions, saveBankTransactionAiSuggestions } from './electron/main/repositories/bankTransactions'
      import { membershipBankCandidates } from './electron/main/services/bankMembership'
      import { validateBankReviewResult } from './electron/main/services/aiBankReviewValidation'
      import { previewBankAiBatchRow, applyBankAiBatchRow } from './electron/main/services/bankAiBatch'
      import { contributionPeriods } from './electron/main/repositories/membershipLedger'
      const Database = require(${JSON.stringify(path.join(process.cwd(), 'node_modules/better-sqlite3'))})
      const RealDate = Date
      global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-11-11T12:00:00Z'])) } static now() { return new RealDate('2026-11-11T12:00:00Z').getTime() } }
      global.fixtureDb = new Database(':memory:'); const d=global.fixtureDb
      d.pragma('foreign_keys=ON');applyMigrations(d)
      const members=[['0001','Max Mustermann','2026-01-01'],['0002','Niko Dubio','2027-01-01'],['0003','Petra Coolio','2027-01-01'],['0004','Umut Tanis','2026-11-01']]
        .map(([memberNo,name,next_due_date])=>createMember({memberNo,name,next_due_date,join_date:'2026-01-01',contribution_amount:10,contribution_interval:'MONTHLY'}).id)
      const account=d.prepare("SELECT id FROM payment_accounts WHERE kind='BANK' LIMIT 1").get().id
      const input={fileBase64:Buffer.from(${JSON.stringify(xml)}).toString('base64'),fileName:'mitgliedsbeitraege-edge-cases-10-camt053.xml',paymentAccountId:account}
      commitBankImport(input)
      const rows=listBankTransactions({limit:100}).rows.sort((a,b)=>a.id-b.id)
      assert.equal(rows.length,10)
      assert.equal(new Set(rows.map(row=>row.bankReference)).size,10)
      assert.equal(rows.filter(row=>row.direction==='IN').reduce((sum,row)=>sum+Math.round(row.amount*100),0),18500)
      assert.equal(rows.filter(row=>row.direction==='OUT').reduce((sum,row)=>sum+Math.round(row.amount*100),0),6000)
      const expectedMembers=[...members,null,null,null,null,null,null]
      const expectedNames=['Max Mustermann','Niko Dubio','Petra Coolio','Umut Tanis','Umut Tanis','Umut Tanis','Max Mustermann','Niko Dubio','Petra Coolio','Max Mustermann']
      for (const [index,row] of rows.entries()) {
        assert.equal(row.counterparty,expectedNames[index])
        assert.equal(row.direction,index===5 || index===6 ? 'OUT' : 'IN')
        const candidates=membershipBankCandidates(row)
        assert.deepEqual(candidates.map(candidate=>candidate.memberId),expectedMembers[index] ? [expectedMembers[index]] : [],row.purpose)
        const raw={transactionId:row.id,action:'CREATE_BOOKING',confidence:1,reason:'Testantwort aus Original-Bankdaten',membership:null,
          bookingCandidate:{date:row.bookingDate,type:row.direction,grossAmount:row.amount,sphere:'IDEELL',description:row.purpose,vatRate:0},warnings:[],evidence:[]}
        const context=[{...row,matches:[],membershipCandidates:candidates}]
        const validated=validateBankReviewResult({suggestions:[raw]},context).suggestions[0]
        assert.equal(validated.membership?.memberId || null,expectedMembers[index],row.purpose)
        if (!expectedMembers[index]) {
          const wrong=validateBankReviewResult({suggestions:[{...raw,membership:{memberId:members[expectedNames.indexOf(row.counterparty)]}}]},context).suggestions[0]
          assert.equal(wrong.action,'NEEDS_MANUAL_REVIEW','Invented contribution must be rejected: '+row.purpose)
        }
        saveBankTransactionAiSuggestions([validated])
        const preview=previewBankAiBatchRow(row.id)
        assert.equal(preview.membershipPreview?.memberId || null,expectedMembers[index])
        assert.deepEqual(preview.blockers,[],row.purpose)
        applyBankAiBatchRow({id:row.id,token:preview.token})
      }
      assert.equal(d.prepare('SELECT COUNT(*) n FROM vouchers').get().n,10)
      assert.equal(listBankTransactions({limit:100}).rows.filter(row=>row.status==='LINKED').length,10)
      assert.equal(d.prepare('SELECT COUNT(*) n FROM membership_receipts').get().n,4)
      assert.equal(d.prepare('SELECT SUM(amount_cents) n FROM membership_receipts').get().n,13500)
      assert.equal(contributionPeriods(members[0],'2026-12-31').find(p=>p.periodKey==='2026-12').paidAmount,10)
      assert.equal(contributionPeriods(members[1],'2027-10-31').filter(p=>p.remaining===0).length,10)
      assert.equal(contributionPeriods(members[2],'2027-01-31').find(p=>p.periodKey==='2027-01').remaining,5)
      assert.equal(contributionPeriods(members[3],'2027-01-31').filter(p=>p.remaining===0).length,2)
      commitBankImport(input)
      assert.equal(listBankTransactions({limit:100}).rows.length,10)
      assert.equal(d.prepare('SELECT COUNT(*) n FROM membership_receipts').get().n,4)

      // A different payer IBAN and receiving account must not prevent a further
      // contribution for the same member, identified by the explicit member number.
      d.prepare('UPDATE members SET iban=? WHERE id=?').run('DE89370400440532013000',members[0])
      const secondAccount=Number(d.prepare("INSERT INTO payment_accounts (name,kind) VALUES ('Zweites Vereinskonto','BANK')").run().lastInsertRowid)
      const changedXml=Buffer.from(input.fileBase64,'base64').toString('utf8').replaceAll('EDGE10','ACCOUNTCHANGE')
        .replace('<Dbtr><Nm>Max Mustermann</Nm></Dbtr>', '<Dbtr><Nm>Erika Mustermann</Nm></Dbtr><DbtrAcct><Id><IBAN>DE02120300000000202051</IBAN></Id></DbtrAcct>')
      const additional=commitBankImport({...input,paymentAccountId:secondAccount,fileBase64:Buffer.from(changedXml).toString('base64'),selectedSourceRows:[2]})
      assert.equal(additional.imported,1)
      const payment=listBankTransactions({limit:100}).rows.find(row=>row.id===additional.importedTransactionIds[0])
      assert.equal(payment.counterparty,'Erika Mustermann')
      assert.equal(payment.counterpartyIban,'DE02120300000000202051')
      const candidates=membershipBankCandidates(payment)
      assert.deepEqual(candidates.map(c=>c.memberId),[members[0]])
      saveBankTransactionAiSuggestions([{transactionId:payment.id,action:'CREATE_BOOKING',reason:'Weitere Beitragszahlung auf zweitem Vereinskonto',
        membership:{memberId:members[0],startPeriod:'2026-12'},bookingCandidate:{date:payment.bookingDate,type:'IN',grossAmount:10,sphere:'IDEELL',description:payment.purpose,vatRate:0}}])
      const preview=previewBankAiBatchRow(payment.id)
      assert.deepEqual(preview.blockers,[])
      const booked=applyBankAiBatchRow({id:payment.id,token:preview.token})
      assert.equal(d.prepare('SELECT payment_account_id FROM vouchers WHERE id=?').get(booked.voucherId).payment_account_id,secondAccount)
      assert.equal(d.prepare('SELECT member_id FROM membership_receipts WHERE voucher_id=?').get(booked.voucherId).member_id,members[0])
      assert.equal(contributionPeriods(members[0],'2027-01-31').find(p=>p.periodKey==='2027-01').paidAmount,10)
      assert.deepEqual(d.pragma('foreign_key_check'),[])
      console.log('RESULT '+JSON.stringify({transactions:10,contributions:4,other:6,income:185,expenses:60}))
      d.close()
    ` }, bundle: true, platform: 'node', format: 'cjs', write: false, external: ['better-sqlite3', 'electron'], plugins: [{ name: 'test-db', setup(builder) {
      builder.onResolve({ filter: /better-sqlite3$/ }, args => ({ path: args.path, external: true }))
      builder.onResolve({ filter: /db\/database$/ }, () => ({ path: 'database', namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const getDb=()=>global.fixtureDb; export const withTransaction=fn=>global.fixtureDb.transaction(()=>fn(global.fixtureDb))(); export const getAppDataDir=()=>".";', loader: 'js' }))
    } }] })
    await writeFile(script, bundle.outputFiles[0].text)
    const output = execFileSync(require('electron'), [script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 45_000 })
    const result = JSON.parse(output.split('\n').find(line => line.startsWith('RESULT '))!.slice(7))
    expect(result).toEqual({ transactions: 10, contributions: 4, other: 6, income: 185, expenses: 60 })
  } finally { await unlink(script).catch(() => {}); await rmdir(directory) }
})
