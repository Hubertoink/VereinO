import { invoiceDescription } from '../renderer/utils/invoiceDescription'

it('appends the invoice number and trims inputs', () => {
  expect(invoiceDescription(' Büromaterial ', ' TEST-001 ')).toBe('Büromaterial (Rechnungsnr. TEST-001)')
})
it('does not duplicate an existing reference', () => {
  expect(invoiceDescription('Material (Rechnungsnr. TEST-001)', 'TEST-001')).toBe('Material (Rechnungsnr. TEST-001)')
  expect(invoiceDescription('Rechnung TEST-001 für Material', 'TEST-001')).toBe('Rechnung TEST-001 für Material')
})
it('distinguishes partial matches and treats special characters literally', () => {
  expect(invoiceDescription('Material TEST-0010', 'TEST-001')).toContain('(Rechnungsnr. TEST-001)')
  expect(invoiceDescription('Material (AB+12/3)', 'AB+12/3')).toBe('Material (AB+12/3)')
})
it('handles missing descriptions or invoice numbers', () => {
  expect(invoiceDescription('Material', '')).toBe('Material')
  expect(invoiceDescription('', 'TEST-001')).toBe('(Rechnungsnr. TEST-001)')
})
