export type Frequency = 'WEEKLY' | 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
/** Advance from the original anchor day, so Jan 31 -> Feb 28 -> Mar 31. */
export function nextOccurrence(date: string, frequency: Frequency, anchor: string): string {
  const current = new Date(`${date}T00:00:00Z`)
  if (frequency === 'WEEKLY') current.setUTCDate(current.getUTCDate() + 7)
  else {
    const months = frequency === 'MONTHLY' ? 1 : frequency === 'QUARTERLY' ? 3 : 12
    const day = Number(anchor.slice(8,10))
    current.setUTCDate(1)
    current.setUTCMonth(current.getUTCMonth() + months)
    const end = new Date(Date.UTC(current.getUTCFullYear(),current.getUTCMonth()+1,0)).getUTCDate()
    current.setUTCDate(Math.min(day,end))
  }
  return current.toISOString().slice(0,10)
}
export function dueCount(next: string, through: string, frequency: Frequency, start: string, end?: string | null) {
  let count=0
  while(next<=through && (!end || next<=end) && count<10000) {count++;next=nextOccurrence(next,frequency,start)}
  return count
}
export function berlinToday() {
  return new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date())
}
