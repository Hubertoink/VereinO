export const AI_BOOKING_COMMENTS_SETTING = 'ai.bookingCommentsEnabled'

/** Only a dedicated, rule-guided comment is copied; never reasoning or warnings. */
export function aiBookingComment(enabled: boolean | undefined, note?: string | null): string {
  return enabled === true && typeof note === 'string' ? note.trim() : ''
}

export function aiBookingCommentInstruction(enabled: boolean) {
  return enabled
    ? 'KI-Kommentare sind aktiviert. Das Feld note ist der optionale Buchungskommentar. Beachte dafür die passenden aktiven aiRules und ausdrückliche Nutzerwünsche: Sie können Inhalte ergänzen, einschränken oder ausschließen. Ohne besondere Regel ergänze nur hilfreiche, belegte Zusatzinformationen, die nicht bereits in anderen Buchungsfeldern stehen. Erfinde keine Fakten. Schreibe keine automatischen Herkunftsfloskeln. reason, warnings und evidence sind getrennte Prüfinformationen und werden nicht automatisch in note kopiert. Wenn kein Kommentar sinnvoll ist, setze note null.'
    : 'KI-Kommentare sind deaktiviert. Setze note für neue Buchungsentwürfe null. Kopiere weder KI-Begründungen noch Warnungen in den Buchungskommentar. Diese Einstellung hat Vorrang vor Regeln, die automatisch Kommentare ergänzen würden. reason, warnings und evidence bleiben im Prüfdialog verfügbar.'
}

export const AI_CLASSIFICATION_INSTRUCTION = 'Kategorie/Sphäre und Budget sind getrennte Konzepte. Die grundlegende Einordnung ist verpflichtend. Ein Budget ist eine vom Nutzer zusätzlich angelegte, optionale Gruppierung zur Planung und Kontrolle von Buchungen, niemals die primäre Kategorie. Budget-IDs dürfen nicht als Kategorie-IDs verwendet werden. budgets und earmarks dürfen leer bleiben. Allein eine fehlende optionale Budget- oder Zweckbindungszuordnung ist kein Warnungsgrund. Weise nur auf konkrete Konflikte oder eine nicht erfüllbare ausdrücklich verlangte Zuordnung hin.'

export function aiClassificationInstruction(profile?: 'GENERAL' | 'NONPROFIT') {
  const rules = profile === 'GENERAL'
    ? 'Die aktive Organisation hat das Profil GENERAL und verwendet ausschließlich ihre selbst angelegten Kategorien. Es gibt fachlich keine steuerlichen Sphären. Wähle primaryClassificationValueId verpflichtend aus den aktiven primaryClassifications. Das Pflichtfeld sphere muss ausschließlich zur technischen Kompatibilität IDEELL enthalten: Es ist ein interner Platzhalter und niemals eine Aussage über die Organisation oder Buchung. Erwähne diesen Platzhalter oder eine Sphärenzuordnung nicht in reason, evidence, warnings, note oder sonstigen sichtbaren Texten. Begründe die Einordnung nur anhand der tatsächlich gewählten Kategorie und nenne ihren Namen statt interner IDs. Leite aus Zuschüssen, Spenden oder Jugendarbeit keine Gemeinnützigkeit ab.'
    : profile === 'NONPROFIT'
      ? 'Die aktive Organisation hat das Profil NONPROFIT und verwendet steuerliche Sphären. Wähle eine passende sphere. Eine primaryClassificationValueId muss zur selben Sphäre gehören (stableKey). Nenne in sichtbaren Texten verständliche Sphärennamen statt technischer Codes oder interner IDs.'
      : 'Beachte organization.profile: GENERAL verwendet verpflichtende selbst angelegte Kategorien, NONPROFIT verwendet steuerliche Sphären. Bei GENERAL ist sphere nur ein technischer Platzhalter, der nicht in sichtbaren Texten vorkommen darf. Nenne die verwendete Klassifikation beim Namen statt mit einer internen ID.'
  return `${AI_CLASSIFICATION_INSTRUCTION}\n${rules}`
}

// Plain absence is not a warning. Keep substantive conflicts and rule violations.
export function filterOptionalAssignmentWarnings(warnings: string[]) {
  return warnings.filter(warning => !/^(?:kein(?:e|en)?\s+(?:passendes?\s+)?budget\s+(?:zugeordnet|zugewiesen|gefunden)|(?:es\s+)?konnte\s+kein\s+budget\s+zugeordnet\s+werden|keine\s+zweckbindung\s+(?:zugeordnet|zugewiesen|gefunden))[.!]?$/i.test(warning.trim()))
}
