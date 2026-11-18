import { z } from 'zod'

const Id = z.number().int().positive()
const MemberIds = z.array(Id).min(1)
export const MemberGroupName = z.string().trim().min(1, 'Bitte gib einen Gruppennamen ein.').max(100)
export const MemberFiltersSchema = z.object({
  q: z.string().optional(),
  status: z.enum(['ACTIVE', 'NEW', 'PAUSED', 'LEFT', 'ALL']).optional(),
  contributionFilter: z.enum(['ALL', 'DUE', 'NOT_DUE', 'NO_PLAN']).optional(),
  intervalFilter: z.enum(['ALL', 'MONTHLY', 'QUARTERLY', 'YEARLY']).optional(),
  boardFilter: z.enum(['ALL', 'ANY', 'NONE', 'V1', 'V2', 'KASSIER', 'KASSENPR1', 'KASSENPR2', 'SCHRIFT']).optional(),
  groupId: z.union([Id, z.literal('none')]).optional()
})
export const MemberAudienceSchema = z.union([
  z.object({ memberIds: MemberIds }).strict(),
  z.object({ filters: MemberFiltersSchema }).strict()
])
export const GroupChangeSchema = z.union([
  z.object({ action: z.literal('create'), name: MemberGroupName, memberIds: z.array(Id) }).strict(),
  z.object({ action: z.enum(['add', 'remove']), groupId: Id, memberIds: MemberIds }).strict()
])
export type MemberFilters = z.infer<typeof MemberFiltersSchema>
export type MemberGroup = { id: number; name: string; memberCount: number }
export type MemberContact = { id: number; name: string; email: string | null }
export type MemberAudience = z.infer<typeof MemberAudienceSchema>
export type GroupChange = z.infer<typeof GroupChangeSchema>
