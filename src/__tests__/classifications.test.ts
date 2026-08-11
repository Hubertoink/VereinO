jest.mock('../../electron/main/db/database', () => ({
  getDb: jest.fn(),
  withTransaction: (fn: (db: unknown) => unknown) => fn({})
}))

import { resolvePrimaryClassificationValueId } from '../../electron/main/repositories/classifications'

function classificationDb(profile: 'NONPROFIT' | 'GENERAL', value?: { id: number; stableKey: string; isActive: number }) {
  return {
    prepare(sql: string) {
      return {
        get: () => {
          if (sql.includes('FROM organization_profile')) return { profile }
          return value
        }
      }
    }
  }
}

describe('resolvePrimaryClassificationValueId', () => {
  it('maps a legacy non-profit sphere to its immutable system classification', () => {
    const id = resolvePrimaryClassificationValueId(
      classificationDb('NONPROFIT', { id: 11, stableKey: 'IDEELL', isActive: 1 }) as any,
      { legacySphere: 'IDEELL' }
    )

    expect(id).toBe(11)
  })

  it('rejects a primary classification that contradicts the legacy sphere', () => {
    expect(() =>
      resolvePrimaryClassificationValueId(
        classificationDb('NONPROFIT', { id: 12, stableKey: 'WGB', isActive: 1 }) as any,
        { legacySphere: 'IDEELL', primaryClassificationValueId: 12 }
      )
    ).toThrow('müssen übereinstimmen')
  })

  it('requires a selected category in the general profile', () => {
    expect(() =>
      resolvePrimaryClassificationValueId(
        classificationDb('GENERAL') as any,
        { legacySphere: 'IDEELL' }
      )
    ).toThrow(/Kategorie/i)
  })
})
