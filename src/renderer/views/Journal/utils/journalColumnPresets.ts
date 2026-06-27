import { DEFAULT_ORDER, type ColKey } from '../types'
import { getEffectiveJournalCols, getEffectiveJournalOrder } from './journalColumnVisibility'

export type JournalColumnPreset = {
    cols: Record<ColKey, boolean>
    order: ColKey[]
}

export function getStandardJournalColumnPreset(allowVoucherDeletion: boolean): JournalColumnPreset {
    const cols: Record<ColKey, boolean> = {
        actions: allowVoucherDeletion,
        date: true,
        voucherNo: false,
        type: true,
        sphere: true,
        description: true,
        note: true,
        earmark: true,
        budget: true,
        paymentMethod: true,
        attachments: true,
        net: false,
        vat: false,
        gross: true
    }
    const order: ColKey[] = [
        'actions',
        'date',
        'type',
        'sphere',
        'description',
        'note',
        'earmark',
        'budget',
        'paymentMethod',
        'attachments',
        'gross',
        'voucherNo',
        'net',
        'vat'
    ]

    return {
        cols: getEffectiveJournalCols(cols, allowVoucherDeletion),
        order: getEffectiveJournalOrder(order, allowVoucherDeletion)
    }
}

export function getMinimalJournalColumnPreset(allowVoucherDeletion: boolean): JournalColumnPreset {
    const cols: Record<ColKey, boolean> = {
        actions: allowVoucherDeletion,
        date: true,
        voucherNo: false,
        type: false,
        sphere: false,
        description: true,
        note: false,
        earmark: false,
        budget: false,
        paymentMethod: false,
        attachments: false,
        net: false,
        vat: false,
        gross: true
    }
    const order: ColKey[] = allowVoucherDeletion
        ? ['actions', 'date', 'description', 'note', 'gross', 'voucherNo', 'type', 'sphere', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat']
        : ['date', 'description', 'note', 'gross', 'voucherNo', 'type', 'sphere', 'earmark', 'budget', 'paymentMethod', 'attachments', 'net', 'vat']

    return {
        cols: getEffectiveJournalCols(cols, allowVoucherDeletion),
        order: getEffectiveJournalOrder(order, allowVoucherDeletion)
    }
}

export function getDetailsJournalColumnPreset(allowVoucherDeletion: boolean): JournalColumnPreset {
    const cols: Record<ColKey, boolean> = {
        actions: allowVoucherDeletion,
        date: true,
        voucherNo: true,
        type: true,
        sphere: true,
        description: true,
        note: true,
        earmark: true,
        budget: true,
        paymentMethod: true,
        attachments: true,
        net: true,
        vat: true,
        gross: true
    }

    return {
        cols: getEffectiveJournalCols(cols, allowVoucherDeletion),
        order: getEffectiveJournalOrder(
            allowVoucherDeletion ? DEFAULT_ORDER : DEFAULT_ORDER.filter((key) => key !== 'actions'),
            allowVoucherDeletion
        )
    }
}
