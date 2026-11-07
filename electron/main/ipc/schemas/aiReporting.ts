import { z } from 'zod'
import type { ReportAnswer } from '../../../../shared/aiReporting'

const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T12:00:00Z`)
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
  }, 'Ungültiges Datum')

export const AiReportQuestionInput = z
  .object({
    question: z.string().trim().min(1).max(4000),
    from: date,
    to: date,
    conversation: z
      .array(
        z.object({
          question: z.string().max(4000),
          summary: z.string().max(1600),
          from: date,
          to: date
        })
      )
      .max(3)
      .optional()
  })
  .refine((input) => input.from <= input.to, 'Der Beginn muss vor dem Ende liegen.')
  .refine(
    (input) => Number(input.to.slice(0, 4)) - Number(input.from.slice(0, 4)) <= 100,
    'Bitte höchstens 100 Jahre auswerten.'
  )

export const AiReportNarrative = z.object({
  title: z.string(),
  summary: z.string(),
  notes: z.array(z.string()),
  blocks: z.array(z.enum(['metrics', 'balance']))
})

const scope = { from: date, to: date }
export const AiReportAnswerSchema: z.ZodType<ReportAnswer> = z.object({
  title: z.string(),
  summary: z.string(),
  notes: z.array(z.string()),
  blocks: z.array(z.object({ type: z.enum(['metrics', 'balance']), data: z.literal('finance') })),
  datasets: z.object({
    finance: z.object({
      scope: z.object(scope),
      generatedAt: z.string(),
      opening: z.number().finite(),
      income: z.number().finite(),
      expense: z.number().finite(),
      change: z.number().finite(),
      closing: z.number().finite(),
      hasBookings: z.boolean(),
      months: z.array(
        z.object({
          ...scope,
          month: z.string().regex(/^\d{4}-\d{2}$/),
          income: z.number().finite(),
          expense: z.number().finite(),
          change: z.number().finite(),
          balance: z.number().finite()
        })
      )
    })
  })
})
