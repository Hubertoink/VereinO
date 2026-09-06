import type { AiInvoiceActionChange } from './AgentInvoiceActionCard'
import type { TAiAgentRunOutput, TInvoiceCreateInput } from '../../../../electron/main/ipc/schemas'
import type {
  AiBankLinkChange,
  AiBudgetActionChange,
  AiContributionLinkChange,
  AiEarmarkActionChange,
  AiMemberUpdateChange,
  AiPartyActionChange,
  AiRecurringBookingOccurrence,
  AiTagActionChange,
  AiVoucherTagActionChange
} from './aiViewTypes'
import type { AiVoucherUpdateChange } from './AgentVoucherUpdateCard'

type Setter = (value: any) => void
type Message = { role: 'assistant'; title: string; body: string; meta?: string; filePath?: string }

type Input = {
  draft: TAiAgentRunOutput['drafts'][number]
  userPrompt: string
  pushMessage: (message: Message) => void
  setPendingRecurringBooking: Setter
  setPendingVoucherReverse: Setter
  setPendingVoucherRebook: Setter
  setPendingBankLinks: Setter
  setPendingVoucherUpdates: Setter
  setPendingMemberUpdates: Setter
  setPendingContributionLinks: Setter
  setPendingInvoiceActions: Setter
  setPendingTagActions: Setter
  setPendingPartyActions: Setter
  setPendingBudgetActions: Setter
  setPendingEarmarkActions: Setter
}

/** Maps a runtime-agent draft to the review state rendered by the chat. */
export function prepareAiAgentDraft({ draft, userPrompt, pushMessage, ...setters }: Input) {
  const payload = draft.payload as any
  const autoMeta = draft.autoApproval
    ? ` · Auto-Regel: ${draft.autoApproval.ruleNames.join(', ')}`
    : ''
  const reviewMessage = (title: string, body: string) =>
    pushMessage({ role: 'assistant', title, body, meta: `Agent-Review${autoMeta}` })

  if (draft.kind === 'recurringBooking') {
    const occurrences = (payload?.occurrences || []) as AiRecurringBookingOccurrence[]
    if (!payload?.recurringBookingId || !occurrences.length) return
    setters.setPendingRecurringBooking({
      recurringBookingId: Number(payload.recurringBookingId),
      recurringBookingName: String(payload.recurringBookingName || draft.title),
      type: payload.type === 'IN' ? 'IN' : 'OUT',
      amountMode: payload.amountMode === 'NET' ? 'NET' : 'GROSS',
      amount: Number(payload.amount || 0),
      vatRate: Number(payload.vatRate || 0),
      paymentAccountId: payload.paymentAccountId ?? null,
      paymentAccountName: payload.paymentAccountName || null,
      bookingDate: typeof payload.bookingDate === 'string' ? payload.bookingDate : null,
      occurrences: occurrences.map((occurrence) => ({
        occurrenceId: Number(occurrence.occurrenceId),
        scheduledDate: occurrence.scheduledDate,
        amount: Number(occurrence.amount || payload.amount || 0),
        grossAmount: Number(occurrence.grossAmount || occurrence.amount || payload.amount || 0),
        booked: false,
        error: null
      })),
      totalAmount: Number(payload.totalAmount || 0),
      reason: payload.reason || draft.title,
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    })
    reviewMessage(
      'Dauerbuchungen vorbereitet',
      `${occurrences.length} fällige Ausführung(en) wurden als Sammel-Review vorbereitet. Nach einer Bestätigung wird je Fälligkeit ein eigener Beleg erstellt.`
    )
    return
  }
  if (draft.kind === 'voucherReverse') {
    const vouchers = payload?.vouchers || []
    if (!vouchers.length) return
    setters.setPendingVoucherReverse({
      vouchers,
      reason: payload?.reason || draft.title,
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    })
    reviewMessage(
      'Storno-Review vorbereitet',
      `${vouchers.length} Buchung(en) wurden zum Stornieren vorbereitet. Bitte prüfe die Storno-Vorschau unten.`
    )
    return
  }
  if (draft.kind === 'voucherRebook') {
    if (!payload?.original || !payload?.replacement) return
    setters.setPendingVoucherRebook({
      original: payload.original,
      replacement: payload.replacement,
      reason: payload.reason || draft.title,
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    })
    reviewMessage(
      'Storno & Ersatzbuchung vorbereitet',
      `Ich habe einen Review vorbereitet: Beleg ${payload.original.voucherNo || `#${payload.original.id}`} wird storniert und als ${payload.replacement.type} neu angelegt.`
    )
    return
  }
  if (draft.kind === 'bankLink') {
    const changes = (payload?.changes || []) as AiBankLinkChange[]
    if (!changes.length) return
    setters.setPendingBankLinks({
      changes: changes.map((change) => ({ ...change, selected: change.selected !== false })),
      reason: payload?.reason || draft.title,
      warnings: payload?.warnings || [],
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    })
    reviewMessage(
      'Bankbeleg-Zuordnung vorbereitet',
      `${changes.length} Bankbeleg(e) werden mit bestehenden Buchungen oder passenden Dauerbuchungen zusammengeführt. Es wird nichts storniert.`
    )
    return
  }
  if (draft.kind === 'voucherUpdate') {
    const changes = (payload?.changes || []) as AiVoucherUpdateChange[]
    if (!changes.length) return
    setters.setPendingVoucherUpdates({
      changes: changes.map((change) => ({ ...change, selected: change.selected !== false })),
      reason: payload?.reason || draft.title,
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    })
    reviewMessage(
      'Buchungsänderungen vorbereitet',
      `${changes.length} Änderung(en) wurden als Review vorbereitet. Bitte prüfe die Vorschau unten und übernimm sie erst danach.`
    )
    return
  }
  if (draft.kind === 'memberUpdate') {
    const changes = (payload?.changes || []) as AiMemberUpdateChange[]
    if (!changes.length) return
    setters.setPendingMemberUpdates({
      changes: changes.map((change) => ({ ...change, selected: change.selected !== false })),
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    })
    reviewMessage(
      'Mitgliederänderungen vorbereitet',
      `${changes.length} Mitgliederänderung(en) wurden als Review vorbereitet.`
    )
    return
  }
  if (draft.kind === 'contributionPaymentLink') {
    const changes = (payload?.changes || []) as AiContributionLinkChange[]
    if (!changes.length) return
    setters.setPendingContributionLinks({
      changes: changes.map((change) => ({
        ...change,
        selected: change.selected !== false,
        warnings: change.warnings || []
      })),
      reason: payload?.reason || draft.title,
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    })
    reviewMessage(
      'Beitrags-Verknüpfung vorbereitet',
      `${changes.length} vorhandene Buchung(en) wurden zur Verknüpfung mit Mitgliedsbeiträgen vorbereitet. Bitte prüfe die Vorschau unten.`
    )
    return
  }
  if (draft.kind === 'invoiceAction') {
    const rawChanges = Array.isArray(payload?.changes)
      ? payload.changes
      : payload?.invoice
        ? [{ action: payload.action || 'CREATE', invoice: payload.invoice }]
        : []
    const changes: AiInvoiceActionChange[] = rawChanges
      .filter((change: any) => change?.action === 'CREATE' && change?.invoice)
      .map((change: any, index: number) => ({
        id: change.id || `invoice-action-${Date.now()}-${index}`,
        action: 'CREATE',
        invoice: change.invoice as TInvoiceCreateInput,
        selected: change.selected !== false
      }))
    if (!changes.length) return
    setters.setPendingInvoiceActions({
      changes,
      reason: payload?.reason || draft.title,
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    })
    reviewMessage(
      'Forderung/Verbindlichkeit vorbereitet',
      `${changes.length} offene(r) Posten wurde als Review vorbereitet. Bitte prüfe die Vorschau unten.`
    )
    return
  }
  const typedDrafts: Record<
    string,
    {
      changes: any[]
      set: Setter
      title: string
      body: (count: number) => string
      reason?: boolean
    }
  > = {
    tagChange: {
      changes: payload?.changes || [],
      set: setters.setPendingTagActions,
      title: 'Tag-Änderungen vorbereitet',
      body: (count) => `${count} Tag-Änderung(en) wurden als Review vorbereitet.`
    },
    partyChange: {
      changes: payload?.changes || [],
      set: setters.setPendingPartyActions,
      title: 'Geschäftspartner vorbereitet',
      body: (count) =>
        `${count} Geschäftspartner-Änderung(en) wurden als Review vorbereitet. Bitte prüfe die Vorschau unten.`,
      reason: true
    },
    budgetChange: {
      changes: payload?.changes || [],
      set: setters.setPendingBudgetActions,
      title: 'Budget-Änderungen vorbereitet',
      body: (count) =>
        `${count} Budget-Änderung(en) wurden als Review vorbereitet. Bitte prüfe die Vorschau unten.`,
      reason: true
    },
    earmarkChange: {
      changes: payload?.changes || [],
      set: setters.setPendingEarmarkActions,
      title: 'Zweckbindungs-Änderungen vorbereitet',
      body: (count) =>
        `${count} Zweckbindungs-Änderung(en) wurden als Review vorbereitet. Bitte prüfe die Vorschau unten.`,
      reason: true
    }
  }
  const typed = typedDrafts[draft.kind]
  if (typed) {
    const changes = typed.changes as Array<
      | AiTagActionChange
      | AiPartyActionChange
      | AiBudgetActionChange
      | AiEarmarkActionChange
      | AiVoucherTagActionChange
    >
    if (!changes.length) return
    typed.set({
      changes: changes.map((change) => ({ ...change, selected: change.selected !== false })),
      ...(typed.reason ? { reason: payload?.reason || draft.title } : {}),
      sourcePrompt: userPrompt,
      status: 'DRAFT'
    })
    reviewMessage(typed.title, typed.body(changes.length))
    return
  }
  if (draft.kind === 'reportExport') {
    if (!payload?.filePath) return
    const isContentPdf = payload?.type === 'CONTENT'
    pushMessage({
      role: 'assistant',
      title: isContentPdf ? 'PDF erstellt' : 'Report exportiert',
      body: [
        `${draft.title} wurde erstellt.`,
        !isContentPdf && payload.rowCount != null
          ? `${payload.rowCount} Buchung(en) im Export.`
          : null,
        payload.filePath
      ]
        .filter(Boolean)
        .join('\n'),
      meta: 'Agent-Export',
      filePath: payload.filePath
    })
    return
  }
  reviewMessage(
    'Agent-Draft vorbereitet',
    `Der Agent hat einen ${draft.kind}-Draft vorbereitet: ${draft.title}. Für diese Draft-Art fehlt noch eine spezialisierte Review-Karte.`
  )
}
