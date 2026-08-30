import { scoreContributionVoucherMatch } from '../../shared/contributionVoucherMatching'

const base = {
  amount: 10,
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  memberName: 'Max Mustermann',
  voucherAmount: 10,
  voucherDate: '2026-08-14',
}

describe('contribution voucher suggestions', () => {
  it('requires the exact contribution amount', () => {
    expect(scoreContributionVoucherMatch({
      ...base,
      voucherAmount: 50,
      voucherDescription: 'Merle Beckord – Mitgliedsbeitrag 2026',
    })).toBeNull()
    expect(scoreContributionVoucherMatch({
      ...base,
      voucherAmount: 60,
      voucherDescription: 'Teilnahmebeitrag Graffiti-Workshop',
    })).toBeNull()
  })

  it('requires the voucher date to be inside the due period', () => {
    expect(scoreContributionVoucherMatch({
      ...base,
      voucherDate: '2026-07-06',
      voucherDescription: 'Mitgliedsbeitrag Max',
    })).toBeNull()
  })

  it('accepts a partial member-name match or a contribution keyword', () => {
    expect(scoreContributionVoucherMatch({
      ...base,
      voucherDescription: 'Mitgliedsbeitrag Juli',
    })).not.toBeNull()
    expect(scoreContributionVoucherMatch({
      ...base,
      voucherDescription: 'Max Sommer',
    })).not.toBeNull()
  })

  it('rejects an exact amount and period without text evidence', () => {
    expect(scoreContributionVoucherMatch({
      ...base,
      voucherDescription: 'Teilnahme Graffiti Workshop',
    })).toBeNull()
  })
})
