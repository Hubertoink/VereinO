import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { readFile, writeFile, mkdtemp, unlink, rmdir } from 'node:fs/promises'
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import os from 'node:os'
import path from 'node:path'

test('membership ledger migrates and allocates CAMT payments across overdue, future and partial periods atomically', async () => {
  const require = createRequire(path.join(process.cwd(), 'package.json'))
  const xml = await readFile('test-data/bankimport/mitgliedsbeitraege-bank-camt053.xml', 'utf8')
  const directory = await mkdtemp(path.join(os.tmpdir(), 'vereino-membership-'))
  const script = path.join(directory, 'fixture.cjs')
  try {
    const bundle = await build({ stdin: { resolveDir: process.cwd(), loader: 'ts', contents: `
      import assert from 'node:assert/strict'
      import { applyMigrations } from './electron/main/db/migrations'
      import { createMember, updateMember, listMembers } from './electron/main/repositories/members'
      import { createVoucher, reverseVoucher, updateVoucher } from './electron/main/repositories/vouchers'
      import { commitBankImport, listBankTransactions, saveBankTransactionAiSuggestions, getBankTransaction } from './electron/main/repositories/bankTransactions'
      import { previewBankAiBatchRow, applyBankAiBatchRow } from './electron/main/services/bankAiBatch'
      import { membershipBankCandidates } from './electron/main/services/bankMembership'
      import { validateBankReviewResult } from './electron/main/services/aiBankReviewValidation'
      import { previewContributionPayment, allocateContributionPayment, contributionStatus, contributionPeriods, removeContributionReceipt, availableContributionVouchers } from './electron/main/repositories/membershipLedger'
      import { listDue, history, unmark } from './electron/main/repositories/members_payments'
      const Database = require(${JSON.stringify(path.join(process.cwd(), 'node_modules/better-sqlite3'))})
      const RealDate = Date
      global.Date = class extends RealDate { constructor(...args) { super(...(args.length ? args : ['2026-11-11T12:00:00Z'])) } static now() { return new RealDate('2026-11-11T12:00:00Z').getTime() } }
      global.fixtureDb = new Database(':memory:'); const d = global.fixtureDb
      d.pragma('foreign_keys = ON'); applyMigrations(d)
      const members = [
        ['0001','Max Mustermann','2026-11-01'],['0002','Niko Dubio','2026-12-01'],['0003','Petra Coolio','2027-01-01'],['0004','Umut Tanis','2026-11-01']
      ].map(([memberNo,name,next_due_date]) => createMember({ memberNo,name,join_date:'2026-06-01',next_due_date,contribution_amount:10,contribution_interval:'MONTHLY' }).id)
      const account = d.prepare("SELECT id FROM payment_accounts WHERE kind='BANK' LIMIT 1").get().id
      const input = { fileBase64: Buffer.from(${JSON.stringify(xml)}).toString('base64'), fileName:'mitgliedsbeitraege-bank-camt053.xml',paymentAccountId:account }
      commitBankImport(input)
      const transactions = listBankTransactions({ limit: 100 }).rows.sort((a,b) => a.id-b.id)
      assert.equal(transactions.length,5)
      const next = [], states = []
      for (const transaction of transactions) {
        const candidates = membershipBankCandidates(transaction)
        assert.equal(candidates.length,1)
        const candidate = candidates[0]
        const suggestion = { transactionId:transaction.id,action:'CREATE_BOOKING',confidence:.98,reason:'Mitgliedsnummer und Name stimmen überein',warnings:[],evidence:candidate.evidence,
          membership:candidate.memberId === members[0] ? null : {memberId:candidate.memberId,startPeriod:candidate.startPeriod},bookingCandidate:{date:transaction.bookingDate,type:'IN',grossAmount:transaction.amount,sphere:'IDEELL',description:transaction.purpose,vatRate:0} }
        const validated = validateBankReviewResult({suggestions:[suggestion]},[{...transaction,matches:[],membershipCandidates:candidates}]).suggestions[0]
        assert.equal(validated.membership.memberId,candidate.memberId)
        saveBankTransactionAiSuggestions([validated])
        assert.equal(getBankTransaction(transaction.id).aiSuggestion.membership.memberId,candidate.memberId)
        if (candidate.memberId === members[0]) {
          saveBankTransactionAiSuggestions([{...validated,membership:null}])
          assert.equal(getBankTransaction(transaction.id).aiSuggestion.membership,null)
        }
        const preview = previewBankAiBatchRow(transaction.id)
        assert.deepEqual(preview.blockers,[])
        assert.equal(preview.membershipPreview.memberId,candidate.memberId)
        assert.equal(preview.transaction.aiSuggestion.membership.memberId,candidate.memberId)
        const result = applyBankAiBatchRow({id:transaction.id,token:preview.token})
        assert.ok(result.voucherId)
        assert.throws(() => applyBankAiBatchRow({id:transaction.id,token:preview.token}))
        next.push(contributionStatus(candidate.memberId).nextDue)
        states.push(contributionStatus(candidate.memberId))
      }
      assert.deepEqual(next,['2026-12-01','2027-10-01','2027-02-01','2026-11-01','2026-12-01'])
      assert.equal(states[3].dueAmount,6)
      assert.equal(states[4].dueAmount,0)
      assert.equal(states[1].prepaidAmount,100)
      assert.equal(states[2].prepaidAmount,15)
      assert.equal(states[3].prepaidAmount,0)
      assert.equal(contributionPeriods(members[2],'2027-02-28').find(p=>p.periodKey==='2027-02').remaining,5)
      assert.equal(history({memberId:members[1]}).rows.length,10)
      assert.equal(listMembers({includeSummary:true}).summary.dueAmount,0)
      commitBankImport(input)
      assert.equal(listBankTransactions({limit:100}).rows.length,5)
      assert.equal(d.prepare('SELECT COUNT(*) n FROM membership_receipts').get().n,5)
      // Real-world mismatch: the bank text starts in December, the member's plan in January.
      const januaryMember = createMember({memberNo:'JAN',name:'Januar Mitglied',join_date:'2026-06-01',next_due_date:'2027-01-01',contribution_amount:10,contribution_interval:'MONTHLY'}).id
      const januarySource = {id:9999,direction:'IN',amount:100,purpose:'Mitgliedsbeitrag JAN ab 2026-12 Vorauszahlung 10 Monate',counterparty:'Januar Mitglied'}
      const januaryCandidates = membershipBankCandidates(januarySource)
      assert.equal(januaryCandidates.length,1)
      assert.equal(januaryCandidates[0].startPeriod,'2027-01')
      assert.equal(januaryCandidates[0].preview.allocations.length,10)
      assert.equal(januaryCandidates[0].preview.allocations.at(-1).periodKey,'2027-10')
      assert.match(januaryCandidates[0].warnings[0],/2026-12.*2027-01/)
      const januarySuggestion = validateBankReviewResult({suggestions:[{transactionId:9999,action:'CREATE_BOOKING',reason:'Vorauszahlung',membership:{memberId:januaryMember,startPeriod:'2026-12'},bookingCandidate:{date:'2026-11-11',type:'IN',grossAmount:100,sphere:'IDEELL',description:'Beitrag',vatRate:0}}]},[{...januarySource,membershipCandidates:januaryCandidates}]).suggestions[0]
      assert.equal(januarySuggestion.action,'CREATE_BOOKING')
      assert.equal(januarySuggestion.membership.startPeriod,'2027-01')
      assert.equal(januarySuggestion.bookingCandidate.description,januarySource.purpose)
      assert.ok(januarySuggestion.warnings.length)
      allocateContributionPayment({memberId:januaryMember,amount:100,startPeriod:januarySuggestion.membership.startPeriod})
      assert.equal(contributionStatus(januaryMember).nextDue,'2027-11-01')
      const fixedDate=global.Date
      global.Date=class extends RealDate {constructor(...args){super(...(args.length?args:['2027-01-01T12:00:00Z']))}}
      assert.equal(contributionStatus(januaryMember).prepaidAmount,90)
      global.Date=fixedDate
      const receipt = d.prepare('SELECT id,voucher_id FROM membership_receipts WHERE member_id=?').get(members[1])
      reverseVoucher(receipt.voucher_id,null)
      assert.equal(contributionStatus(members[1]).nextDue,'2026-12-01')
      assert.equal(contributionStatus(members[1]).prepaidAmount,0)
      assert.equal(contributionPeriods(members[1],'2026-12-31').at(-1).remaining,10)
      assert.throws(() => previewContributionPayment({memberId:members[1],amount:10,voucherId:receipt.voucher_id}))
      const firstReceipt = d.prepare('SELECT id FROM membership_receipts WHERE member_id=?').get(members[0])
      removeContributionReceipt(firstReceipt.id)
      assert.equal(contributionStatus(members[0]).dueAmount,10)
      const future = allocateContributionPayment({memberId:members[0],amount:10,startPeriod:'2027-02'})
      assert.equal(contributionStatus(members[0]).nextDue,'2026-11-01')
      const preview = previewContributionPayment({memberId:members[0],amount:25})
      allocateContributionPayment({memberId:members[0],amount:4})
      assert.throws(() => allocateContributionPayment({memberId:members[0],amount:25,token:preview.token}),/geändert/)
      assert.equal(listMembers({includeSummary:true,contributionFilter:'DUE'}).summary.dueAmount,6)
      assert.equal(listDue({interval:'MONTHLY',memberId:members[0],dueThroughToday:true}).rows[0].amount,6)
      unmark({memberId:members[0],periodKey:'2027-02'})
      const credit = contributionStatus(members[0]).credits.find(r=>r.id===future.receiptId)
      assert.equal(credit.amount,10)
      assert.equal(contributionStatus(members[0]).prepaidAmount,0)
      allocateContributionPayment({memberId:members[0],receiptId:credit.id,amount:10})
      assert.equal(contributionStatus(members[0]).dueAmount,0)
      assert.equal(contributionStatus(members[0]).credit,0)
      updateMember({id:members[0],contribution_amount:20,next_due_date:'2027-01-01'})
      assert.equal(contributionPeriods(members[0],'2027-01-31').find(p=>p.periodKey==='2026-11').expected,10)
      assert.equal(contributionPeriods(members[0],'2027-01-31').find(p=>p.periodKey==='2027-01').expected,20)
      updateMember({id:members[2],leave_date:'2027-02-28'})
      const excess = allocateContributionPayment({memberId:members[2],amount:50})
      assert.equal(excess.preview.credit,45)
      assert.equal(contributionStatus(members[2]).prepaidAmount,20)
      assert.equal(contributionStatus(members[2]).credit,45)
      const ambiguous = {direction:'IN',amount:10,counterparty:'Unbekannt',purpose:'Mitgliedsbeitrag'}
      assert.equal(membershipBankCandidates(ambiguous).length,0)
      const invalid = validateBankReviewResult({suggestions:[{transactionId:999,action:'CREATE_BOOKING',reason:'x',membership:{memberId:members[0]},bookingCandidate:{date:'2026-11-11',type:'IN',grossAmount:10,sphere:'IDEELL',description:'x',vatRate:0}}]},[{id:999,direction:'IN',matches:[],membershipCandidates:[]}])
      assert.equal(invalid.suggestions[0].action,'NEEDS_MANUAL_REVIEW')
      const existing=createVoucher({date:'2026-11-11',type:'IN',sphere:'IDEELL',description:'Mitgliedsbeitrag 0001 Max Mustermann',counterparty:'Max Mustermann',grossAmount:9,vatRate:0,paymentMethod:'BANK',paymentAccountId:account})
      assert.equal(availableContributionVouchers('Max Mustermann').find(v=>v.id===existing.id).available,9)
      assert.equal(availableContributionVouchers(existing.voucherNo).find(v=>v.id===existing.id).available,9)
      const linkXml=Buffer.from(input.fileBase64,'base64').toString('utf8').replace('>10.00</Amt>','>9.00</Amt>').replaceAll('MAX-202611','MAX-LINK')
      commitBankImport({...input,fileBase64:Buffer.from(linkXml).toString('base64'),selectedSourceRows:[2]})
      const linkTx=listBankTransactions({limit:100}).rows.find(t=>t.amount===9)
      saveBankTransactionAiSuggestions([{transactionId:linkTx.id,action:'LINK_EXISTING',voucherId:existing.id,voucherNo:existing.voucherNo,confidence:.99,reason:'Bereits gebuchte Beitragszahlung',membership:{memberId:members[0]},warnings:[],evidence:[]}])
      const linkPreview=previewBankAiBatchRow(linkTx.id)
      assert.deepEqual(linkPreview.blockers,[])
      const voucherCount=d.prepare('SELECT COUNT(*) n FROM vouchers').get().n
      applyBankAiBatchRow({id:linkTx.id,token:linkPreview.token})
      assert.equal(d.prepare('SELECT COUNT(*) n FROM vouchers').get().n,voucherCount)
      assert.equal(d.prepare('SELECT SUM(amount_cents) n FROM membership_receipts WHERE voucher_id=?').get(existing.id).n,900)
      assert.equal(availableContributionVouchers(existing.voucherNo).some(v=>v.id===existing.id),false)
      const rollbackXml=linkXml.replace('>9.00</Amt>','>5.00</Amt>').replaceAll('MAX-LINK','MAX-ROLLBACK')
      commitBankImport({...input,fileBase64:Buffer.from(rollbackXml).toString('base64'),selectedSourceRows:[2]})
      const rollbackTx=listBankTransactions({limit:100}).rows.find(t=>t.amount===5)
      saveBankTransactionAiSuggestions([{transactionId:rollbackTx.id,action:'CREATE_BOOKING',confidence:.99,reason:'Beitragszahlung',membership:{memberId:members[0]},warnings:[],evidence:[],bookingCandidate:{date:'2026-11-11',type:'IN',grossAmount:5,sphere:'IDEELL',description:'Mitgliedsbeitrag Max Mustermann',vatRate:0}}])
      const rollbackPreview=previewBankAiBatchRow(rollbackTx.id)
      assert.deepEqual(rollbackPreview.blockers,[])
      assert.throws(()=>applyBankAiBatchRow({id:rollbackTx.id,token:rollbackPreview.token,membershipAllocation:{allocations:[{periodKey:'2027-01',interval:'MONTHLY',amount:99}]}}))
      assert.equal(d.prepare('SELECT COUNT(*) n FROM vouchers').get().n,voucherCount)
      assert.equal(getBankTransaction(rollbackTx.id).status,'OPEN')
      const oldUmut = d.prepare('SELECT voucher_id FROM membership_receipts WHERE member_id=? LIMIT 1').get(members[3]).voucher_id
      assert.throws(()=>updateVoucher({id:oldUmut,grossAmount:1}),/Mitgliedsbeiträgen/)
      assert.throws(()=>previewContributionPayment({memberId:members[3],amount:1,voucherId:oldUmut}),/verfügbare/)
      const quarterly=createMember({memberNo:'Q',name:'Quartalsmitglied',join_date:'2026-01-01',next_due_date:'2026-10-01',contribution_amount:30,contribution_interval:'QUARTERLY'}).id
      const qp=allocateContributionPayment({memberId:quarterly,amount:45}).preview
      assert.deepEqual(qp.allocations.map(a=>[a.periodKey,a.amount,a.remaining]),[['2026-Q4',30,0],['2027-Q1',15,15]])
      const yearly=createMember({memberNo:'Y',name:'Jahresmitglied',join_date:'2026-01-01',next_due_date:'2027-01-01',contribution_amount:120,contribution_interval:'YEARLY'}).id
      assert.deepEqual(allocateContributionPayment({memberId:yearly,amount:240}).preview.allocations.map(a=>a.periodKey),['2027','2028'])
      assert.equal(contributionStatus(yearly).nextDue,'2029-01-01')
      const centMember=createMember({memberNo:'CENT',name:'Centmitglied',join_date:'2026-11-01',contribution_amount:.3,contribution_interval:'MONTHLY'}).id
      allocateContributionPayment({memberId:centMember,amount:.1});allocateContributionPayment({memberId:centMember,amount:.2})
      assert.equal(contributionStatus(centMember).dueAmount,0)
      assert.throws(()=>previewContributionPayment({memberId:centMember,amount:.001}))
      updateMember({id:yearly,leave_date:'2027-12-31'})
      assert.equal(contributionStatus(yearly).credit,120)
      updateMember({id:yearly,leave_date:null})
      assert.equal(contributionStatus(yearly).credit,0)
      assert.equal(contributionStatus(yearly).nextDue,'2029-01-01')
      const beforeReceiptCount=d.prepare('SELECT COUNT(*) n FROM membership_receipts').get().n
      assert.throws(()=>allocateContributionPayment({memberId:members[3],amount:20,allocations:[{periodKey:'2026-12',interval:'MONTHLY',amount:20}]}))
      assert.equal(d.prepare('SELECT COUNT(*) n FROM membership_receipts').get().n,beforeReceiptCount)
      const mixed=createMember({memberNo:'MIX',name:'Gemischte Historie',join_date:'2026-01-01',next_due_date:'2026-01-01',contribution_amount:10,contribution_interval:'MONTHLY'}).id
      d.prepare("INSERT INTO membership_periods(member_id,period_key,interval,due_date,expected_cents) VALUES(?,'2026','YEARLY','2026-01-01',1500),(?,'2026-Q2','QUARTERLY','2026-04-01',1000)").run(mixed,mixed)
      allocateContributionPayment({memberId:mixed,amount:25,allocations:[{periodKey:'2026',interval:'YEARLY',amount:15},{periodKey:'2026-Q2',interval:'QUARTERLY',amount:10}]})
      const mixedCandidates=membershipBankCandidates({direction:'IN',amount:10,purpose:'Mitgliedsbeitrag MIX fuer 2026-11',counterparty:'Gemischte Historie'})
      assert.equal(mixedCandidates.length,1)
      assert.equal(mixedCandidates[0].memberId,mixed)
      assert.equal(mixedCandidates[0].startPeriod,'2026-11')
      assert.deepEqual(mixedCandidates[0].preview.allocations.map(p=>[p.interval,p.periodKey,p.amount]),[['MONTHLY','2026-11',10]])
      console.log('RESULT '+JSON.stringify({next,partial:states[3].dueAmount,receipts:d.prepare('SELECT COUNT(*) n FROM membership_receipts').get().n}))
      d.close()
      global.fixtureDb = new Database(':memory:'); const legacy=global.fixtureDb; legacy.pragma('foreign_keys=ON'); applyMigrations(legacy)
      legacy.exec('DROP TABLE membership_allocations; DROP TABLE membership_receipts; DROP TABLE membership_periods; DROP TABLE membership_plans; DELETE FROM migrations WHERE version=44')
      legacy.prepare("INSERT INTO members(id,member_no,name,status,join_date,next_due_date,contribution_amount,contribution_interval) VALUES(1,'LEGACY','Bestandsmitglied','ACTIVE','2026-06-01','2027-03-01',20,'MONTHLY')").run()
      legacy.exec("INSERT INTO membership_payments(member_id,period_key,interval,amount,date_paid,verified) VALUES(1,'2026-11','MONTHLY',10,'2026-11-01',0),(1,'2027-02','MONTHLY',20,'2026-11-01',0)")
      applyMigrations(legacy)
      assert.equal(contributionStatus(1).nextDue,'2026-12-01')
      assert.equal(contributionPeriods(1,'2026-11-30')[0].expected,10)
      assert.equal(contributionPeriods(1,'2026-11-30')[0].remaining,0)
      assert.equal(history({memberId:1}).rows.length,2)
      applyMigrations(legacy)
      assert.equal(history({memberId:1}).rows.length,2)
      assert.deepEqual(legacy.pragma('foreign_key_check'),[])
      legacy.close()
    ` }, bundle: true, platform: 'node', format: 'cjs', write: false, external: ['better-sqlite3', 'electron'], plugins: [{ name: 'test-db', setup(builder) {
      builder.onResolve({ filter: /better-sqlite3$/ }, args => ({ path: args.path, external: true }))
      builder.onResolve({ filter: /db\/database$/ }, () => ({ path: 'database', namespace: 'fixture' }))
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, () => ({ contents: 'export const getDb=()=>global.fixtureDb; export const withTransaction=fn=>global.fixtureDb.transaction(()=>fn(global.fixtureDb))(); export const getAppDataDir=()=>".";', loader: 'js' }))
    } }] })
    await writeFile(script, bundle.outputFiles[0].text)
    const output = execFileSync(require('electron'), [script], { env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout: 45_000 })
    const result = JSON.parse(output.split('\n').find(line => line.startsWith('RESULT '))!.slice(7))
    expect(result.next).toEqual(['2026-12-01', '2027-10-01', '2027-02-01', '2026-11-01', '2026-12-01'])
    expect(result.partial).toBe(6)
  } finally { await unlink(script).catch(() => {}); await rmdir(directory) }
})
