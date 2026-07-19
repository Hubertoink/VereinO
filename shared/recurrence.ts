export type RecurringFrequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'

const germanMonths = ['Januar', 'Februar', 'März', 'April', 'Mai', 'Juni', 'Juli', 'August', 'September', 'Oktober', 'November', 'Dezember']

/** Appends the period that belongs to a recurring occurrence to its booking text. */
export function recurringPeriodDescription(baseDescription: string, frequency: RecurringFrequency, scheduledDate: string) {
  const year = scheduledDate.slice(0, 4)
  const month = Number(scheduledDate.slice(5, 7))

  if (frequency === 'WEEKLY') {
    const date = new Date(`${scheduledDate}T00:00:00Z`)
    const thursday = new Date(date)
    thursday.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7))
    const isoYear = thursday.getUTCFullYear()
    const yearStart = new Date(Date.UTC(isoYear, 0, 1))
    const week = Math.ceil(((thursday.getTime() - yearStart.getTime()) / 86_400_000 + 1) / 7)
    return `${baseDescription} (KW ${week} ${isoYear})`
  }
  if (frequency === 'MONTHLY') return `${baseDescription} (${germanMonths[month - 1]} ${year})`
  if (frequency === 'QUARTERLY') return `${baseDescription} (Q${Math.ceil(month / 3)} ${year})`
  if (frequency === 'YEARLY') return `${baseDescription} (${year})`
  return baseDescription
}

function isoDate(year: number, month: number, day: number) {
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate()
}

export function addRecurringInterval(date: string, frequency: RecurringFrequency, anchorDay?: number) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date)
  if (!match) throw new Error('Ungültiges Wiederholungsdatum')

  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])

  if (frequency === 'WEEKLY') {
    const value = new Date(Date.UTC(year, month - 1, day + 7))
    return isoDate(value.getUTCFullYear(), value.getUTCMonth() + 1, value.getUTCDate())
  }

  const monthsToAdd = frequency === 'MONTHLY' ? 1 : frequency === 'QUARTERLY' ? 3 : 12
  const absoluteMonth = year * 12 + (month - 1) + monthsToAdd
  const nextYear = Math.floor(absoluteMonth / 12)
  const nextMonth = (absoluteMonth % 12) + 1
  return isoDate(nextYear, nextMonth, Math.min(anchorDay || day, daysInMonth(nextYear, nextMonth)))
}

export function localIsoDate(date = new Date()) {
  return isoDate(date.getFullYear(), date.getMonth() + 1, date.getDate())
}

export function advanceRecurringSchedule(input: {
  nextDueDate: string
  throughDate: string
  frequency: RecurringFrequency
  anchorDay: number
  endDate?: string | null
}) {
  const dueDates: string[] = []
  let nextDueDate = input.nextDueDate
  let ended = false
  let guard = 0

  while (nextDueDate <= input.throughDate && guard < 520) {
    if (input.endDate && nextDueDate > input.endDate) {
      ended = true
      break
    }
    dueDates.push(nextDueDate)
    nextDueDate = addRecurringInterval(nextDueDate, input.frequency, input.anchorDay)
    guard += 1
  }
  if (input.endDate && nextDueDate > input.endDate) ended = true
  return { dueDates, nextDueDate, ended }
}
