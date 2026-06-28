import { parseBankStatement, parseCamtStatement } from '../../electron/main/services/bankStatementParser'

describe('bank statement parser', () => {
  it('parses CAMT credit and debit entries with the statement IBAN', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <Document>
        <BkToCstmrStmt>
          <Stmt>
            <Acct><Id><IBAN>DE12 3456 7890</IBAN></Id></Acct>
            <Ntry>
              <Amt Ccy="EUR">42.50</Amt>
              <CdtDbtInd>CRDT</CdtDbtInd>
              <BookgDt><Dt>2026-06-28</Dt></BookgDt>
              <ValDt><Dt>2026-06-27</Dt></ValDt>
              <NtryRef>REF-1</NtryRef>
              <NtryDtls><TxDtls>
                <Refs><EndToEndId>E2E-1</EndToEndId></Refs>
                <RltdPties><Dbtr><Nm>Max Mustermann</Nm></Dbtr><DbtrAcct><Id><IBAN>DE0099</IBAN></Id></DbtrAcct></RltdPties>
                <RmtInf><Ustrd>Mitgliedsbeitrag</Ustrd></RmtInf>
              </TxDtls></NtryDtls>
            </Ntry>
          </Stmt>
        </BkToCstmrStmt>
      </Document>`

    const parsed = parseCamtStatement(xml)

    expect(parsed.accountIbans).toEqual(['DE1234567890'])
    expect(parsed.rows[0]).toMatchObject({
      bookingDate: '2026-06-28',
      valueDate: '2026-06-27',
      direction: 'IN',
      amount: 42.5,
      counterparty: 'Max Mustermann',
      counterpartyIban: 'DE0099',
      purpose: 'Mitgliedsbeitrag',
      bankReference: 'REF-1',
      endToEndId: 'E2E-1',
      errors: []
    })
  })

  it('detects and parses a German semicolon CSV with quoted values', () => {
    const csv = [
      'Buchungstag;Betrag;Währung;Empfänger;Verwendungszweck',
      '28.06.2026;"-1.234,56";EUR;"Firma; Beispiel";Rechnung 123'
    ].join('\r\n')

    const parsed = parseBankStatement(Buffer.from(csv, 'utf8').toString('base64'), 'umsatz.csv')

    expect(parsed.format).toBe('CSV')
    expect(parsed.suggestedMapping.bookingDate).toBe('Buchungstag')
    expect(parsed.rows[0]).toMatchObject({
      bookingDate: '2026-06-28',
      direction: 'OUT',
      amount: 1234.56,
      counterparty: 'Firma; Beispiel',
      purpose: 'Rechnung 123',
      errors: []
    })
  })

  it('marks unsupported currencies and incomplete rows as invalid', () => {
    const csv = ['Datum,Betrag,Währung', '2026-06-28,10.00,USD', ',,EUR'].join('\n')
    const parsed = parseBankStatement(Buffer.from(csv).toString('base64'), 'bank.csv')

    expect(parsed.rows[0].errors).toContain('Währung USD wird nicht unterstützt.')
    expect(parsed.rows[1].errors).toEqual(expect.arrayContaining([
      'Buchungsdatum fehlt oder ist ungültig.',
      'Betrag fehlt oder ist 0.'
    ]))
  })
})
