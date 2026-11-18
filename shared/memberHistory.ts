import { z } from 'zod'

export const MEMBER_PROFILE_HISTORY_FIELDS = {
  memberNo: 'Mitgliedsnummer', name: 'Name', email: 'E-Mail', phone: 'Telefon',
  address: 'Adresse', status: 'Status', boardRole: 'Vorstandsfunktion',
  iban: 'IBAN', bic: 'BIC', contribution_amount: 'Beitrag',
  contribution_interval: 'Beitragsintervall', contribution_effective_date: 'Beitrag gültig ab',
  mandate_ref: 'Mandatsreferenz', mandate_date: 'Mandatsdatum', join_date: 'Eintritt',
  leave_date: 'Austritt', notes: 'Anmerkungen', next_due_date: 'Nächste Fälligkeit', tags: 'Tags'
} as const
export const MEMBER_HISTORY_FIELDS = { ...MEMBER_PROFILE_HISTORY_FIELDS, groups: 'Gruppen' } as const

const HistoryValue = z.union([z.string(), z.number(), z.array(z.string()), z.null()])
export const MemberHistoryChangeSchema = z.object({
  field: z.enum(Object.keys(MEMBER_HISTORY_FIELDS) as [keyof typeof MEMBER_HISTORY_FIELDS, ...Array<keyof typeof MEMBER_HISTORY_FIELDS>]),
  before: HistoryValue,
  after: HistoryValue
})
export const MemberHistoryInput = z.object({
  memberId: z.number().int().positive(),
  beforeId: z.number().int().positive().optional(),
  limit: z.number().int().min(1).max(100).default(30)
})
export const MemberHistoryOutput = z.object({
  rows: z.array(z.object({
    id: z.number().int(), createdAt: z.string(), action: z.enum(['CREATE', 'UPDATE']),
    changes: z.array(MemberHistoryChangeSchema)
  })),
  hasMore: z.boolean()
})
export type MemberHistoryChange = z.infer<typeof MemberHistoryChangeSchema>
export type MemberHistoryEntry = z.infer<typeof MemberHistoryOutput>['rows'][number]
