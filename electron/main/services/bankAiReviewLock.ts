const locks = new WeakMap<object, Set<number>>()

/** Prevent overlapping paid reviews of the same sources, including other windows. */
export async function withBankAiReviewLock<T>(database: object, ids: number[], run: () => Promise<T>): Promise<T> {
  const active = locks.get(database) || new Set<number>()
  if (ids.some(id => active.has(id))) throw new Error('Für mindestens einen dieser Bankbelege läuft bereits eine KI-Prüfung. Bitte warte, bis sie abgeschlossen ist.')
  locks.set(database, active)
  ids.forEach(id => active.add(id))
  try { return await run() } finally { ids.forEach(id => active.delete(id)) }
}
