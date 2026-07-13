import { MembersListInput } from '../../electron/main/ipc/schemas'

describe('members list filters', () => {
  it('accepts the advanced filters handled by the repository', () => {
    expect(MembersListInput.parse({
      q: 'Muster',
      contributionFilter: 'DUE',
      intervalFilter: 'MONTHLY',
      boardFilter: 'KASSIER',
      limit: 50,
      offset: 0
    })).toEqual(expect.objectContaining({
      contributionFilter: 'DUE',
      intervalFilter: 'MONTHLY',
      boardFilter: 'KASSIER'
    }))
  })

  it('rejects unknown advanced filter values', () => {
    expect(() => MembersListInput.parse({ contributionFilter: 'LATER' })).toThrow()
  })
})
