export function bankReminderDays(value: unknown) {
  const days = Number(value)
  return value == null || !Number.isInteger(days) || days < 0 || days > 365 ? 14 : days
}

export function bankImportReminder(lastImportAt: string | null | undefined, interval: unknown, now = new Date()) {
  const days = bankReminderDays(interval)
  // SQLite timestamps are UTC; ISO timestamps may already carry their own offset.
  const imported = lastImportAt ? new Date(lastImportAt.includes('T') ? lastImportAt : `${lastImportAt.replace(' ', 'T')}Z`) : null
  const validDate = imported && Number.isFinite(imported.getTime()) ? imported : null
  const day = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) / 86400000
  const age = validDate ? Math.max(0, day(now) - day(validDate)) : null
  const status = days === 0 ? 'disabled' : age == null || age === days ? 'due' : age > days ? 'overdue' : 'current'
  const label = { disabled: 'Erinnerung aus', due: 'Fällig', overdue: 'Überfällig', current: 'Nicht fällig' }[status]
  return { status, label, days, age, imported: validDate }
}
