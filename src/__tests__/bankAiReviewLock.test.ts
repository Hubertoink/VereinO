import { withBankAiReviewLock } from '../../electron/main/services/bankAiReviewLock'

it('rejects overlapping reviews before a second paid request and releases the lock on success', async () => {
  const db = {}
  let finish!: () => void
  const first = withBankAiReviewLock(db, [1, 2], () => new Promise<void>(resolve => { finish = resolve }))
  const duplicate = jest.fn(async () => {})
  await expect(withBankAiReviewLock(db, [2, 3], duplicate)).rejects.toThrow('bereits eine KI-Prüfung')
  expect(duplicate).not.toHaveBeenCalled()
  await expect(withBankAiReviewLock(db, [3], async () => 'other')).resolves.toBe('other')
  await expect(withBankAiReviewLock({}, [1], async () => 'other organization')).resolves.toBe('other organization')
  finish()
  await first
  await expect(withBankAiReviewLock(db, [1, 2], async () => 'again')).resolves.toBe('again')
})

it('releases source locks after a provider failure so retry is possible', async () => {
  const db = {}
  await expect(withBankAiReviewLock(db, [5], async () => { throw new Error('Provider offline') })).rejects.toThrow('Provider offline')
  await expect(withBankAiReviewLock(db, [5], async () => 'retry')).resolves.toBe('retry')
})
