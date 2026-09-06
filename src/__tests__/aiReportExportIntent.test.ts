import { wantsReportExport } from '../renderer/views/AI/aiPromptIntents'

describe('report export requires a current file request', () => {
  it.each([
    'Kannst du mir in einer Tabelle alle Budgets und deren zugehörigen Buchungen ausgeben?',
    'Erstelle eine Tabelle aller Budgets und Buchungen.',
    'Erstelle einen Controllingbericht für die letzten drei Monate.',
    'Was sticht bei den Ausgaben heraus?',
    'Und die Kennzahlen für August?',
    'Zeige mir den Bericht für einen anderen Zeitraum.',
    'Erstelle die Übersicht ohne PDF.',
    'Bitte keine Datei exportieren, nur im Chat anzeigen.'
  ])('keeps a chat/read request free of exports: %s', (prompt) => {
    expect(wantsReportExport(prompt)).toBe(false)
  })

  it.each([
    'Exportiere den Controllingbericht für 2026.',
    'Exportiere die Buchungen als CSV.',
    'Erstelle einen Controllingbericht als PDF.',
    'Speichere den Bericht als PDF.',
    'Bitte als PDF speichern.'
  ])('preserves explicit exports: %s', (prompt) => {
    expect(wantsReportExport(prompt)).toBe(true)
  })
})
