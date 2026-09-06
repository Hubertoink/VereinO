import { buildAiMentionOptions } from '../renderer/views/AI/aiReferenceData'

describe('AI reference mentions', () => {
  it('creates scoped mentions from each loaded reference source', () => {
    const mentions = buildAiMentionOptions({
      tags: [{ id: 1, name: 'Spende', usage: 4 }] as any,
      budgets: [{ id: 2, categoryName: 'Jugend' }],
      bindings: [{ id: 3, code: 'ZWB', name: 'Projekt', isActive: true }],
      accounts: [{ id: 4, name: 'Kasse', kind: 'CASH', isActive: 1 }]
    })
    expect(mentions).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ insert: 'Tag:Spende', scope: 'Tag' }),
        expect.objectContaining({ insert: 'Budget:Jugend', scope: 'Kategorie' }),
        expect.objectContaining({ insert: 'Zweck:ZWB', scope: 'Zweckbindung' }),
        expect.objectContaining({ insert: 'Konto:Kasse', scope: 'Zahlungskonto' })
      ])
    )
  })
})
