import { bankImportReminder, bankReminderDays } from '../../shared/bankImportReminder'

const today = new Date(2026, 10, 8, 12)
it.each([
  ['2026-11-07T12:00:00', 14, 'current'],
  ['2026-10-25T12:00:00', 14, 'due'],
  ['2026-10-24T12:00:00', 14, 'overdue'],
  [null, 14, 'due'],
  [null, 0, 'disabled'],
  ['2026-01-01T12:00:00', 0, 'disabled'],
  ['2026-11-09T12:00:00', 14, 'current'],
  ['invalid', 14, 'due'],
  ['2026-11-01T12:00:00', 7, 'due']
])('classifies %s at interval %s as %s', (date, interval, status) => {
  expect(bankImportReminder(date as string | null, interval, today).status).toBe(status)
})

it('retains the existing default and honors valid reminder settings', () => {
  for (const value of [undefined, null, -1, 366, 'invalid', 2.5]) expect(bankReminderDays(value)).toBe(14)
  expect(bankReminderDays(0)).toBe(0)
  expect(bankReminderDays('30')).toBe(30)
})

it('parses SQLite timestamps as UTC', () => {
  expect(bankImportReminder('2026-11-07 23:30:00', 14, today).imported?.toISOString()).toBe('2026-11-07T23:30:00.000Z')
})
