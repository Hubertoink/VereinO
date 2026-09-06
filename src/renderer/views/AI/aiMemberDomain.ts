import type { TMemberCreateInput, TMemberUpdateInput } from '../../../../electron/main/ipc/schemas'
import type { PaymentAccountOption } from './aiBooking'
import type {
  AiMemberDraft,
  AiMemberImportState,
  AiMemberUpdateChange,
  AiMemberUpdateField,
  AiMemberUpdateState,
  MemberRow
} from './aiViewTypes'
import { formatIsoDate, normalizeLookup, parseGermanDate } from './aiText'

const euro = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })

export function parseMemberContributionAmount(prompt: string) {
  const toAmount = (major?: string, minor?: string) => {
    if (!major) return null
    const euros = Number(major.replace(/\./g, ''))
    if (!Number.isFinite(euros)) return null
    const cents = minor && minor !== '-' ? minor.padEnd(2, '0').slice(0, 2) : '00'
    const amount = Number(`${euros}.${cents}`)
    return amount > 0 && amount <= 1000 ? amount : null
  }

  const explicitMoney = prompt.match(/\b(\d{1,4})(?:\s*[,.]\s*(\d{1,2}|-))?\s*(?:€|eur\b|euro\b)/i)
  const explicitAmount = toAmount(explicitMoney?.[1], explicitMoney?.[2])
  if (explicitAmount != null) return explicitAmount

  const contributionNearAmount =
    prompt.match(
      /(?:mitgliedsbeitrag|beitrag|betrag)[^\n\r]{0,80}?(?:von|ueber|über|=|:)\s*(\d{1,4})(?:\s*[,.]\s*(\d{1,2}|-))?/i
    ) || prompt.match(/(?:mitgliedsbeitrag|beitrag|betrag)\s+(\d{1,4})(?:\s*[,.]\s*(\d{1,2}|-))?/i)
  return toAmount(contributionNearAmount?.[1], contributionNearAmount?.[2])
}

export function parseContributionHint(prompt: string) {
  const normalized = normalizeLookup(prompt)
  const amount = parseMemberContributionAmount(prompt)
  const interval: TMemberCreateInput['contribution_interval'] | null = /(jahr|jaehr|jähr)/.test(
    normalized
  )
    ? 'YEARLY'
    : /(quartal|viertel)/.test(normalized)
      ? 'QUARTERLY'
      : /(monat)/.test(normalized)
        ? 'MONTHLY'
        : null
  return { amount, interval }
}

export function isLikelyMemberName(name: string) {
  const cleaned = String(name || '')
    .replace(/^[\d.)\-\s]+/, '')
    .replace(/[,;:]$/, '')
    .trim()
  const normalized = normalizeLookup(cleaned)
  if (!cleaned || !/[A-Za-zÄÖÜäöüß]{2,}\s+[A-Za-zÄÖÜäöüß]{2,}/.test(cleaned)) return false
  if (
    /^(erste zahlungsfrist|zahlungsfrist|faelligkeit|falligkeit|geburt|geburtsdatum|eintritt|beitrag|mitgliedsbeitrag|betrag|rolle|hinweis|mitglied|mitglieder|mitgliederanlage|beitragspflicht)$/.test(
      normalized
    )
  )
    return false
  return true
}

export function sanitizeMemberDrafts(members: AiMemberDraft[]) {
  const seen = new Set<string>()
  const sanitized: AiMemberDraft[] = []
  for (const member of members) {
    if (!isLikelyMemberName(member.name)) continue
    const key = normalizeLookup(`${member.name}-${member.joinDate}`)
    if (seen.has(key)) continue
    seen.add(key)
    sanitized.push({
      ...member,
      contributionAmount:
        member.contributionAmount &&
        member.contributionAmount > 0 &&
        member.contributionAmount <= 1000
          ? member.contributionAmount
          : null
    })
  }
  return sanitized
}

export function sanitizeMemberState(state?: AiMemberImportState | null) {
  if (!state) return null
  const members = sanitizeMemberDrafts(state.members || [])
  return members.length ? { ...state, members } : null
}

export function boardRoleFromText(value: string): TMemberCreateInput['boardRole'] | null {
  const normalized = normalizeLookup(value)
  if (/vorsitz|1 vorstand|vorstandsvorsitz/.test(normalized)) return 'V1'
  if (/stellvertret|2 vorstand/.test(normalized)) return 'V2'
  if (/kassier|kassenwart|schatzmeister/.test(normalized)) return 'KASSIER'
  if (/schrift/.test(normalized)) return 'SCHRIFT'
  if (/kassenpruefer|kassenprufer/.test(normalized)) return 'KASSENPR1'
  return null
}

export function memberStatusFromText(value: string): TMemberUpdateInput['status'] | null {
  const normalized = normalizeLookup(value)
  if (/(aktiv|active)/.test(normalized) && !/(inaktiv|paus)/.test(normalized)) return 'ACTIVE'
  if (/(neu|new)/.test(normalized)) return 'NEW'
  if (/(paus|inaktiv|ruhend)/.test(normalized)) return 'PAUSED'
  if (/(ausgetreten|austritt|ausgeschieden|left)/.test(normalized)) return 'LEFT'
  return null
}

export function intervalLabel(value?: TMemberCreateInput['contribution_interval'] | null) {
  if (value === 'MONTHLY') return 'monatlich'
  if (value === 'QUARTERLY') return 'quartalsweise'
  if (value === 'YEARLY') return 'jährlich'
  return '-'
}

export function boardRoleLabel(value?: TMemberCreateInput['boardRole'] | null) {
  if (value === 'V1') return '1. Vorsitz'
  if (value === 'V2') return '2. Vorsitz'
  if (value === 'KASSIER') return 'Kassier'
  if (value === 'KASSENPR1') return '1. Kassenprüfer'
  if (value === 'KASSENPR2') return '2. Kassenprüfer'
  if (value === 'SCHRIFT') return 'Schriftführer'
  return '-'
}

export function memberStatusLabel(value?: TMemberUpdateInput['status'] | null) {
  if (value === 'ACTIVE') return 'Aktiv'
  if (value === 'NEW') return 'Neu'
  if (value === 'PAUSED') return 'Pausiert'
  if (value === 'LEFT') return 'Ausgetreten'
  return '-'
}

export function memberFieldLabel(field: AiMemberUpdateField) {
  const labels: Record<AiMemberUpdateField, string> = {
    memberNo: 'Mitgliedsnummer',
    name: 'Name',
    email: 'E-Mail',
    phone: 'Telefon',
    address: 'Adresse',
    status: 'Status',
    boardRole: 'Rolle',
    iban: 'IBAN',
    bic: 'BIC',
    contribution_amount: 'Beitrag',
    contribution_interval: 'Intervall',
    mandate_ref: 'Mandatsreferenz',
    mandate_date: 'Mandatsdatum',
    join_date: 'Eintritt',
    leave_date: 'Austritt',
    notes: 'Notizen',
    next_due_date: 'Nächste Frist'
  }
  return labels[field] || String(field)
}

export function displayMemberValue(field: AiMemberUpdateField, value: unknown) {
  if (value == null || value === '') return '-'
  if (field === 'contribution_amount') return euro.format(Number(value))
  if (field === 'contribution_interval')
    return intervalLabel(value as TMemberCreateInput['contribution_interval'])
  if (field === 'boardRole') return boardRoleLabel(value as TMemberCreateInput['boardRole'])
  if (field === 'status') return memberStatusLabel(value as TMemberUpdateInput['status'])
  if (
    field === 'join_date' ||
    field === 'leave_date' ||
    field === 'mandate_date' ||
    field === 'next_due_date'
  )
    return formatIsoDate(String(value))
  return String(value)
}

export function wantsMemberCreation(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(mitglied|mitglieder|mitgliedsanlage)/.test(normalized) &&
    /(anleg|anlage|erstell|aufnehm|importier|vorbereit|uebernehm|ubernehm)/.test(normalized)
  )
}

export function wantsCreatePendingMembers(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(leg|lege|anleg|speicher|erstell|uebernehm|ubernehm)/.test(normalized) &&
    /(diese|diesen|alle|drei|3|nur)/.test(normalized)
  )
}

export function wantsMemberRead(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(mitglied|mitglieder|vorstand|rolle|rollen|beitrag|beitraege|beitrage)/.test(normalized) &&
    /(zeig|zeige|liste|list|welche|wer|wie viele|ausles|uebersicht|ubersicht|status|haben wir)/.test(
      normalized
    )
  )
}

export function wantsMemberUpdate(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(mitglied|mitglieder|beitrag|beitraege|beitrage|rolle|vorstand|status|eintritt|austritt|zahlungsfrist|faelligkeit|falligkeit)/.test(
      normalized
    ) &&
    /(setz|setze|aender|ander|ändere|bearbeit|update|mach|stelle|korrigier|monatlich|jaehrlich|jahrlich|jährlich|paus|aktiv|ausgetreten|vorsitz|kassier)/.test(
      normalized
    )
  )
}

export function wantsContributionPaymentAction(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(mitgliedsbeitrag|beitrag|beitraege|beitrage|beitragszahlung|zahlung)/.test(normalized) &&
    /(buchung|buche|buchen|erstell|anleg|verbuch|verknuepf|verknupf|link|bezahlt|zahlungseingang)/.test(
      normalized
    )
  )
}

export function wantsContextualBookingLink(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(hierzu|dazu|dafuer|dafur|diese|den|das|offene|ausstehende)/.test(normalized) &&
    /(buchung|buche|buchen|erstell|anleg|verbuch|verknuepf|verknupf|link|bezahlt|zahlungseingang)/.test(
      normalized
    )
  )
}

export function wantsContributionDueRead(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(mitgliedsbeitrag|beitrag|beitraege|beitrage|beitragszahlung|beitragszahlungen|zahlung|zahlungen)/.test(
      normalized
    ) &&
    /(offen|aussteh|faellig|fallig|rueckstand|ruckstand|ueberfaellig|uberfallig|nicht bezahlt|noch|check|pruef|pruf|welche|wer|bei welchem)/.test(
      normalized
    )
  )
}

export function wantsApplyPendingMemberUpdates(prompt: string) {
  const normalized = normalizeLookup(prompt)
  return (
    /(uebernehm|ubernehm|anwenden|speicher|ausfuehr|ausfuhr|durchfuehr|durchfuhr|aendern|andern)/.test(
      normalized
    ) && /(diese|alle|vorschlaege|vorschlage|aenderungen|anderungen|so|passt)/.test(normalized)
  )
}

export function parseMemberDraftsFromText(prompt: string): AiMemberImportState | null {
  const contribution = parseContributionHint(prompt)
  const globalNextDue = (() => {
    const dueMatch = prompt.match(
      /(?:zahlungsfrist|fälligkeit|faelligkeit|frist)[^\n\r]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i
    )
    return dueMatch ? parseGermanDate(dueMatch[1]) : null
  })()
  const lines = prompt
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  const members: AiMemberDraft[] = []
  const pushDraft = (draft: AiMemberDraft) => {
    const key = normalizeLookup(`${draft.name}-${draft.joinDate}`)
    if (members.some((member) => normalizeLookup(`${member.name}-${member.joinDate}`) === key))
      return
    members.push(draft)
  }
  for (const line of lines) {
    const dates = Array.from(line.matchAll(/\b\d{1,2}\.\d{1,2}\.(?:20|19)\d{2}\b/g)).map(
      (match) => match[0]
    )
    if (!dates.length) continue
    const firstDateIndex = line.search(/\b\d{1,2}\.\d{1,2}\.(?:20|19)\d{2}\b/)
    const rawName = line
      .slice(0, firstDateIndex)
      .replace(/^[\d.)\-\s]+/, '')
      .replace(/[,;:]$/, '')
      .trim()
    const name = rawName || line.split(',')[0]?.trim()
    if (!name || !isLikelyMemberName(name)) continue
    const entryMatch = line.match(/eintritt[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i)
    const joinDate = parseGermanDate(entryMatch?.[1] || dates[1] || dates[0])
    if (!joinDate) continue
    pushDraft({
      name,
      birthDate: parseGermanDate(dates[0]),
      joinDate,
      boardRole: boardRoleFromText(line),
      contributionAmount: contribution.amount,
      contributionInterval: contribution.interval || undefined,
      nextDueDate: globalNextDue
    })
  }
  const blocks: Array<{ name: string; lines: string[] }> = []
  let currentBlock: { name: string; lines: string[] } | null = null
  for (const line of lines) {
    const heading = line.match(/^\s*\d+[).]\s*([A-ZÄÖÜ][A-Za-zÄÖÜäöüß' -]+)$/)
    if (heading) {
      if (currentBlock) blocks.push(currentBlock)
      currentBlock = { name: heading[1].trim(), lines: [line] }
    } else if (currentBlock) {
      currentBlock.lines.push(line)
    }
  }
  if (currentBlock) blocks.push(currentBlock)
  for (const block of blocks) {
    if (!isLikelyMemberName(block.name)) continue
    const text = block.lines.join('\n')
    const birthDate = parseGermanDate(
      text.match(/geburtsdatum[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i)?.[1] || ''
    )
    const joinDate = parseGermanDate(
      text.match(/eintritt[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i)?.[1] || ''
    )
    if (!joinDate) continue
    const blockContribution = parseContributionHint(text)
    const blockDue =
      parseGermanDate(
        text.match(
          /(?:zahlungsfrist|beitragspflicht|fälligkeit|faelligkeit)[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i
        )?.[1] || ''
      ) || globalNextDue
    pushDraft({
      name: block.name,
      birthDate,
      joinDate,
      boardRole: boardRoleFromText(text),
      contributionAmount: blockContribution.amount ?? contribution.amount,
      contributionInterval: blockContribution.interval || contribution.interval || undefined,
      nextDueDate: blockDue
    })
  }
  const sanitized = sanitizeMemberDrafts(members)
  return sanitized.length ? { members: sanitized, sourcePrompt: prompt, status: 'DRAFT' } : null
}

export function filterMembersForPrompt(prompt: string, members: MemberRow[]) {
  const normalized = normalizeLookup(prompt)
  const activeRows = members.filter((member) => member.status !== 'LEFT')
  const strictlyActiveRows = members.filter((member) => member.status === 'ACTIVE')
  const batchAll = /(alle|allen|jede|jeden|saemtliche|samtliche)/.test(normalized)
  const withoutContribution = /(ohne beitrag|beitrag fehlt|fehlender beitrag|keinen beitrag)/.test(
    normalized
  )
  if (batchAll) {
    const base = /(aktive|aktiven|active)/.test(normalized)
      ? strictlyActiveRows
      : /(ausgetreten|inklusive ausgetreten|alle status)/.test(normalized)
        ? members
        : activeRows
    return withoutContribution ? base.filter((member) => !member.contribution_amount) : base
  }

  const named = activeRows.filter((member) => {
    const memberName = normalizeLookup(member.name)
    if (memberName && normalized.includes(memberName)) return true
    const parts = memberName.split(' ').filter((part) => part.length >= 3)
    return parts.length >= 2 && parts.every((part) => normalized.includes(part))
  })
  const uniquePartial = named.length
    ? []
    : activeRows.filter((member) => {
        const parts = normalizeLookup(member.name)
          .split(' ')
          .filter((part) => part.length >= 4)
        return parts.some((part) => normalized.includes(part))
      })
  const selected = named.length ? named : uniquePartial.length === 1 ? uniquePartial : []
  return withoutContribution ? selected.filter((member) => !member.contribution_amount) : selected
}

export function addMemberUpdateChange(
  changes: AiMemberUpdateChange[],
  member: MemberRow,
  field: AiMemberUpdateField,
  newValue: TMemberUpdateInput[AiMemberUpdateField] | null | undefined
) {
  const oldValue = member[field as keyof MemberRow] as
    | TMemberUpdateInput[AiMemberUpdateField]
    | null
    | undefined
  const oldDisplay = displayMemberValue(field, oldValue)
  const newDisplay = displayMemberValue(field, newValue)
  if (oldDisplay === newDisplay) return
  changes.push({
    id: `${member.id}-${field}-${changes.length}`,
    memberId: member.id,
    memberName: member.name,
    field,
    label: memberFieldLabel(field),
    oldValue,
    newValue,
    oldDisplay,
    newDisplay,
    selected: true
  })
}

export function buildMemberUpdateDraft(prompt: string, members: MemberRow[]): AiMemberUpdateState | null {
  const normalized = normalizeLookup(prompt)
  const targets = filterMembersForPrompt(prompt, members)
  if (!targets.length) return null
  const contribution = parseContributionHint(prompt)
  const role = boardRoleFromText(prompt)
  const status = memberStatusFromText(prompt)
  const joinDate = parseGermanDate(
    prompt.match(/eintritt[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i)?.[1] || ''
  )
  const leaveDate = parseGermanDate(
    prompt.match(/austritt[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i)?.[1] || ''
  )
  const nextDue = parseGermanDate(
    prompt.match(
      /(?:zahlungsfrist|beitragspflicht|fälligkeit|faelligkeit|frist)[^\d]*(\d{1,2}\.\d{1,2}\.(?:20|19)\d{2})/i
    )?.[1] || ''
  )
  const changes: AiMemberUpdateChange[] = []
  if (role && targets.length === 1) {
    const currentRoleHolder = members.find(
      (member) => member.boardRole === role && member.id !== targets[0].id
    )
    if (currentRoleHolder) addMemberUpdateChange(changes, currentRoleHolder, 'boardRole', null)
  }

  for (const member of targets) {
    if (contribution.amount != null)
      addMemberUpdateChange(changes, member, 'contribution_amount', contribution.amount)
    if (contribution.interval)
      addMemberUpdateChange(changes, member, 'contribution_interval', contribution.interval)
    if (
      role &&
      targets.length === 1 &&
      !/(alle|allen|jede|jeden|saemtliche|samtliche)/.test(normalized)
    )
      addMemberUpdateChange(changes, member, 'boardRole', role)
    if (status) addMemberUpdateChange(changes, member, 'status', status)
    if (joinDate) addMemberUpdateChange(changes, member, 'join_date', joinDate)
    if (leaveDate) addMemberUpdateChange(changes, member, 'leave_date', leaveDate)
    if (nextDue) addMemberUpdateChange(changes, member, 'next_due_date', nextDue)
  }

  return changes.length ? { changes, sourcePrompt: prompt, status: 'DRAFT' } : null
}

export function findPaymentAccountHint(prompt: string, accounts: PaymentAccountOption[]) {
  const normalizedPrompt = normalizeLookup(prompt)
  if (!normalizedPrompt) return null
  const genericTokens = new Set([
    'bank',
    'konto',
    'konten',
    'kasse',
    'cash',
    'paypal',
    'card',
    'karte'
  ])
  return (
    accounts
      .filter((account) => account.isActive !== 0)
      .map((account) => {
        const normalizedName = normalizeLookup(account.name)
        const tokens = normalizedName
          .split(' ')
          .filter((token) => token.length >= 4 && !genericTokens.has(token))
        let score = 0
        if (normalizedName && normalizedPrompt.includes(normalizedName))
          score += 1000 + normalizedName.length
        for (const token of tokens) {
          if (normalizedPrompt.includes(token)) score += token.length
        }
        return { account, normalizedName, score }
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || b.normalizedName.length - a.normalizedName.length)[0]
      ?.account || null
  )
}

export function shouldApplyAccountHintToAll(prompt: string) {
  return /(alle|allen|jede|jeden|saemtliche|samtliche|immer|standard|default|grundsaetzlich|grundsatzlich|nicht anders angegeben|gehen diese auf|sollen auf|soll bei allen)/.test(
    normalizeLookup(prompt)
  )
}
