import Database from 'better-sqlite3'
import { getDb, withTransaction } from '../db/database'

 type DB = InstanceType<typeof Database>

export type ActivityReport = {
  fiscalYear: number
  activities: string
  purposeImpact: string
  targetGroups: string
  volunteerWork: string
  highlights: string
  notes: string
  updatedAt?: string | null
}

const EMPTY_REPORT_FIELDS = {
  activities: '',
  purposeImpact: '',
  targetGroups: '',
  volunteerWork: '',
  highlights: '',
  notes: ''
}

function mapRow(row: any, fiscalYear: number): ActivityReport {
  return {
    fiscalYear,
    activities: String(row?.activities ?? ''),
    purposeImpact: String(row?.purpose_impact ?? ''),
    targetGroups: String(row?.target_groups ?? ''),
    volunteerWork: String(row?.volunteer_work ?? ''),
    highlights: String(row?.highlights ?? ''),
    notes: String(row?.notes ?? ''),
    updatedAt: row?.updated_at ?? null
  }
}

export function getActivityReport(fiscalYear: number): ActivityReport {
  const d = getDb()
  const row = d.prepare('SELECT * FROM activity_reports WHERE fiscal_year = ?').get(fiscalYear) as any
  if (!row) return { fiscalYear, ...EMPTY_REPORT_FIELDS, updatedAt: null }
  return mapRow(row, fiscalYear)
}

export function saveActivityReport(input: ActivityReport): ActivityReport {
  return withTransaction((d: DB) => {
    d.prepare(`
      INSERT INTO activity_reports (
        fiscal_year, activities, purpose_impact, target_groups, volunteer_work, highlights, notes, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(fiscal_year) DO UPDATE SET
        activities = excluded.activities,
        purpose_impact = excluded.purpose_impact,
        target_groups = excluded.target_groups,
        volunteer_work = excluded.volunteer_work,
        highlights = excluded.highlights,
        notes = excluded.notes,
        updated_at = datetime('now')
    `).run(
      input.fiscalYear,
      input.activities ?? '',
      input.purposeImpact ?? '',
      input.targetGroups ?? '',
      input.volunteerWork ?? '',
      input.highlights ?? '',
      input.notes ?? ''
    )
    return getActivityReportFromDb(d, input.fiscalYear)
  })
}

function getActivityReportFromDb(d: DB, fiscalYear: number): ActivityReport {
  const row = d.prepare('SELECT * FROM activity_reports WHERE fiscal_year = ?').get(fiscalYear) as any
  if (!row) return { fiscalYear, ...EMPTY_REPORT_FIELDS, updatedAt: null }
  return mapRow(row, fiscalYear)
}

export function validateActivityReport(report: ActivityReport): string[] {
  const required: Array<[keyof ActivityReport, string]> = [
    ['activities', 'Aktivitäten/Projekte'],
    ['purposeImpact', 'Förderung der gemeinnützigen Zwecke'],
    ['targetGroups', 'Zielgruppen'],
    ['volunteerWork', 'Umfang der ehrenamtlichen Arbeit'],
    ['highlights', 'Besondere Ereignisse, Kooperationen, Förderungen']
  ]
  return required
    .filter(([key]) => !String(report[key] ?? '').trim())
    .map(([, label]) => label)
}
