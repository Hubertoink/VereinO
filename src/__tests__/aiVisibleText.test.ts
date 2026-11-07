import { visibleAiText, reportSupplement } from '../../shared/aiVisibleText'

test('reasoning blocks are never shown, including incomplete provider output', () => {
  expect(visibleAiText('<think>Interne Überlegung</think>Der Entwurf ist bereit.')).toBe('Der Entwurf ist bereit.')
  expect(visibleAiText('<think>Interne Überlegung ohne Schluss')).toBe('')
  expect(visibleAiText('Antwort\n<THINK>Interner Rest')).toBe('Antwort')
  expect(visibleAiText('Ein normaler Text mit Zahlen 149,90 €.')).toBe('Ein normaler Text mit Zahlen 149,90 €.')
})

test('report repetition is removed while additional findings and differing numbers survive', () => {
  const reports = [{ summary: 'Der Saldo sank um 783,75 EUR. Die Buchungen stammen aus August.' }]
  expect(reportSupplement('Der Saldo sank um 783,75 EUR.\nDie Buchungen stammen aus August.\n\nZwei Beiträge sind noch offen.', reports)).toBe('Zwei Beiträge sind noch offen.')
  expect(reportSupplement(reports[0].summary, reports)).toBe('')
  expect(reportSupplement('Im Vergleichszeitraum waren es 500 EUR.', reports)).toBe('Im Vergleichszeitraum waren es 500 EUR.')
})
