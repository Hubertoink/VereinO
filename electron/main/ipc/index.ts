import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import { VoucherCreateInput, VoucherCreateOutput, VoucherReverseInput, VoucherReverseOutput, ReportsExportInput, ReportsExportOutput, FiscalReportInput, FiscalReportOutput, VouchersListInput, VouchersListOutput, VoucherUpdateInput, VoucherMetaUpdateInput, VoucherUpdateOutput, VoucherDeleteInput, VoucherDeleteOutput, ReportsSummaryInput, ReportsSummaryOutput, ReportsMonthlyInput, ReportsMonthlyOutput, ReportsCashBalanceInput, ReportsCashBalanceOutput, BindingUpsertInput, BindingUpsertOutput, BindingListInput, BindingListOutput, BindingDeleteInput, BindingDeleteOutput, BindingUsageInput, BindingUsageOutput, BudgetUpsertInput, BudgetUpsertOutput, BudgetListInput, BudgetListOutput, BudgetDeleteInput, BudgetDeleteOutput, QuoteWeeklyInput, QuoteWeeklyOutput, ImportPreviewInput, ImportPreviewOutput, ImportExecuteInput, ImportExecuteOutput, ImportAnalyzeInput, ImportAnalyzeOutput, ImportCommitDraftInput, ImportCreateMissingInput, ImportCreateMissingOutput, ImportTemplateInput, ImportTemplateOutput, ImportTestDataInput, ImportTestDataOutput, ImportEditableExportInput, ImportEditableExportOutput, AttachmentsListInput, AttachmentsListOutput, AttachmentOpenInput, AttachmentOpenOutput, AttachmentSaveAsInput, AttachmentSaveAsOutput, AttachmentReadInput, AttachmentReadOutput, AttachmentAddInput, AttachmentAddOutput, AttachmentDeleteInput, AttachmentDeleteOutput, VouchersClearAllInput, VouchersClearAllOutput, TagsListInput, TagsListOutput, TagUpsertInput, TagUpsertOutput, TagDeleteInput, TagDeleteOutput, TagUsageInput, TagUsageOutput, ReportsYearsOutput, BudgetUsageInput, BudgetUsageOutput, SettingsGetInput, SettingsGetOutput, SettingsSetInput, SettingsSetOutput, VouchersRecentInput, VouchersRecentOutput, VouchersBatchAssignEarmarkInput, VouchersBatchAssignEarmarkOutput, VouchersBatchAssignBudgetInput, VouchersBatchAssignBudgetOutput, VouchersBatchAssignTagsInput, VouchersBatchAssignTagsOutput, InvoiceCreateInput, InvoiceCreateOutput, InvoiceUpdateInput, InvoiceUpdateOutput, InvoiceDeleteInput, InvoiceDeleteOutput, InvoicesListInput, InvoicesListOutput, InvoiceByIdInput, InvoiceByIdOutput, InvoiceAddPaymentInput, InvoiceAddPaymentOutput, InvoicePostToVoucherInput, InvoicePostToVoucherOutput, InvoiceFilesListInput, InvoiceFilesListOutput, InvoiceFileAddInput, InvoiceFileAddOutput, InvoiceFileDeleteInput, InvoiceFileDeleteOutput, YearEndPreviewInput, YearEndPreviewOutput, YearEndExportInput, YearEndExportOutput, YearEndCloseInput, YearEndCloseOutput, YearEndReopenInput, YearEndStatusOutput, InvoicesSummaryInput, InvoicesSummaryOutput, MembersListInput, MembersListOutput, MemberCreateInput, MemberCreateOutput, MemberUpdateInput, MemberUpdateOutput, MemberDeleteInput, MemberDeleteOutput, MemberGetInput, MemberGetOutput, PaymentsListDueInput, PaymentsListDueOutput, PaymentsMarkPaidInput, PaymentsMarkPaidOutput, PaymentsUnmarkInput, PaymentsUnmarkOutput, PaymentsSuggestVouchersInput, PaymentsSuggestVouchersOutput, TaxExemptionGetOutput, TaxExemptionSaveInput, TaxExemptionSaveOutput, TaxExemptionDeleteOutput, TaxExemptionUpdateValidityInput, TaxExemptionUpdateValidityOutput, SubmissionsListInput, SubmissionsListOutput, SubmissionGetInput, SubmissionGetOutput, SubmissionsImportInput, SubmissionsImportOutput, SubmissionApproveInput, SubmissionApproveOutput, SubmissionRejectInput, SubmissionRejectOutput, SubmissionDeleteInput, SubmissionDeleteOutput, SubmissionConvertInput, SubmissionConvertOutput, SubmissionsSummaryOutput, SubmissionAttachmentReadInput, SubmissionAttachmentReadOutput, SubmissionsExportCatalogOutput, DonationsExportMoneyReceiptInput, DonationsExportMoneyReceiptOutput, CashChecksListInput, CashChecksListOutput, CashChecksCreateInput, CashChecksCreateOutput, CashChecksSetInspectorsInput, CashChecksSetInspectorsOutput, CashChecksExportPdfInput, CashChecksExportPdfOutput, CashChecksGetInspectorDefaultsOutput } from './schemas'
import { getDb, getAppDataDir, closeDb, getCurrentDbInfo, migrateToRoot, readAppConfig, writeAppConfig, listOrganizations, getActiveOrganization, createOrganization, switchOrganization, renameOrganization, deleteOrganization, getOrganizationAppearance, setOrganizationAppearance, getActiveOrganizationAppearance } from '../db/database'
import { getDefaultDbInfo, inspectBackupDetailed } from '../services/backup'
import { createVoucher, reverseVoucher, listRecentVouchers, listVouchersFiltered, listVouchersAdvanced, listVouchersAdvancedPaged, updateVoucher, updateVoucherMeta, deleteVoucher, summarizeVouchers, monthlyVouchers, dailyVouchers, cashBalance, listFilesForVoucher, getFileById, addFileToVoucher, deleteVoucherFile, clearAllVouchers, listVoucherYears, batchAssignEarmark, batchAssignBudget, batchAssignTags, getVoucherBudgets, getVoucherEarmarks, setVoucherBudgets, setVoucherEarmarks } from '../repositories/vouchers'
import { createInvoice, updateInvoice, deleteInvoice, listInvoicesPaged, summarizeInvoices, getInvoiceById, addPayment, markPaid, postInvoiceToVoucher, getInvoiceFileById, listFilesForInvoice, addFileToInvoice, deleteInvoiceFile } from '../repositories/invoices'
import { listTags, upsertTag, deleteTag, tagUsage } from '../repositories/tags'
import { listMembers, createMember, updateMember, deleteMember, getMemberById } from '../repositories/members'
import { exportMembers, MembersExportOptions } from '../services/membersExport'
import { listBindings, upsertBinding, deleteBinding, bindingUsage } from '../repositories/bindings'
import { upsertBudget, listBudgets, deleteBudget, budgetUsage } from '../repositories/budgets'
import { listAdvances, createAdvance, getAdvanceById, settleAdvance, deleteAdvance, addAdvancePurchase, deleteAdvancePurchase, updateAdvancePurchase, resolveAdvance } from '../repositories/advances'
import { listCashChecks, createCashCheck, setCashCheckInspectors, getCashCheckInspectorDefaults } from '../repositories/cashChecks'
import { generateCashCheckPDF } from '../services/cashCheckReport'
import { createSubmissionsRepository } from '../repositories/submissions'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getSetting, setSetting } from '../services/settings'
import { getTaxExemptionCertificate, saveTaxExemptionCertificate, deleteTaxExemptionCertificate, updateTaxExemptionValidity } from '../services/taxExemption'
import ExcelJS from 'exceljs'
import { getWeeklyQuote } from '../services/quotes'
import { voucherStatusKind, voucherStatusText } from '../services/voucherStatus'
import { previewFile, executeFile, analyzeFile, commitImportDraft, createMissingImportMasterData, generateImportTemplate, generateImportTestData, exportEditableVouchersWorkbook } from '../services/imports'
import { DbExportInput, DbExportOutput, DbImportInput, DbImportOutput, DbImportFromPathInput, DbImportFromPathOutput } from './schemas'
import { PaymentAccountsListInput, PaymentAccountsListOutput, PaymentAccountUpsertInput, PaymentAccountUpsertOutput, PaymentAccountDeleteInput, PaymentAccountDeleteOutput } from './schemas'
import { applyMigrations, ensureAdvanceTables, ensureVoucherColumns, ensureVoucherForeignKeyTargets } from '../db/migrations'
import { listRecentAudit } from '../repositories/audit'
import { AuditRecentInput, AuditRecentOutput, DbSmartRestorePreviewOutput, DbSmartRestoreApplyInput, DbSmartRestoreApplyOutput } from './schemas'
import * as yearEnd from '../services/yearEnd'
import * as backup from '../services/backup'
import * as mp from '../repositories/members_payments'
import { exportMoneyDonationReceiptPdf } from '../services/donationReceipt'
import { AdvancesListInput, AdvancesListOutput, AdvanceCreateInput, AdvanceCreateOutput, AdvanceGetInput, AdvanceGetOutput, AdvanceSettleInput, AdvanceSettleOutput, AdvanceDeleteInput, AdvanceDeleteOutput, AdvancePurchaseCreateInput, AdvancePurchaseCreateOutput, AdvancePurchaseDeleteInput, AdvancePurchaseDeleteOutput, AdvancePurchaseUpdateInput, AdvancePurchaseUpdateOutput, AdvanceResolveInput, AdvanceResolveOutput } from './schemas'
import { ActivityReportDeleteInput, ActivityReportDeleteOutput, ActivityReportGetInput, ActivityReportGetOutput, ActivityReportListInput, ActivityReportListOutput, ActivityReportSaveInput, ActivityReportSaveOutput } from './schemas'
import { deleteActivityReport, getActivityReport, listActivityReports, saveActivityReport, validateActivityReport } from '../repositories/activityReports'
import { checkForAppUpdates, downloadAppUpdate, getUpdateState, installAppUpdate } from '../updateManager'
import { deletePaymentAccount, listPaymentAccounts, upsertPaymentAccount } from '../repositories/paymentAccounts'

function isMissingSchemaError(error: unknown, identifiers: string[]): boolean {
    const message = String((error as any)?.message ?? '')
    if (message.includes('no such table:')) {
        return identifiers.some((identifier) => message.includes(`no such table: ${identifier}`))
    }
    if (message.includes('no such column:')) {
        return identifiers.some((identifier) => {
            const bareIdentifier = identifier.includes('.') ? identifier.split('.').pop() ?? identifier : identifier
            return message.includes(`no such column: ${identifier}`)
                || message.includes(`no such column: ${bareIdentifier}`)
                || message.includes(`no such column: v.${bareIdentifier}`)
        })
    }
    return false
}

async function withSchemaHealRetry<T>(run: () => T, schemaIdentifiers: string[]): Promise<T> {
    try {
        return run()
    } catch (error) {
        if (!isMissingSchemaError(error, schemaIdentifiers)) throw error
        try {
            const db = getDb()
            ensureVoucherColumns(db as any)
            ensureAdvanceTables(db as any)
            applyMigrations(db as any)
        } catch {
        }

        try {
            return run()
        } catch (retryError) {
            if (isMissingSchemaError(retryError, schemaIdentifiers)) {
                throw new Error('Die Datenbankstruktur war unvollständig und konnte nicht automatisch repariert werden. Bitte App neu starten und erneut versuchen.')
            }
            throw retryError
        }
    }
}

type RegisterIpcHandlersOptions = {
    openDetachedQuickAdd?: (initialState?: any) => Promise<{ ok: boolean; token: string }>
    focusDetachedQuickAdd?: (draftId: string) => { ok: boolean }
    closeDetachedQuickAdd?: (draftId: string) => { ok: boolean }
    hasDetachedQuickAdds?: () => boolean
    requestCloseDetachedQuickAdds?: (mainWindow?: BrowserWindow | null, confirmed?: boolean) => { ok: boolean; count: number }
    cancelPendingMainClose?: () => { ok: boolean }
    getDetachedQuickAddInitial?: (token: string) => any
    notifyQuickAddSaved?: (payload?: any) => void
}

export function registerIpcHandlers(options: RegisterIpcHandlersOptions = {}) {
    const getCurrentWindow = () => BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null

    // App info
    ipcMain.handle('app.version', async () => {
        try { return { version: app.getVersion(), name: app.getName() } } catch { return { version: '0.0.0', name: 'VereinO' } }
    })
    ipcMain.handle('updates.getState', async () => getUpdateState())
    ipcMain.handle('updates.check', async () => checkForAppUpdates())
    ipcMain.handle('updates.download', async () => downloadAppUpdate())
    ipcMain.handle('updates.install', async () => installAppUpdate())
    // Window controls (frameless)
    ipcMain.handle('window.minimize', async () => {
        const win = getCurrentWindow()
        win?.minimize()
        return { ok: true }
    })
    ipcMain.handle('window.toggleMaximize', async () => {
        const win = getCurrentWindow()
        if (win) {
            if (win.isMaximized()) win.unmaximize(); else win.maximize()
            return { ok: true, isMaximized: win.isMaximized() }
        }
        return { ok: false }
    })
    ipcMain.handle('window.close', async () => {
        const win = getCurrentWindow()
        win?.close()
        return { ok: true }
    })
    ipcMain.handle('window.confirmClose', async () => {
        const win = getCurrentWindow()
        if (!win) return { ok: false }
        if (!(win as any).__isDetachedQuickAddWindow && options.hasDetachedQuickAdds?.()) {
            const requested = options.requestCloseDetachedQuickAdds?.(win, true)
            if (requested?.count) return { ok: true, pendingDetached: requested.count }
        }
        try {
            ;(win as any).__allowRendererClose?.()
        } catch {
        }
        win.close()
        return { ok: true }
    })
    ipcMain.handle('window.cancelClose', async () => {
        return options.cancelPendingMainClose?.() ?? { ok: true }
    })
    ipcMain.handle('window.isMaximized', async () => {
        const win = getCurrentWindow()
        return { isMaximized: !!win?.isMaximized() }
    })
    ipcMain.handle('quickAdd.openDetached', async (_e, payload) => {
        if (!options.openDetachedQuickAdd) return { ok: false, error: 'Abdocken ist nicht verfügbar.' }
        return options.openDetachedQuickAdd(payload || null)
    })
    ipcMain.handle('quickAdd.detachedInitial', async (_e, payload: { token?: string }) => {
        const token = String(payload?.token || '')
        return { initial: token && options.getDetachedQuickAddInitial ? options.getDetachedQuickAddInitial(token) : null }
    })
    ipcMain.handle('quickAdd.focusDetached', async (_e, payload: { draftId?: string }) => {
        const draftId = String(payload?.draftId || '')
        return draftId && options.focusDetachedQuickAdd ? options.focusDetachedQuickAdd(draftId) : { ok: false }
    })
    ipcMain.handle('quickAdd.closeDetached', async (_e, payload: { draftId?: string }) => {
        const draftId = String(payload?.draftId || '')
        return draftId && options.closeDetachedQuickAdd ? options.closeDetachedQuickAdd(draftId) : { ok: false }
    })
    ipcMain.handle('quickAdd.notifySaved', async (_e, payload) => {
        try { options.notifyQuickAddSaved?.(payload || {}) } catch { }
        return { ok: true }
    })
    ipcMain.handle('quickAdd.syncDraft', async (_e, payload) => {
        for (const win of BrowserWindow.getAllWindows()) {
            try { win.webContents.send('quickAdd:detachedDraftSync', payload || {}) } catch { }
        }
        return { ok: true }
    })
    ipcMain.handle('vouchers.create', async (_e, payload) => {
        const parsed = VoucherCreateInput.parse(payload)
        const res = createVoucher(parsed)
        return VoucherCreateOutput.parse(res)
    })

    ipcMain.handle('vouchers.reverse', async (_e, payload) => {
        const parsed = VoucherReverseInput.parse(payload)
        const res = reverseVoucher(parsed.originalId, null)
        return VoucherReverseOutput.parse(res)
    })

    ipcMain.handle('reports.summary', async (_e, payload) => {
        const parsed = ReportsSummaryInput.parse(payload)
        const summary = summarizeVouchers({
            paymentMethod: parsed.paymentMethod as any,
            paymentAccountId: parsed.paymentAccountId ?? undefined,
            sphere: parsed.sphere as any,
            type: parsed.type as any,
            from: parsed.from,
            to: parsed.to,
            // extend filters with optional earmarkId
            ...(parsed.earmarkId != null ? { earmarkId: parsed.earmarkId } as any : {}),
            ...(parsed.budgetId != null ? { budgetId: parsed.budgetId } as any : {}),
            q: (parsed as any).q,
            tag: (parsed as any).tag
        } as any)
        return ReportsSummaryOutput.parse(summary)
    })

    ipcMain.handle('reports.monthly', async (_e, payload) => {
        const parsed = ReportsMonthlyInput.parse(payload)
        const buckets = monthlyVouchers({
            from: parsed.from,
            to: parsed.to,
            paymentMethod: parsed.paymentMethod as any,
            sphere: parsed.sphere as any,
            type: parsed.type as any,
            earmarkId: (parsed as any).earmarkId,
            budgetId: (parsed as any).budgetId
        })
        return ReportsMonthlyOutput.parse({ buckets })
    })

    ipcMain.handle('reports.daily', async (_e, payload) => {
        const parsed = ReportsMonthlyInput.parse(payload) // Same input schema
        const buckets = dailyVouchers({
            from: parsed.from,
            to: parsed.to,
            paymentMethod: parsed.paymentMethod as any,
            sphere: parsed.sphere as any,
            type: parsed.type as any,
            earmarkId: (parsed as any).earmarkId,
            budgetId: (parsed as any).budgetId
        })
        return { buckets } // Same output format, just date instead of month
    })

    ipcMain.handle('reports.cashBalance', async (_e, payload) => {
        const parsed = ReportsCashBalanceInput.parse(payload)
        const res = cashBalance({ from: parsed.from, to: parsed.to, sphere: parsed.sphere as any, budgetId: parsed.budgetId })
        return ReportsCashBalanceOutput.parse(res)
    })

    // Distinct voucher years
    ipcMain.handle('reports.years', async () => {
        const years = listVoucherYears()
        return ReportsYearsOutput.parse({ years })
    })

    ipcMain.handle('reports.export', async (_e, payload) => {
        const parsed = ReportsExportInput.parse(payload)
        const rows = listVouchersAdvanced({
            limit: 100000,
            paymentMethod: (parsed.filters?.paymentMethod as any) || undefined,
            sphere: (parsed.filters?.sphere as any) || undefined,
            type: (parsed.filters?.type as any) || undefined,
            from: parsed.from,
            to: parsed.to,
            earmarkId: (parsed.filters as any)?.earmarkId,
            budgetId: (parsed.filters as any)?.budgetId,
            q: (parsed.filters as any)?.q,
            tag: (parsed.filters as any)?.tag,
            // Apply sort from export payload; default to DESC if not provided
            sort: (parsed as any).sort || 'DESC',
            sortBy: (parsed as any).sortBy || 'date'
        })

        const when = new Date()
        const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}`
        const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
        try { fs.mkdirSync(baseDir, { recursive: true }) } catch { }

        const defaultCols = ['date', 'voucherNo', 'type', 'sphere', 'description', 'status', 'paymentMethod', 'netAmount', 'vatAmount', 'grossAmount'] as const
        const colsSel = (parsed.fields && parsed.fields.length ? parsed.fields : defaultCols) as string[]
        const headerMap: Record<string, string> = {
            date: 'Datum', voucherNo: 'Nr.', type: 'Typ', sphere: 'Sphäre', description: 'Beschreibung', status: 'Status', paymentMethod: 'Zahlweg', netAmount: 'Netto', vatAmount: 'MwSt', grossAmount: 'Brutto', tags: 'Tags'
        }
        const paymentAccountLabel = (row: any) => {
            if (row?.type === 'TRANSFER') {
                const from = row.transferFromAccountName || (row.transferFrom === 'BAR' ? 'Bar' : row.transferFrom === 'BANK' ? 'Bank' : '')
                const to = row.transferToAccountName || (row.transferTo === 'BAR' ? 'Bar' : row.transferTo === 'BANK' ? 'Bank' : '')
                return from && to ? `${from} -> ${to}` : 'Transfer'
            }
            return row?.paymentAccountName || (row?.paymentMethod === 'BAR' ? 'Bar' : row?.paymentMethod === 'BANK' ? 'Bank' : '')
        }
        const outNegative = parsed.amountMode === 'OUT_NEGATIVE'
        const reportBase = parsed.type === 'JOURNAL' ? 'Journal' : `Report_${parsed.type}`

    if (parsed.format === 'PDF') {
            // Phase 1 PDF: simple summary page rendered in an offscreen BrowserWindow and printed to PDF
            const when = new Date()
            const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}`
            const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
            try { fs.mkdirSync(baseDir, { recursive: true }) } catch { }
            const filePath = path.join(baseDir, `Controlling_${stamp}.pdf`)

            // Gather summary data for the report
            const summary = summarizeVouchers({
                paymentMethod: (parsed.filters?.paymentMethod as any) || undefined,
                sphere: (parsed.filters?.sphere as any) || undefined,
                type: (parsed.filters?.type as any) || undefined,
                from: parsed.from,
                to: parsed.to,
                earmarkId: (parsed.filters as any)?.earmarkId,
                budgetId: (parsed.filters as any)?.budgetId
            } as any)
            const buckets = monthlyVouchers({
                from: parsed.from,
                to: parsed.to,
                paymentMethod: (parsed.filters?.paymentMethod as any) || undefined,
                sphere: (parsed.filters?.sphere as any) || undefined,
                type: (parsed.filters?.type as any) || undefined,
                earmarkId: (parsed.filters as any)?.earmarkId,
                budgetId: (parsed.filters as any)?.budgetId
            })
            // Build accurate monthly series for IN/OUT/Saldo (ignore type filter to show both lines)
            const d2 = getDb()
            const p2: any[] = []
            const wh2: string[] = []
            if (parsed.from) { wh2.push('date >= ?'); p2.push(parsed.from) }
            if (parsed.to) { wh2.push('date <= ?'); p2.push(parsed.to) }
            if (parsed.filters?.paymentMethod) { wh2.push('payment_method = ?'); p2.push(parsed.filters.paymentMethod) }
            if (parsed.filters?.sphere) { wh2.push('sphere = ?'); p2.push(parsed.filters.sphere) }
            if ((parsed.filters as any)?.earmarkId != null) { wh2.push('earmark_id = ?'); p2.push((parsed.filters as any).earmarkId) }
            if ((parsed.filters as any)?.budgetId != null) { wh2.push('budget_id = ?'); p2.push((parsed.filters as any).budgetId) }
            const where2 = wh2.length ? ' WHERE ' + wh2.join(' AND ') : ''
            const detailed = d2.prepare(`
                SELECT strftime('%Y-%m', date) as month,
                       IFNULL(SUM(CASE WHEN type='IN' THEN gross_amount ELSE 0 END), 0) as inGross,
                       IFNULL(SUM(CASE WHEN type='OUT' THEN gross_amount ELSE 0 END), 0) as outGross,
                       IFNULL(SUM(CASE WHEN type='IN' THEN gross_amount WHEN type='OUT' THEN -gross_amount ELSE 0 END), 0) as saldo
                FROM vouchers${where2}
                GROUP BY strftime('%Y-%m', date)
                ORDER BY month ASC
            `).all(...p2) as any[]
            const orgName = (parsed.orgName && parsed.orgName.trim()) || (getSetting<string>('org.name') || 'VereinO') as string
            const outNegative = parsed.amountMode === 'OUT_NEGATIVE'

            // Prepare data for sphere chart
            const sphereAgg = (summary.bySphere as any[]).map(s => ({ key: s.key as string, gross: Number(s.gross) }))
            const totalSphere = Math.max(0.0001, sphereAgg.reduce((a, b) => a + Math.abs(b.gross), 0))
            const colors: Record<string, string> = { IDEELL: '#6AA6FF', ZWECK: '#00C853', VERMOEGEN: '#FFC107', WGB: '#9C27B0' }
            function arcPath(cx: number, cy: number, r: number, r2: number, start: number, end: number) {
                const toXY = (ang: number, rad: number) => [cx + rad * Math.cos(ang), cy + rad * Math.sin(ang)]
                const [x1, y1] = toXY(start, r)
                const [x2, y2] = toXY(end, r)
                const [x3, y3] = toXY(end, r2)
                const [x4, y4] = toXY(start, r2)
                const large = end - start > Math.PI ? 1 : 0
                return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r2} ${r2} 0 ${large} 0 ${x4} ${y4} Z`
            }
            function sphereDonutSVG(size = 160) {
                const cx = size / 2, cy = size / 2, r = size / 2 - 4, r2 = r * 0.62
                let a0 = -Math.PI / 2
                const parts = sphereAgg.map(s => {
                    const frac = Math.abs(s.gross) / totalSphere
                    const a1 = a0 + frac * Math.PI * 2
                    const d = arcPath(cx, cy, r, r2, a0, a1)
                    const seg = `<path d="${d}" fill="${colors[s.key] || '#888'}" />`
                    a0 = a1
                    return seg
                }).join('')
                return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="Sphären-Donut">${parts}</svg>`
            }

            // Helpers
            const esc = (s: any) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])
            const euro = (n: number) => `${(n).toFixed(2)} €`
            const voucherDescriptionHtml = (row: any) => {
                const description = String(row?.description || '').trim() || '—'
                const status = voucherStatusText(row)
                const kind = voucherStatusKind(row)
                return `${esc(description)}${status ? `<div class="voucher-status voucher-status-${kind}">${esc(status)}</div>` : ''}`
            }
            const paymentAccountRows = Array.isArray((summary as any).byPaymentAccount) && (summary as any).byPaymentAccount.length
                ? (summary as any).byPaymentAccount
                : (summary.byPaymentMethod as any[]).map(p => ({ key: p.key === 'BAR' ? 'Bar' : p.key === 'BANK' ? 'Bank' : 'Ohne Konto', color: null, gross: p.gross }))

            const totalIn = (summary.byType.find((t: any) => t.key === 'IN')?.gross ?? 0)
            const totalOut = Math.abs(summary.byType.find((t: any) => t.key === 'OUT')?.gross ?? 0)
            const saldo = Math.round((totalIn - totalOut) * 100) / 100

            const html = `<!doctype html>
<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/><title>Controlling-Bericht</title>
<style>
    body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; color: #222; }
    h1 { margin: 0 0 4px; }
    .muted { color: #666; font-size: 12px; }
    .kpis { display: flex; gap: 16px; margin: 12px 0 18px; }
    .kpi { padding: 10px 12px; border-radius: 8px; background: #f3f6fb; min-width: 140px; }
    .kpi .label { font-size: 12px; color: #555; }
    .kpi .value { font-weight: 700; font-size: 18px; margin-top: 4px; }
    table { border-collapse: collapse; width: 100%; }
    th, td { border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
    .small { font-size: 12px; }
    .right { text-align: right; }
    .chart { height: 160px; display: grid; grid-auto-flow: column; align-items: end; gap: 8px; }
    .bar { background: #6AA6FF; }
    .line-wrap { height: 220px; position: relative; }
    .line-wrap svg { position: absolute; inset: 0; }
    .stroke-in { stroke: #4CC38A; fill: none; stroke-width: 2; }
    .stroke-out { stroke: #F06A6A; fill: none; stroke-width: 2; }
    .stroke-net { stroke: #6AA6FF; fill: none; stroke-width: 2; stroke-dasharray: 4 4; }
    .axis { stroke: #ccc; stroke-width: 1; }
    .lbl { font-size: 11px; fill: #333; }
    .footer { margin-top: 24px; font-size: 11px; color: #777; }
    .badge { display:inline-block; padding:2px 8px; border-radius:999px; background:#eef3ff; font-size:12px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
    .card { border: 1px solid #ddd; border-radius: 10px; padding: 12px; }
    .title { font-weight: 700; margin-bottom: 8px; }
    .legend { display:flex; gap: 8px; flex-wrap: wrap; }
    .legend-item { display:inline-flex; align-items:center; gap:6px; font-size:12px; }
    .sw { width:10px; height:10px; border-radius:3px; display:inline-block; }
    .table-box { margin-top: 12px; }
    .table-box table { width: 100%; border-collapse: collapse; font-size: 12px; }
    .table-box th, .table-box td { border-bottom: 1px solid #eee; padding: 4px 6px; text-align: left; vertical-align: top; }
    .table-box th.right, .table-box td.right { text-align: right; }
    tr.voucher-row-storno { background: #fff5f5; }
    tr.voucher-row-storniert { background: #f5f5f5; color: #555; }
    .voucher-status { display:inline-block; margin-top:3px; padding:2px 6px; border-radius:4px; font-size:11px; font-weight:700; }
    .voucher-status-storno { background:#ffebee; color:#b71c1c; border:1px solid #ffcdd2; }
    .voucher-status-storniert { background:#eeeeee; color:#555; border:1px solid #d6d6d6; }
    .nowrap { white-space: nowrap; }
    .muted { color: #666; font-size: 12px; }
    @media print { .card { break-inside: avoid; } tr { break-inside: avoid; } }
</style>
</head><body>
    <h1>Controlling-Bericht</h1>
    <div class="muted">${orgName} · Zeitraum: ${(parsed.from ?? '')} – ${(parsed.to ?? '')} · Erstellt: ${new Date().toLocaleString('de-DE')}</div>
    <div class="kpis">
        <div class="kpi"><div class="label">Einnahmen (Brutto)</div><div class="value">${totalIn.toFixed(2)} €</div></div>
        <div class="kpi"><div class="label">Ausgaben (Brutto)</div><div class="value">${totalOut.toFixed(2)} €</div></div>
        <div class="kpi"><div class="label">Saldo</div><div class="value">${saldo.toFixed(2)} €</div></div>
    </div>
    <div class="grid">
        <div class="card">
            <div class="title">Nach Sphäre</div>
            <div style="display:flex; gap:16px; align-items:center;">
                <div>${sphereDonutSVG(160)}</div>
                <div class="legend">
                    ${(summary.bySphere as any[]).map(s => `<span class="legend-item"><span class="sw" style="background:${colors[(s as any).key] || '#888'}"></span>${esc((s as any).key)} · ${euro(Number((s as any).gross))}</span>`).join('')}
                </div>
            </div>
        </div>
        <div class="card">
            <div class="title">Nach Zahlweg</div>
            <table class="small">
                <thead><tr><th>Zahlweg</th><th class="right">Brutto</th></tr></thead>
                <tbody>
                    ${paymentAccountRows.map((p: any) => `<tr><td>${p.color ? `<span class="sw" style="background:${esc(p.color)}"></span> ` : ''}${esc(p.key ?? 'Ohne Konto')}</td><td class=right>${Number(p.gross).toFixed(2)} €</td></tr>`).join('')}
                </tbody>
            </table>
        </div>
    </div>
    <div class="card" style="margin-top:16px;">
        <div class="title">Monatsverlauf (Balken: IN/OUT · Linie: kumulierter Saldo)</div>
        <div style="height:240px;">
            ${(() => {
                // Dashboard-style chart with IN/OUT bars and cumulative saldo line
                const W = 760, H = 220, P = 100
                const baseY = H - 28
                const maxH = baseY - 24
                const m = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
                
                // Build cumulative saldo
                const cumSaldo: number[] = []
                let run = 0
                for (const b of detailed) { run += (Number(b.saldo) || 0); cumSaldo.push(run) }
                
                // Scale by max of bars and cumulative line
                const maxBar = Math.max(1, ...detailed.map((b: any) => Math.max(Number(b.inGross)||0, Number(b.outGross)||0)))
                const minLine = Math.min(0, ...cumSaldo)
                const maxLine = Math.max(0, ...cumSaldo)
                const maxValue = Math.max(maxBar, Math.abs(minLine), Math.abs(maxLine))
                
                const xs = (i: number, n: number) => {
                    const usable = W - 2 * P
                    const seg = usable / Math.max(1, n)
                    return P + seg / 2 + i * seg
                }
                const yBar = (v: number) => baseY - Math.min(1, v / Math.max(1e-9, maxValue)) * maxH
                const yLine = (v: number) => {
                    const range = maxValue - (-maxValue)
                    return 16 + ((maxValue - v) / range) * (baseY - 16)
                }
                
                const barW = 12, gap = 8
                
                // Y-axis ticks
                function niceStep(max: number) {
                    if (max <= 0) return 1
                    const exp = Math.floor(Math.log10(max))
                    const base = Math.pow(10, exp)
                    const m = max / base
                    let step = base
                    if (m <= 2) step = base / 5
                    else if (m <= 5) step = base / 2
                    const target = Math.max(1, Math.round(max / step))
                    if (target > 8) step *= 2
                    return step
                }
                const yStep = niceStep(maxValue)
                const yTicks: number[] = []
                for (let v = 0; v <= maxValue + 1e-9; v += yStep) yTicks.push(Math.round(v))
                
                const formatEuro = (v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k€` : `${v.toFixed(0)}€`
                
                // Bars
                const bars = detailed.map((b: any, i: number) => {
                    const xCenter = xs(i, detailed.length)
                    const inV = Number(b.inGross) || 0
                    const outV = Number(b.outGross) || 0
                    const hIn = inV ? (baseY - yBar(inV)) : 0
                    const hOut = outV ? (baseY - yBar(outV)) : 0
                    return `<rect x="${xCenter - barW - gap/2}" y="${yBar(inV)}" width="${barW}" height="${hIn}" fill="#2e7d32" rx="2"/>
                            <rect x="${xCenter + gap/2}" y="${yBar(outV)}" width="${barW}" height="${hOut}" fill="#c62828" rx="2"/>`
                }).join('')
                
                // Cumulative line
                const linePts = cumSaldo.map((v, i) => `${xs(i, detailed.length)},${yLine(v)}`).join(' ')
                
                // X labels (thinned out for readability)
                let tickEvery = 1
                const total = detailed.length
                if (total > 48) tickEvery = 12
                else if (total > 24) tickEvery = 6
                else if (total > 12) tickEvery = 3
                
                const xLabels = detailed.map((b: any, i: number) => {
                    if (i % tickEvery !== 0 && i !== detailed.length - 1) return ''
                    const monIdx = Math.max(0, Math.min(11, Number(String(b.month).slice(5)) - 1))
                    const mon = m[monIdx] || String(b.month).slice(5)
                    return `<text x="${xs(i, detailed.length)}" y="${H-6}" fill="#666" font-size="10" text-anchor="middle">${mon}</text>`
                }).join('')
                
                // Y grid + labels
                const yGrid = yTicks.map(v => {
                    return `<line x1="${P}" x2="${W-P/2}" y1="${yBar(v)}" y2="${yBar(v)}" stroke="#ddd" opacity="0.5"/>
                            <text x="${P-6}" y="${yBar(v)+4}" fill="#666" font-size="10" text-anchor="end">${formatEuro(v)}</text>`
                }).join('')
                
                return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%">
                    <line x1="${P}" x2="${W-P/2}" y1="${baseY}" y2="${baseY}" stroke="#ccc"/>
                    <line x1="${P}" x2="${P}" y1="16" y2="${baseY}" stroke="#ccc"/>
                    ${yGrid}
                    ${bars}
                    <polyline points="${linePts}" fill="none" stroke="#f9a825" stroke-width="2"/>
                    ${xLabels}
                </svg>`
            })()}
        </div>
    </div>

    <div class="card" style="margin-top:16px;">
        <div class="title">Einnahmen vs. Ausgaben</div>
        <div style="height:220px;">
            ${(() => {
                // Dashboard-style Income vs Expense chart
                const W = 760, H = 200, P = 100
                const baseY = H - 28
                const maxH = baseY - 16
                const m = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
                
                const maxVal = Math.max(1, ...detailed.map((b: any) => Math.max(Number(b.inGross)||0, Number(b.outGross)||0)))
                
                const xs = (i: number, n: number) => {
                    const usable = W - 2 * P
                    const seg = usable / Math.max(1, n)
                    return P + seg / 2 + i * seg
                }
                const yFor = (v: number) => baseY - Math.min(1, v / Math.max(1e-9, maxVal)) * maxH
                
                const barW = 10, gap = 5
                
                // Y-axis ticks
                function niceStep(max: number) {
                    if (max <= 0) return 1
                    const exp = Math.floor(Math.log10(max))
                    const base = Math.pow(10, exp)
                    const m = max / base
                    let step = base
                    if (m <= 2) step = base / 5
                    else if (m <= 5) step = base / 2
                    const target = Math.max(1, Math.round(max / step))
                    if (target > 8) step *= 2
                    return step
                }
                const yStep = niceStep(maxVal)
                const yTicks: number[] = []
                for (let v = 0; v <= maxVal + 1e-9; v += yStep) yTicks.push(Math.round(v))
                
                const formatEuro = (v: number) => v >= 1000 ? `${(v/1000).toFixed(0)}k€` : `${v.toFixed(0)}€`
                
                // Bars
                const bars = detailed.map((b: any, i: number) => {
                    const xCenter = xs(i, detailed.length)
                    const inV = Number(b.inGross) || 0
                    const outV = Number(b.outGross) || 0
                    const hIn = Math.round((inV / maxVal) * maxH)
                    const hOut = Math.round((outV / maxVal) * maxH)
                    return `<rect x="${xCenter - barW * 1.5 - gap}" y="${baseY - hIn}" width="${barW}" height="${hIn}" fill="#2e7d32" rx="2"/>
                            <rect x="${xCenter - barW / 2}" y="${baseY - hOut}" width="${barW}" height="${hOut}" fill="#c62828" rx="2"/>`
                }).join('')
                
                // X labels (thinned out for readability)
                let tickEvery = 1
                const total = detailed.length
                if (total > 48) tickEvery = 12
                else if (total > 24) tickEvery = 6
                else if (total > 12) tickEvery = 3
                
                const xLabels = detailed.map((b: any, i: number) => {
                    if (i % tickEvery !== 0 && i !== detailed.length - 1) return ''
                    const monIdx = Math.max(0, Math.min(11, Number(String(b.month).slice(5)) - 1))
                    const mon = m[monIdx] || String(b.month).slice(5)
                    return `<text x="${xs(i, detailed.length)}" y="${H-6}" fill="#666" font-size="10" text-anchor="middle">${mon}</text>`
                }).join('')
                
                // Y grid + labels
                const yGrid = yTicks.map(v => {
                    return `<line x1="${P}" x2="${W-P/2}" y1="${yFor(v)}" y2="${yFor(v)}" stroke="#ddd" opacity="0.5"/>
                            <text x="${P-6}" y="${yFor(v)+4}" fill="#666" font-size="10" text-anchor="end">${formatEuro(v)}</text>`
                }).join('')
                
                return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%">
                    <line x1="${P/2}" x2="${W-P/2}" y1="${baseY}" y2="${baseY}" stroke="#ccc"/>
                    <line x1="${P}" x2="${P}" y1="16" y2="${baseY}" stroke="#ccc"/>
                    ${yGrid}
                    ${bars}
                    ${xLabels}
                </svg>`
            })()}
        </div>
        <div style="margin-top:8px; font-size:12px; color:#666;">
            <span style="display:inline-block; margin-right:12px;"><span style="display:inline-block; width:10px; height:10px; background:#2e7d32; border-radius:2px; margin-right:4px;"></span>Einnahmen</span>
            <span style="display:inline-block; margin-right:12px;"><span style="display:inline-block; width:10px; height:10px; background:#c62828; border-radius:2px; margin-right:4px;"></span>Ausgaben</span>
        </div>
    </div>

    <div class="card table-box" style="margin-top:16px;">
        <div class="title">Belege (Tabelle)</div>
        <table>
            <thead>
                <tr>
                    <th class="nowrap">Datum</th>
                    <th class="nowrap">Nr.</th>
                    <th class="nowrap">Typ</th>
                    <th class="nowrap">Sphäre</th>
                    <th>Beschreibung</th>
                    <th class="nowrap">Zahlweg</th>
                    <th class="right nowrap">Brutto</th>
                </tr>
            </thead>
            <tbody>
                ${rows.map((r: any) => {
                    const g = (r.type === 'OUT' && outNegative) ? -r.grossAmount : r.grossAmount
                    const kind = voucherStatusKind(r)
                    return `<tr class="${kind ? `voucher-row-${kind}` : ''}">
                        <td class="nowrap">${esc(r.date)}</td>
                        <td class="nowrap">${esc(r.voucherNo)}</td>
                        <td class="nowrap">${esc(r.type)}</td>
                        <td class="nowrap">${esc(r.sphere)}</td>
                        <td>${voucherDescriptionHtml(r)}</td>
                        <td class="nowrap">${esc(paymentAccountLabel(r))}</td>
                        <td class="right nowrap">${euro(Number(g))}</td>
                    </tr>`
                }).join('')}
            </tbody>
        </table>
        <div class="muted">Insgesamt ${rows.length} Beleg(e).</div>
    </div>
    <div class="footer">VereinO · Automatisch erstellt</div>
</body></html>`

            const win = new BrowserWindow({ show: false, width: 900, height: 1200 })
            await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
            const buff = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
            fs.writeFileSync(filePath, buff)
            try { win.destroy() } catch { }
            return ReportsExportOutput.parse({ filePath })
        } else if (parsed.format === 'XLSX') {
            const orgName = (parsed.orgName && parsed.orgName.trim()) || (getSetting<string>('org.name') || 'VereinO') as string
            const filePath = path.join(baseDir, `${reportBase}_${stamp}.xlsx`)
            const wb = new ExcelJS.Workbook()
            const ws = wb.addWorksheet('Export')
            // Header block
            ws.addRow([`${reportBase} Export`])
            ws.addRow([`Organisation: ${orgName}`])
            ws.addRow([`Zeitraum: ${parsed.from ?? ''} – ${parsed.to ?? ''}`])
            ws.addRow([])
            // Table header
            ws.addRow(colsSel.map(c => headerMap[c] || c))
            for (const r of rows) {
                const values = colsSel.map((c) => {
                    if (c === 'grossAmount') return Number(((r.type === 'OUT' && outNegative) ? -r.grossAmount : r.grossAmount).toFixed(2))
                    if (c === 'netAmount') return Number(((r.type === 'OUT' && outNegative) ? -r.netAmount : r.netAmount).toFixed(2))
                    if (c === 'vatAmount') return Number(((r.type === 'OUT' && outNegative) ? -r.vatAmount : r.vatAmount).toFixed(2))
                    if (c === 'description') return r.description ?? ''
                    if (c === 'status') return voucherStatusText(r)
                    if (c === 'paymentMethod') return paymentAccountLabel(r)
                    if (c === 'tags') return (r.tags || []).join(', ')
                    return (r as any)[c]
                })
                const row = ws.addRow(values)
                const kind = voucherStatusKind(r)
                if (kind === 'storno') {
                    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F1' } }
                } else if (kind === 'storniert') {
                    row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F1F1' } }
                    row.font = { color: { argb: 'FF555555' } }
                }
            }
            // Simple formatting
            ws.getRow(1).font = { bold: true, size: 14 }
            ws.getRow(5).font = { bold: true }
            // Column widths
            ws.columns = colsSel.map((c) => ({ width: c === 'description' ? 40 : c === 'status' ? 28 : 12 })) as any

            // Currency formatting for Brutto (grossAmount) with colors
            const grossIdx = colsSel.indexOf('grossAmount') + 1
            if (grossIdx > 0) {
                const col = ws.getColumn(grossIdx)
                // Positive green, negative red, zero default
                col.numFmt = '[Green]#,##0.00" \u20AC";[Red]-#,##0.00" \u20AC";#,##0.00" \u20AC"'
                col.alignment = { horizontal: 'right' }
            }

            await wb.xlsx.writeFile(filePath)
            return ReportsExportOutput.parse({ filePath })
        } else {
            const filePath = path.join(baseDir, `${reportBase}_${stamp}.csv`)
            const lines: string[] = []
            lines.push(colsSel.map(c => headerMap[c] || c).join(';'))
            for (const r of rows) {
                const vals = colsSel.map((c) => {
                    if (c === 'description') return (r.description ?? '').replace(/\n|\r|;/g, ' ')
                    if (c === 'status') return voucherStatusText(r)
                    if (c === 'paymentMethod') return paymentAccountLabel(r)
                    if (c === 'tags') return (r.tags || []).join(', ')
                    if (c === 'grossAmount') return ((r.type === 'OUT' && outNegative) ? -r.grossAmount : r.grossAmount).toFixed(2)
                    if (c === 'netAmount') return ((r.type === 'OUT' && outNegative) ? -r.netAmount : r.netAmount).toFixed(2)
                    if (c === 'vatAmount') return ((r.type === 'OUT' && outNegative) ? -r.vatAmount : r.vatAmount).toFixed(2)
                    return String((r as any)[c] ?? '')
                })
                lines.push(vals.join(';'))
            }
            fs.writeFileSync(filePath, lines.join('\n'), 'utf8')
            return ReportsExportOutput.parse({ filePath })
        }
    })

    ipcMain.handle('reports.exportFiscal', async (_e, payload) => {
        const parsed = FiscalReportInput.parse(payload)
        const { generateFiscalReportPDF } = await import('../services/fiscalReport')
        const from = `${parsed.fiscalYear}-01-01`
        const to = `${parsed.fiscalYear}-12-31`
        const result = await generateFiscalReportPDF({
            fiscalYear: parsed.fiscalYear,
            from,
            to,
            includeBindings: parsed.includeBindings ?? false,
            includeVoucherList: parsed.includeVoucherList ?? false,
            includeBudgets: parsed.includeBudgets ?? false,
            includeActivityReport: parsed.includeActivityReport ?? false,
            includeInactiveBindings: parsed.includeInactiveBindings ?? false,
            includeArchivedBudgets: parsed.includeArchivedBudgets ?? false,
            includeInternalVouchers: parsed.includeInternalVouchers ?? false,
            bindingIds: parsed.bindingIds,
            budgetIds: parsed.budgetIds,
            orgName: parsed.orgName
        })
        return FiscalReportOutput.parse(result)
    })

    ipcMain.handle('activityReports.get', async (_e, payload) => {
        const parsed = ActivityReportGetInput.parse(payload)
        const report = await withSchemaHealRetry(() => getActivityReport(parsed.fiscalYear), ['activity_reports'])
        return ActivityReportGetOutput.parse({ ...report, missingFields: validateActivityReport(report) })
    })

    ipcMain.handle('activityReports.list', async (_e, payload) => {
        ActivityReportListInput.parse(payload)
        const rows = await withSchemaHealRetry(() => listActivityReports(), ['activity_reports'])
        return ActivityReportListOutput.parse({ rows })
    })

    ipcMain.handle('activityReports.save', async (_e, payload) => {
        const parsed = ActivityReportSaveInput.parse(payload)
        const report = await withSchemaHealRetry(() => saveActivityReport(parsed), ['activity_reports'])
        return ActivityReportSaveOutput.parse({ ...report, missingFields: validateActivityReport(report) })
    })

    ipcMain.handle('activityReports.delete', async (_e, payload) => {
        const parsed = ActivityReportDeleteInput.parse(payload)
        const result = await withSchemaHealRetry(() => deleteActivityReport(parsed.fiscalYear), ['activity_reports'])
        return ActivityReportDeleteOutput.parse(result)
    })

    ipcMain.handle('reports.exportTreasurer', async (_e, payload) => {
        const { TreasurerReportInput, TreasurerReportOutput } = await import('./schemas')
        const parsed = TreasurerReportInput.parse(payload)
        const { generateTreasurerReportPDF } = await import('../services/treasurerReport')
        const from = `${parsed.fiscalYear}-01-01`
        const to = `${parsed.fiscalYear}-12-31`
        const result = await generateTreasurerReportPDF({
            fiscalYear: parsed.fiscalYear,
            from,
            to,
            orgName: parsed.orgName,
            cashBalanceDate: parsed.cashBalanceDate,
            includeMembers: parsed.includeMembers ?? true,
            includeInvoices: parsed.includeInvoices ?? true,
            includeBindings: parsed.includeBindings ?? true,
            includeBudgets: parsed.includeBudgets ?? true,
            includeTagSummary: parsed.includeTagSummary ?? false,
            includeVoucherList: parsed.includeVoucherList ?? false,
            includeTags: parsed.includeTags ?? false,
            includeInternalVouchers: parsed.includeInternalVouchers ?? false,
            voucherListFrom: parsed.voucherListFrom,
            voucherListTo: parsed.voucherListTo,
            voucherListSort: parsed.voucherListSort ?? 'ASC'
        })
        return TreasurerReportOutput.parse(result)
    })

    const voucherListSchemaIdentifiers = ['cash_checks', 'member_advances', 'amount_mode', 'budget_id', 'budget_amount', 'earmark_amount', 'transfer_from', 'transfer_to']

    ipcMain.handle('vouchers.list', async (_e, payload) => {
        return withSchemaHealRetry(() => {
            const parsed = VouchersListInput.parse(payload) ?? { limit: 20, offset: 0, sort: 'DESC' }
            const { rows, total } = listVouchersAdvancedPaged({
                limit: parsed.limit,
                offset: parsed.offset ?? 0,
                sort: (parsed.sort as any) || 'DESC',
                sortBy: (parsed as any).sortBy,
                paymentMethod: parsed.paymentMethod as any,
                paymentAccountId: parsed.paymentAccountId ?? undefined,
                sphere: parsed.sphere as any,
                type: parsed.type as any,
                from: parsed.from,
                to: parsed.to,
                earmarkId: parsed.earmarkId,
                budgetId: (parsed as any).budgetId,
                voucherIds: parsed.voucherIds,
                q: parsed.q,
                tag: (parsed as any).tag
            })
            const enrichedRows = rows.map((r: any) => ({
                ...r,
                budgets: getVoucherBudgets(r.id),
                earmarksAssigned: getVoucherEarmarks(r.id)
            }))
            return VouchersListOutput.parse({ rows: enrichedRows, total })
        }, voucherListSchemaIdentifiers)
    })

    ipcMain.handle('vouchers.update', async (_e, payload) => {
        const parsed = VoucherUpdateInput.parse(payload)
        const res = updateVoucher(parsed as any)
        // Handle multiple budget/earmark assignments if provided
        if (parsed.budgets !== undefined) {
            setVoucherBudgets(parsed.id, parsed.budgets)
        }
        if (parsed.earmarks !== undefined) {
            setVoucherEarmarks(parsed.id, parsed.earmarks)
        }
        return VoucherUpdateOutput.parse(res)
    })

    ipcMain.handle('vouchers.updateMeta', async (_e, payload) => {
        const parsed = VoucherMetaUpdateInput.parse(payload)
        return VoucherUpdateOutput.parse(updateVoucherMeta(parsed as any))
    })

    ipcMain.handle('paymentAccounts.list', async (_e, payload) => {
        const parsed = PaymentAccountsListInput.parse(payload)
        return PaymentAccountsListOutput.parse({ rows: listPaymentAccounts(parsed ?? undefined) })
    })
    ipcMain.handle('paymentAccounts.upsert', async (_e, payload) => {
        const parsed = PaymentAccountUpsertInput.parse(payload)
        return PaymentAccountUpsertOutput.parse(upsertPaymentAccount(parsed))
    })
    ipcMain.handle('paymentAccounts.delete', async (_e, payload) => {
        const parsed = PaymentAccountDeleteInput.parse(payload)
        return PaymentAccountDeleteOutput.parse(deletePaymentAccount(parsed.id))
    })

    ipcMain.handle('vouchers.delete', async (_e, payload) => {
        const parsed = VoucherDeleteInput.parse(payload)
        const res = deleteVoucher(parsed.id)
        return VoucherDeleteOutput.parse(res)
    })
    ipcMain.handle('vouchers.batchAssignEarmark', async (_e, payload) => {
        const parsed = VouchersBatchAssignEarmarkInput.parse(payload)
        const res = batchAssignEarmark(parsed as any)
        return VouchersBatchAssignEarmarkOutput.parse(res)
    })
    ipcMain.handle('vouchers.batchAssignBudget', async (_e, payload) => {
        const parsed = VouchersBatchAssignBudgetInput.parse(payload)
        const res = batchAssignBudget(parsed as any)
        return VouchersBatchAssignBudgetOutput.parse(res)
    })
    ipcMain.handle('vouchers.batchAssignTags', async (_e, payload) => {
        const parsed = VouchersBatchAssignTagsInput.parse(payload)
        const res = batchAssignTags(parsed as any)
        return VouchersBatchAssignTagsOutput.parse(res)
    })
    // Recent vouchers (simple list)
    ipcMain.handle('vouchers.recent', async (_e, payload) => {
        const parsed = VouchersRecentInput.parse(payload) ?? { limit: 10 }
        const rows = listRecentVouchers(parsed.limit)
        return VouchersRecentOutput.parse({ rows })
    })
    ipcMain.handle('vouchers.clearAll', async (_e, payload) => {
        const parsed = VouchersClearAllInput.parse(payload)
        if (!parsed.confirm) throw new Error('Nicht bestätigt')
        // Safety: backup before destructive action
        try { await backup.makeBackup('preClearAll') } catch { /* ignore */ }
        const res = clearAllVouchers()
        return VouchersClearAllOutput.parse(res)
    })

    // Zweckbindungen (bindings)
    ipcMain.handle('bindings.list', async (_e, payload) => {
        const parsed = BindingListInput.parse(payload)
        const rows = listBindings(parsed ?? undefined)
        return BindingListOutput.parse({ rows })
    })
    ipcMain.handle('bindings.upsert', async (_e, payload) => {
        const parsed = BindingUpsertInput.parse(payload)
        const res = upsertBinding(parsed as any)
        return BindingUpsertOutput.parse({ id: res.id })
    })
    ipcMain.handle('bindings.delete', async (_e, payload) => {
        const parsed = BindingDeleteInput.parse(payload)
        const res = deleteBinding(parsed.id)
        return BindingDeleteOutput.parse(res)
    })
    ipcMain.handle('bindings.usage', async (_e, payload) => {
        const parsed = BindingUsageInput.parse(payload)
        const res = bindingUsage(parsed.earmarkId, { from: parsed.from, to: parsed.to, sphere: parsed.sphere as any })
        return BindingUsageOutput.parse(res)
    })

    // Budgets
    ipcMain.handle('budgets.upsert', async (_e, payload) => {
        const parsed = BudgetUpsertInput.parse(payload)
        const res = upsertBudget(parsed as any)
        return BudgetUpsertOutput.parse({ id: res.id })
    })
    ipcMain.handle('budgets.list', async (_e, payload) => {
        const parsed = BudgetListInput.parse(payload)
        const rows = listBudgets(parsed ?? {})
        return BudgetListOutput.parse({ rows })
    })
    ipcMain.handle('budgets.delete', async (_e, payload) => {
        const parsed = BudgetDeleteInput.parse(payload)
        const res = deleteBudget(parsed.id)
        return BudgetDeleteOutput.parse(res)
    })
    ipcMain.handle('budgets.usage', async (_e, payload) => {
        const parsed = BudgetUsageInput.parse(payload)
        const res = budgetUsage({ budgetId: parsed.budgetId, from: parsed.from, to: parsed.to })
        return BudgetUsageOutput.parse(res)
    })

    // Vorschüsse
    const advanceSchemaTables = ['member_advances', 'member_advance_purchases', 'member_advance_settlements']

    ipcMain.handle('advances.list', async (_e, payload) => {
        return withSchemaHealRetry(() => {
            const parsed = AdvancesListInput.parse(payload)
            const res = listAdvances(parsed ?? undefined)
            return AdvancesListOutput.parse(res)
        }, advanceSchemaTables)
    })
    ipcMain.handle('advances.create', async (_e, payload) => {
        return withSchemaHealRetry(() => {
            const parsed = AdvanceCreateInput.parse(payload)
            const res = createAdvance(parsed as any)
            return AdvanceCreateOutput.parse(res)
        }, advanceSchemaTables)
    })
    ipcMain.handle('advances.get', async (_e, payload) => {
        return withSchemaHealRetry(() => {
            const parsed = AdvanceGetInput.parse(payload)
            const res = getAdvanceById({ id: parsed.id })
            return AdvanceGetOutput.parse(res)
        }, advanceSchemaTables)
    })
    ipcMain.handle('advances.settle', async (_e, payload) => {
        return withSchemaHealRetry(() => {
            const parsed = AdvanceSettleInput.parse(payload)
            const res = settleAdvance(parsed as any)
            return AdvanceSettleOutput.parse(res)
        }, advanceSchemaTables)
    })
    ipcMain.handle('advances.delete', async (_e, payload) => {
        const parsed = AdvanceDeleteInput.parse(payload)
        const res = deleteAdvance({ id: parsed.id })
        return AdvanceDeleteOutput.parse(res)
    })

    ipcMain.handle('advances.purchases.create', async (_e, payload) => {
        const parsed = AdvancePurchaseCreateInput.parse(payload)
        const res = addAdvancePurchase(parsed as any)
        return AdvancePurchaseCreateOutput.parse(res)
    })

    ipcMain.handle('advances.purchases.delete', async (_e, payload) => {
        const parsed = AdvancePurchaseDeleteInput.parse(payload)
        const res = deleteAdvancePurchase(parsed)
        return AdvancePurchaseDeleteOutput.parse(res)
    })

    ipcMain.handle('advances.purchases.update', async (_e, payload) => {
        const parsed = AdvancePurchaseUpdateInput.parse(payload)
        const res = updateAdvancePurchase(parsed as any)
        return AdvancePurchaseUpdateOutput.parse(res)
    })

    ipcMain.handle('advances.resolve', async (_e, payload) => {
        const parsed = AdvanceResolveInput.parse(payload)
        const res = resolveAdvance({ id: parsed.id })
        return AdvanceResolveOutput.parse(res)
    })

    // Quotes
    ipcMain.handle('quotes.weekly', async (_e, payload) => {
        const parsed = QuoteWeeklyInput.parse(payload)
        const q = getWeeklyQuote(parsed?.date)
        return QuoteWeeklyOutput.parse(q)
    })

    // Imports
    ipcMain.handle('imports.preview', async (_e, payload) => {
        const parsed = ImportPreviewInput.parse(payload)
        const res = await previewFile(parsed.fileBase64)
        return ImportPreviewOutput.parse(res as any)
    })
    ipcMain.handle('imports.execute', async (_e, payload) => {
        const parsed = ImportExecuteInput.parse(payload)
        // Safety: backup before potentially large data modification
        try { await backup.makeBackup('preImportRows') } catch { /* ignore */ }
        try { ensureVoucherForeignKeyTargets(getDb() as any) } catch { /* ignore */ }
        const res = await executeFile(parsed.fileBase64, parsed.mapping as any)
        return ImportExecuteOutput.parse(res as any)
    })
    ipcMain.handle('imports.analyze', async (_e, payload) => {
        const parsed = ImportAnalyzeInput.parse(payload)
        const res = await analyzeFile(parsed.fileBase64, parsed.mapping as any, parsed.rules as any)
        return ImportAnalyzeOutput.parse(res as any)
    })
    ipcMain.handle('imports.commitDraft', async (_e, payload) => {
        const parsed = ImportCommitDraftInput.parse(payload)
        try { await backup.makeBackup('preImportDraft') } catch { /* ignore */ }
        try { ensureVoucherForeignKeyTargets(getDb() as any) } catch { /* ignore */ }
        const res = await commitImportDraft(parsed.rows as any)
        return ImportExecuteOutput.parse(res as any)
    })
    ipcMain.handle('imports.createMissing', async (_e, payload) => {
        const parsed = ImportCreateMissingInput.parse(payload)
        const res = createMissingImportMasterData(parsed as any)
        return ImportCreateMissingOutput.parse(res)
    })
    ipcMain.handle('imports.template', async (_e, payload) => {
        ImportTemplateInput.parse(payload)
        const res = await generateImportTemplate()
        return ImportTemplateOutput.parse(res)
    })

    ipcMain.handle('imports.testdata', async (_e, payload) => {
        ImportTestDataInput.parse(payload)
        const res = await generateImportTestData()
        return ImportTestDataOutput.parse(res)
    })
    ipcMain.handle('imports.editableExport', async (_e, payload) => {
        ImportEditableExportInput.parse(payload)
        const res = await exportEditableVouchersWorkbook()
        return ImportEditableExportOutput.parse(res)
    })

    // Attachments
    ipcMain.handle('attachments.list', async (_e, payload) => {
        const parsed = AttachmentsListInput.parse(payload)
        const files = listFilesForVoucher(parsed.voucherId)
        return AttachmentsListOutput.parse({
            files: files.map(f => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType ?? null, size: f.size ?? null, createdAt: f.createdAt }))
        })
    })
    ipcMain.handle('attachments.open', async (_e, payload) => {
        const parsed = AttachmentOpenInput.parse(payload)
        const f = getFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const pathBase = path.basename(f.filePath || '')
        let src = f.filePath
        try { if (!fs.existsSync(src)) { const alt = path.join(getAppDataDir().filesDir, pathBase); if (fs.existsSync(alt)) src = alt } } catch { }
        const res = await shell.openPath(src)
        const ok = !res
        return AttachmentOpenOutput.parse({ ok })
    })
    ipcMain.handle('attachments.saveAs', async (_e, payload) => {
        const parsed = AttachmentSaveAsInput.parse(payload)
        const f = getFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const save = await dialog.showSaveDialog({ title: 'Datei speichern unter …', defaultPath: f.fileName })
        if (save.canceled || !save.filePath) throw new Error('Abbruch')
        const pathBase = path.basename(f.filePath || '')
        let src = f.filePath
        if (!src || !fs.existsSync(src)) {
            const alt = path.join(getAppDataDir().filesDir, pathBase)
            if (fs.existsSync(alt)) src = alt
        }
        if (!src || !fs.existsSync(src)) throw new Error('Quelldatei nicht gefunden: ' + (f.filePath || pathBase))
        fs.copyFileSync(src, save.filePath)
        return AttachmentSaveAsOutput.parse({ filePath: save.filePath })
    })
    ipcMain.handle('attachments.read', async (_e, payload) => {
        const parsed = AttachmentReadInput.parse(payload)
        const f = getFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const pathBase = path.basename(f.filePath || '')
        let src = f.filePath
        if (!src || !fs.existsSync(src)) {
            const alt = path.join(getAppDataDir().filesDir, pathBase)
            if (fs.existsSync(alt)) src = alt
        }
        if (!src || !fs.existsSync(src)) throw new Error('Quelldatei nicht gefunden: ' + (f.filePath || pathBase))
        const buff = fs.readFileSync(src)
        const dataBase64 = Buffer.from(buff).toString('base64')
        return AttachmentReadOutput.parse({ fileName: f.fileName, mimeType: f.mimeType || undefined, dataBase64 })
    })
    ipcMain.handle('attachments.add', async (_e, payload) => {
        const parsed = AttachmentAddInput.parse(payload)
        const res = addFileToVoucher(parsed.voucherId, parsed.fileName, parsed.dataBase64, parsed.mimeType)
        return AttachmentAddOutput.parse(res)
    })
    ipcMain.handle('attachments.delete', async (_e, payload) => {
        const parsed = AttachmentDeleteInput.parse(payload)
        const res = deleteVoucherFile(parsed.fileId)
        return AttachmentDeleteOutput.parse(res)
    })

    // Database: Export (save current database.sqlite)
    ipcMain.handle('db.export', async () => {
        DbExportInput.parse({})
        const { root } = getAppDataDir()
        const dbPath = path.join(root, 'database.sqlite')
        if (!fs.existsSync(dbPath)) throw new Error('Datenbankdatei nicht gefunden')
        const now = new Date()
        const stamp = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        const defaultName = `VereinO_database_${stamp}.sqlite`
        const save = await dialog.showSaveDialog({ title: 'Datenbank exportieren …', defaultPath: defaultName, filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }] })
        // Graceful cancel: return empty path instead of throwing
        if (save.canceled || !save.filePath) return DbExportOutput.parse({ filePath: '' as any })
        fs.copyFileSync(dbPath, save.filePath)
        return DbExportOutput.parse({ filePath: save.filePath })
    })

    // Database: Import (file picker only, returns chosen file meta for comparison modal)
    ipcMain.handle('db.import.pick', async () => {
        DbImportInput.parse({})
        const open = await dialog.showOpenDialog({ title: 'Datenbank wählen …', filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }], properties: ['openFile'] })
        if (open.canceled || !open.filePaths?.[0]) return { ok: false }
        const importPath = open.filePaths[0]
        // Basic stats for comparison
        try {
            const stat = fs.statSync(importPath)
            // Inspect counts using existing backup.inspect logic for uniformity
            const counts = backup.inspectBackup(importPath)?.counts || {}
            return { ok: true, filePath: importPath, size: stat.size, mtime: stat.mtimeMs, counts }
        } catch {
            return { ok: true, filePath: importPath }
        }
    })

    // Database: Import from provided path after user confirms comparison
    ipcMain.handle('db.import.fromPath', async (_e, payload) => {
        const parsed = DbImportFromPathInput.parse(payload)
        const importPath = parsed.filePath
        const { root } = getAppDataDir()
        const dbPath = path.join(root, 'database.sqlite')
        try {
            // Safety: create a backup before replacing the DB
            try { await backup.makeBackup('preImport') } catch { /* ignore backup errors */ }
            // Close DB before replacing file
            try { closeDb() } catch { }
            fs.copyFileSync(importPath, dbPath)
            // Reopen and ensure migrations are applied
            const d = getDb()
            // Ensure schema is up to date (e.g., tags tables)
            try { applyMigrations(d as any) } catch { /* ignore, handled by main on next start too */ }
            // optional: run a lightweight pragma to ensure file is valid
            d.pragma('foreign_keys = ON')
            return DbImportFromPathOutput.parse({ ok: true, filePath: importPath })
        } catch (e) {
            throw new Error('Import fehlgeschlagen: ' + (e as any)?.message)
        }
    })

    // DB location: info
    ipcMain.handle('db.location.get', async () => {
        const info = getCurrentDbInfo()
        const cfg = readAppConfig()
        return { root: info.root, dbPath: info.dbPath, filesDir: info.filesDir, configuredRoot: cfg.dbRoot || null }
    })

    // DB location: pick a folder (no migration) – return info so renderer can decide next step
    ipcMain.handle('db.location.pick', async () => {
        const pick = await dialog.showOpenDialog({ title: 'Ordner wählen…', properties: ['openDirectory', 'createDirectory'] })
        if (pick.canceled || !pick.filePaths?.[0]) throw new Error('Abbruch')
        const chosen = pick.filePaths[0]
        const dbPath = path.join(chosen, 'database.sqlite')
        const hasDb = fs.existsSync(dbPath)
        const filesDir = path.join(chosen, 'files')
        return { root: chosen, hasDb, dbPath, filesDir }
    })

    // DB location: migrate to a specific folder (copy-overwrite)
    ipcMain.handle('db.location.migrateTo', async (_e, payload: any) => {
        const { root } = payload || {}
        if (!root || typeof root !== 'string') throw new Error('Kein Zielordner angegeben')
        const res = migrateToRoot(root, 'copy-overwrite')
        const d = getDb()
        try { applyMigrations(d as any) } catch { }
        return { ok: true, ...res }
    })

    // DB location: use a specific folder that already contains database.sqlite (no copy)
    ipcMain.handle('db.location.useFolder', async (_e, payload: any) => {
        const { root } = payload || {}
        if (!root || typeof root !== 'string') throw new Error('Kein Zielordner angegeben')
        const res = migrateToRoot(root, 'use')
        const d = getDb()
        try { applyMigrations(d as any) } catch { }
        return { ok: true, ...res }
    })

    // DB location: pick a new folder and migrate (copy-overwrite)
    ipcMain.handle('db.location.chooseAndMigrate', async () => {
        const pick = await dialog.showOpenDialog({ title: 'Ordner für Datenbank wählen', properties: ['openDirectory', 'createDirectory'] })
        if (pick.canceled || !pick.filePaths?.[0]) throw new Error('Abbruch')
        const chosen = pick.filePaths[0]
        const res = migrateToRoot(chosen, 'copy-overwrite')
        // Reopen DB to ensure app uses new file immediately
        const d = getDb()
        try { applyMigrations(d as any) } catch { }
        return { ok: true, ...res }
    })

    // DB location: use existing folder with an existing database.sqlite (no copy)
    ipcMain.handle('db.location.useExisting', async () => {
        const pick = await dialog.showOpenDialog({ title: 'Bestehende Datenbank auswählen (Ordner)', properties: ['openDirectory'] })
        if (pick.canceled || !pick.filePaths?.[0]) throw new Error('Abbruch')
        const chosen = pick.filePaths[0]
        const res = migrateToRoot(chosen, 'use')
        const d = getDb()
        try { applyMigrations(d as any) } catch { }
        return { ok: true, ...res }
    })

    // DB location: reset to default (userData)
    ipcMain.handle('db.location.resetDefault', async () => {
        writeAppConfig({ ...readAppConfig(), dbRoot: undefined })
        const info = getCurrentDbInfo()
        // Reopen default DB
        const d = getDb()
        try { applyMigrations(d as any) } catch { }
        return { ok: true, ...info }
    })

    // Smart restore preview: compare current configured DB vs default userData DB
    ipcMain.handle('db.smartRestore.preview', async () => {
        const currentInfo = getCurrentDbInfo()
        const defaultInfo = getDefaultDbInfo()
        function statOrNull(p: string) {
            try { return fs.statSync(p) } catch { return null }
        }
        const curStat = statOrNull(currentInfo.dbPath)
        const defStat = statOrNull(defaultInfo.dbPath)
        const curInspect = curStat ? inspectBackupDetailed(currentInfo.dbPath) : { ok: false }
        const defInspect = defStat ? inspectBackupDetailed(defaultInfo.dbPath) : { ok: false }
        // Recommendation heuristic:
        // 1) If default exists and current does NOT -> useDefault
        // 2) If both exist: compare last voucher date then mtime fallback
        // 3) If default missing -> migrateToDefault
        let recommendation: 'useDefault' | 'migrateToDefault' | 'manual' = 'manual'
        if (defStat && !curStat) recommendation = 'useDefault'
        else if (!defStat && curStat) recommendation = 'migrateToDefault'
        else if (defStat && curStat) {
            const lvCur = curInspect.last?.voucher || curInspect.last?.audit || null
            const lvDef = defInspect.last?.voucher || defInspect.last?.audit || null
            if (lvCur && lvDef) recommendation = lvCur > lvDef ? 'migrateToDefault' : 'useDefault'
            else if (lvCur && !lvDef) recommendation = 'migrateToDefault'
            else if (!lvCur && lvDef) recommendation = 'useDefault'
            else {
                // Fallback to mtime
                const mCur = curStat?.mtimeMs || 0
                const mDef = defStat?.mtimeMs || 0
                recommendation = mCur > mDef ? 'migrateToDefault' : 'useDefault'
            }
        }
        return DbSmartRestorePreviewOutput.parse({
            current: { root: currentInfo.root, dbPath: currentInfo.dbPath, exists: !!curStat, mtime: curStat?.mtimeMs ?? null, counts: curInspect.counts, last: curInspect.last },
            default: { root: defaultInfo.root, dbPath: defaultInfo.dbPath, exists: !!defStat, mtime: defStat?.mtimeMs ?? null, counts: defInspect.counts, last: defInspect.last },
            recommendation
        })
    })

    // Smart restore apply
    ipcMain.handle('db.smartRestore.apply', async (_e, payload) => {
        const parsed = DbSmartRestoreApplyInput.parse(payload)
        const { action } = parsed
        const currentInfo = getCurrentDbInfo()
        const defaultInfo = getDefaultDbInfo()
        if (action === 'useDefault') {
            // Point config to default, do not copy current over
            writeAppConfig({ ...readAppConfig(), dbRoot: undefined })
            // Close any open DB and reopen default
            try { closeDb() } catch { }
            const d = getDb()
            try { applyMigrations(d as any) } catch { }
            return DbSmartRestoreApplyOutput.parse({ ok: true })
        } else if (action === 'migrateToDefault') {
            // Copy current DB + attachments to default, then reset config
            try {
                // Close current DB first
                try { closeDb() } catch { }
                // Ensure default dirs exist
                if (!fs.existsSync(defaultInfo.root)) fs.mkdirSync(defaultInfo.root, { recursive: true })
                if (!fs.existsSync(defaultInfo.filesDir)) fs.mkdirSync(defaultInfo.filesDir, { recursive: true })
                // Copy DB file
                fs.copyFileSync(currentInfo.dbPath, defaultInfo.dbPath)
                // Copy attachments (voucher_files file paths adjustment not required; they store absolute paths currently updated by migrateToRoot. For simplicity we leave as-is if absolute.)
                try {
                    const files = fs.readdirSync(path.join(currentInfo.root, 'files'))
                    for (const f of files) {
                        const src = path.join(currentInfo.root, 'files', f)
                        const dst = path.join(defaultInfo.filesDir, f)
                        try { if (!fs.existsSync(dst)) fs.copyFileSync(src, dst) } catch { }
                    }
                } catch { /* ignore */ }
                // Point config to default
                writeAppConfig({ ...readAppConfig(), dbRoot: undefined })
                // Reopen DB
                const d = getDb()
                try { applyMigrations(d as any) } catch { }
                return DbSmartRestoreApplyOutput.parse({ ok: true })
            } catch (e: any) {
                throw new Error('Migration zum Standard fehlgeschlagen: ' + (e?.message || String(e)))
            }
        }
        return DbSmartRestoreApplyOutput.parse({ ok: false })
    })

    // Tags CRUD
    ipcMain.handle('tags.list', async (_e, payload) => {
        const parsed = TagsListInput.parse(payload)
        const rows = listTags(parsed ?? undefined) as any
        return TagsListOutput.parse({ rows })
    })
    ipcMain.handle('tags.upsert', async (_e, payload) => {
        const parsed = TagUpsertInput.parse(payload)
        const res = upsertTag(parsed)
        return TagUpsertOutput.parse({ id: res.id })
    })
    ipcMain.handle('tags.delete', async (_e, payload) => {
        const parsed = TagDeleteInput.parse(payload)
        const res = deleteTag(parsed.id)
        return TagDeleteOutput.parse(res)
    })
    ipcMain.handle('tags.usage', async (_e, payload) => {
        const parsed = TagUsageInput.parse(payload)
        const res = tagUsage(parsed.tagId)
        return TagUsageOutput.parse(res)
    })

    // Audit: recent actions
    ipcMain.handle('audit.recent', async (_e, payload) => {
        const parsed = AuditRecentInput.parse(payload) ?? { limit: 20 }
        const rows = listRecentAudit(parsed.limit)
        return AuditRecentOutput.parse({ rows })
    })

    // Members
    ipcMain.handle('members.list', async (_e, payload) => {
        const parsed = MembersListInput.parse(payload) ?? { limit: 50 }
        const { rows, total } = listMembers(parsed as any)
        return MembersListOutput.parse({ rows, total })
    })
    ipcMain.handle('members.create', async (_e, payload) => {
        const parsed = MemberCreateInput.parse(payload)
        const res = createMember(parsed as any)
        return MemberCreateOutput.parse(res)
    })
    ipcMain.handle('members.update', async (_e, payload) => {
        const parsed = MemberUpdateInput.parse(payload)
        const res = updateMember(parsed as any)
        return MemberUpdateOutput.parse(res)
    })
    ipcMain.handle('members.delete', async (_e, payload) => {
        const parsed = MemberDeleteInput.parse(payload)
        const res = deleteMember(parsed.id)
        return MemberDeleteOutput.parse(res)
    })
    ipcMain.handle('members.get', async (_e, payload) => {
        const parsed = MemberGetInput.parse(payload)
        const res = getMemberById(parsed.id)
        return MemberGetOutput.parse(res)
    })

    // Members export (Excel/PDF)
    ipcMain.handle('members.export', async (_e, payload: MembersExportOptions) => {
        const result = await exportMembers(payload)
        return result
    })

    // Membership payments
    ipcMain.handle('payments.listDue', async (_e, payload) => {
        const parsed = PaymentsListDueInput.parse(payload)
        const res = mp.listDue(parsed as any)
        return PaymentsListDueOutput.parse(res as any)
    })
    ipcMain.handle('payments.markPaid', async (_e, payload) => {
        const parsed = PaymentsMarkPaidInput.parse(payload)
        const res = mp.markPaid(parsed as any)
        return PaymentsMarkPaidOutput.parse(res as any)
    })
    ipcMain.handle('payments.unmark', async (_e, payload) => {
        const parsed = PaymentsUnmarkInput.parse(payload)
        const res = mp.unmark(parsed as any)
        return PaymentsUnmarkOutput.parse(res as any)
    })
    ipcMain.handle('payments.suggestVouchers', async (_e, payload) => {
        const parsed = PaymentsSuggestVouchersInput.parse(payload)
        const res = mp.suggestVouchers(parsed as any)
        return PaymentsSuggestVouchersOutput.parse(res as any)
    })
    ipcMain.handle('payments.status', async (_e, payload) => {
        const res = mp.status(payload as any)
        return res as any
    })
    ipcMain.handle('payments.history', async (_e, payload) => {
        const res = mp.history(payload as any)
        return res as any
    })

    // Year-end (Jahresabschluss)
    ipcMain.handle('yearEnd.preview', async (_e, payload) => {
        const parsed = YearEndPreviewInput.parse(payload)
        const res = await yearEnd.preview(parsed.year)
        return YearEndPreviewOutput.parse(res as any)
    })
    ipcMain.handle('yearEnd.export', async (_e, payload) => {
        const parsed = YearEndExportInput.parse(payload)
        const res = await yearEnd.exportPackage(parsed.year)
        return YearEndExportOutput.parse(res as any)
    })
    ipcMain.handle('yearEnd.close', async (_e, payload) => {
        const parsed = YearEndCloseInput.parse(payload)
        // Safety: create a backup before locking a period
        try { await backup.makeBackup('preClose') } catch { /* ignore backup errors */ }
        const res = yearEnd.closeYear(parsed.year)
        return YearEndCloseOutput.parse(res as any)
    })
    ipcMain.handle('yearEnd.reopen', async (_e, payload) => {
        const parsed = YearEndReopenInput.parse(payload)
        const res = yearEnd.reopenAfter(parsed.year)
        return YearEndReopenOutput.parse(res as any)
    })
    ipcMain.handle('yearEnd.status', async () => {
        const res = yearEnd.status()
        return YearEndStatusOutput.parse(res as any)
    })

    // ── Cash checks (Kassenprüfung) ──────────────────────────
    ipcMain.handle('cashChecks.list', async (_e, payload) => {
        const parsed = CashChecksListInput.parse(payload)
        const res = listCashChecks({ year: parsed.year })
        return CashChecksListOutput.parse(res)
    })
    ipcMain.handle('cashChecks.create', async (_e, payload) => {
        const parsed = CashChecksCreateInput.parse(payload)
        const res = createCashCheck(parsed as any)
        return CashChecksCreateOutput.parse(res)
    })
    ipcMain.handle('cashChecks.setInspectors', async (_e, payload) => {
        const parsed = CashChecksSetInspectorsInput.parse(payload)
        const res = setCashCheckInspectors(parsed as any)
        return CashChecksSetInspectorsOutput.parse(res)
    })
    ipcMain.handle('cashChecks.exportPdf', async (_e, payload) => {
        const parsed = CashChecksExportPdfInput.parse(payload)
        const res = await generateCashCheckPDF({ cashCheckId: parsed.id })
        return CashChecksExportPdfOutput.parse(res)
    })
    ipcMain.handle('cashChecks.getInspectorDefaults', async () => {
        const res = getCashCheckInspectorDefaults()
        return CashChecksGetInspectorDefaultsOutput.parse(res)
    })

    // Work queue (dashboard): lightweight summary counts
    ipcMain.handle('workQueue.summary', async () => {
        try {
            const d = getDb()
            const rowA = d.prepare("SELECT COUNT(1) as c FROM vouchers v WHERE (SELECT COUNT(1) FROM voucher_files vf WHERE vf.voucher_id = v.id) = 0").get() as any
            const unlinkedReceiptsCount = Number(rowA?.c || 0)
            const st = yearEnd.status()
            let lockedEntriesCount = 0
            if (st?.closedUntil) {
                const r = d.prepare('SELECT COUNT(1) as c FROM vouchers WHERE date <= ?').get(st.closedUntil) as any
                lockedEntriesCount = Number(r?.c || 0)
            }
            return { ok: true, unlinkedReceiptsCount, lockedEntriesCount }
        } catch (e: any) {
            return { ok: false, error: e?.message || String(e) }
        }
    })

    // Invoices
    ipcMain.handle('invoices.create', async (_e, payload) => {
        const parsed = InvoiceCreateInput.parse(payload)
        const res = createInvoice(parsed as any)
        return InvoiceCreateOutput.parse(res)
    })
    ipcMain.handle('invoices.update', async (_e, payload) => {
        const parsed = InvoiceUpdateInput.parse(payload)
        const res = updateInvoice(parsed as any)
        return InvoiceUpdateOutput.parse(res)
    })
    ipcMain.handle('invoices.delete', async (_e, payload) => {
        const parsed = InvoiceDeleteInput.parse(payload)
        const res = deleteInvoice(parsed.id)
        return InvoiceDeleteOutput.parse(res)
    })
    ipcMain.handle('invoices.list', async (_e, payload) => {
        const parsed = InvoicesListInput.parse(payload) ?? {}
        const { rows, total } = listInvoicesPaged(parsed as any)
        return InvoicesListOutput.parse({ rows, total })
    })
    ipcMain.handle('invoices.summary', async (_e, payload) => {
        const parsed = InvoicesSummaryInput.parse(payload) ?? {}
        const res = summarizeInvoices(parsed as any)
        return InvoicesSummaryOutput.parse(res as any)
    })
    ipcMain.handle('invoices.get', async (_e, payload) => {
        const parsed = InvoiceByIdInput.parse(payload)
        const res = getInvoiceById(parsed.id)
        return InvoiceByIdOutput.parse(res as any)
    })
    ipcMain.handle('invoices.addPayment', async (_e, payload) => {
        const parsed = InvoiceAddPaymentInput.parse(payload)
        const res = addPayment(parsed)
        return InvoiceAddPaymentOutput.parse(res as any)
    })
    ipcMain.handle('invoices.markPaid', async (_e, payload) => {
        const parsed = InvoiceByIdInput.parse(payload)
        const res = markPaid(parsed.id)
        return InvoiceAddPaymentOutput.parse(res as any)
    })
    ipcMain.handle('invoices.postToVoucher', async (_e, payload) => {
        const parsed = InvoicePostToVoucherInput.parse(payload)
        const res = postInvoiceToVoucher(parsed.invoiceId)
        return InvoicePostToVoucherOutput.parse(res)
    })

    // Invoice files: open/save/read
    ipcMain.handle('invoiceFiles.open', async (_e, payload) => {
        const parsed = AttachmentOpenInput.parse(payload)
        const f = getInvoiceFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const pathBase = path.basename(f.filePath || '')
        let src = f.filePath
        try { if (!fs.existsSync(src)) { const alt = path.join(getAppDataDir().filesDir, pathBase); if (fs.existsSync(alt)) src = alt } } catch { }
        const res = await shell.openPath(src)
        const ok = !res
        return AttachmentOpenOutput.parse({ ok })
    })
    ipcMain.handle('invoiceFiles.saveAs', async (_e, payload) => {
        const parsed = AttachmentSaveAsInput.parse(payload)
        const f = getInvoiceFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const save = await dialog.showSaveDialog({ title: 'Datei speichern unter …', defaultPath: f.fileName })
        if (save.canceled || !save.filePath) throw new Error('Abbruch')
        const pathBase = path.basename(f.filePath || '')
        let src = f.filePath
        if (!src || !fs.existsSync(src)) {
            const alt = path.join(getAppDataDir().filesDir, pathBase)
            if (fs.existsSync(alt)) src = alt
        }
        if (!src || !fs.existsSync(src)) throw new Error('Quelldatei nicht gefunden: ' + (f.filePath || pathBase))
        fs.copyFileSync(src, save.filePath)
        return AttachmentSaveAsOutput.parse({ filePath: save.filePath })
    })
    ipcMain.handle('invoiceFiles.read', async (_e, payload) => {
        const parsed = AttachmentReadInput.parse(payload)
        const f = getInvoiceFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const pathBase = path.basename(f.filePath || '')
        let src = f.filePath
        if (!src || !fs.existsSync(src)) {
            const alt = path.join(getAppDataDir().filesDir, pathBase)
            if (fs.existsSync(alt)) src = alt
        }
        if (!src || !fs.existsSync(src)) throw new Error('Quelldatei nicht gefunden: ' + (f.filePath || pathBase))
        const buff = fs.readFileSync(src)
        const dataBase64 = Buffer.from(buff).toString('base64')
        return AttachmentReadOutput.parse({ fileName: f.fileName, mimeType: f.mimeType || undefined, dataBase64 })
    })

    // Invoice files CRUD for edit modal
    ipcMain.handle('invoiceFiles.list', async (_e, payload) => {
        const parsed = InvoiceFilesListInput.parse(payload)
        const files = listFilesForInvoice(parsed.invoiceId)
        return InvoiceFilesListOutput.parse({ files: files.map(f => ({ id: f.id, fileName: f.fileName, mimeType: f.mimeType ?? null, size: f.size ?? null, createdAt: f.createdAt ?? null })) })
    })
    ipcMain.handle('invoiceFiles.add', async (_e, payload) => {
        const parsed = InvoiceFileAddInput.parse(payload)
        const res = addFileToInvoice(parsed.invoiceId, parsed.fileName, parsed.dataBase64, parsed.mimeType)
        return InvoiceFileAddOutput.parse(res)
    })
    ipcMain.handle('invoiceFiles.delete', async (_e, payload) => {
        const parsed = InvoiceFileDeleteInput.parse(payload)
        const res = deleteInvoiceFile(parsed.fileId)
        return InvoiceFileDeleteOutput.parse(res)
    })

    // Settings: simple key/value
    ipcMain.handle('settings.get', async (_e, payload) => {
        const parsed = SettingsGetInput.parse(payload)
        const value = getSetting(parsed.key)
        return SettingsGetOutput.parse({ value })
    })
    ipcMain.handle('settings.set', async (_e, payload) => {
        const parsed = SettingsSetInput.parse(payload)
        setSetting(parsed.key, parsed.value)
        return SettingsSetOutput.parse({ ok: true })
    })

    // Tax Exemption Certificate
    ipcMain.handle('taxExemption.get', async () => {
        const certificate = getTaxExemptionCertificate()
        return TaxExemptionGetOutput.parse({ certificate })
    })
    ipcMain.handle('taxExemption.save', async (_e, payload) => {
        const parsed = TaxExemptionSaveInput.parse(payload)
        const certificate = {
            fileName: parsed.fileName,
            uploadDate: new Date().toISOString(),
            validFrom: parsed.validFrom,
            validUntil: parsed.validUntil,
            fileData: parsed.fileData,
            mimeType: parsed.mimeType,
            fileSize: parsed.fileSize
        }
        saveTaxExemptionCertificate(certificate)
        return TaxExemptionSaveOutput.parse({ ok: true })
    })
    ipcMain.handle('taxExemption.delete', async () => {
        deleteTaxExemptionCertificate()
        return TaxExemptionDeleteOutput.parse({ ok: true })
    })
    ipcMain.handle('taxExemption.updateValidity', async (_e, payload) => {
        const parsed = TaxExemptionUpdateValidityInput.parse(payload)
        updateTaxExemptionValidity(parsed.validFrom, parsed.validUntil)
        return TaxExemptionUpdateValidityOutput.parse({ ok: true })
    })

    ipcMain.handle('donations.exportMoneyReceipt', async (_e, payload) => {
        const parsed = DonationsExportMoneyReceiptInput.parse(payload)
        const res = await exportMoneyDonationReceiptPdf(parsed)
        return DonationsExportMoneyReceiptOutput.parse(res)
    })

    // Backups: make/list/openFolder
    ipcMain.handle('backup.make', async (_e, payload?: { reason?: string }) => {
        try {
            const res = await backup.makeBackup(payload?.reason)
            return { ok: true, filePath: res.filePath }
        } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })
    ipcMain.handle('backup.list', async () => {
        try { return { ok: true, ...backup.listBackups() } } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })
    ipcMain.handle('backup.openFolder', async () => {
        try { return await backup.openBackupFolder() } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })
    ipcMain.handle('backup.getDir', async () => {
        try { return { ok: true, dir: backup.getBackupDir() } } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })
    ipcMain.handle('backup.setDir', async () => {
        try {
            const pick = await dialog.showOpenDialog({ title: 'Backup-Ordner wählen…', properties: ['openDirectory', 'createDirectory'] })
            if (pick.canceled || !pick.filePaths?.[0]) throw new Error('Abbruch')
            const res = backup.setBackupDirWithMigration(pick.filePaths[0])
            return { ok: res.ok, dir: res.dir, moved: (res as any).moved }
        } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })
    ipcMain.handle('backup.resetDir', async () => {
        try { const res = backup.setBackupDirWithMigration(null); return { ok: res.ok, dir: res.dir, moved: (res as any).moved } } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })
    ipcMain.handle('backup.inspect', async (_e, payload: { filePath: string }) => {
        try { return backup.inspectBackup(payload.filePath) } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })
    ipcMain.handle('backup.inspectCurrent', async () => {
        try { return backup.inspectCurrent() } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })
    ipcMain.handle('backup.restore', async (_e, payload: { filePath: string }) => {
        try { return backup.restoreBackup(payload.filePath) } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })

    // Shell helpers: reveal exported files or open folders
    ipcMain.handle('shell.showItemInFolder', async (_e, payload: { fullPath: string }) => {
        try { shell.showItemInFolder(payload.fullPath); return { ok: true } } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })
    ipcMain.handle('shell.openPath', async (_e, payload: { fullPath: string }) => {
        try { const res = await shell.openPath(payload.fullPath); return { ok: !res, error: res || null } } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })
    ipcMain.handle('shell.openExternal', async (_e, payload: { url: string }) => {
        try { await shell.openExternal(payload.url); return { ok: true } } catch (e: any) { return { ok: false, error: e?.message || String(e) } }
    })

    // Members: quick letter generation (RTF) and open
    ipcMain.handle('members.writeLetter', async (_e, payload: { id?: number; name: string; address?: string | null; memberNo?: string | null }) => {
        try {
            // If no address provided from renderer, try to load from DB by id
            let effectiveAddress = (payload.address || '')
            if ((!effectiveAddress || !effectiveAddress.trim()) && payload.id) {
                try {
                    const m = getMemberById(Number(payload.id))
                    if (m?.address) effectiveAddress = String(m.address)
                } catch { /* ignore */ }
            }
            // Prepare address block (top-left): Name, then street, then "ZIP City"
            const rawAddr = (effectiveAddress || '').trim()
            let street = '', zipCity = ''
            if (rawAddr) {
                const idx = rawAddr.lastIndexOf(',')
                if (idx >= 0) { street = rawAddr.slice(0, idx).trim(); zipCity = rawAddr.slice(idx + 1).trim() }
                else { street = rawAddr }
            }

            // Build current date (German locale)
            const today = new Date()
            const datePretty = today.toLocaleDateString('de-DE', { day: 'numeric', month: 'long', year: 'numeric' })
            // Try to extract city from address (expecting "Straße, PLZ Ort")
            let city = ''
            if (zipCity) {
                const m = /^(?:\d{4,5}\s+)?(.+)$/.exec(zipCity || '')
                city = (m?.[1] || '').trim()
            }
            const dateLine = (city ? (city + ', ') : '') + datePretty

            // Simple letter body with placeholders (use real umlauts; encoder will convert)
            const subjectPlaceholder = '<<Betreff eintragen>>'
            const bodyParas = [
                `Sehr geehrte/r ${payload.name},`,
                'wir kontaktieren Sie bezüglich Ihrer Mitgliedsbeiträge.',
                'Bitte melden Sie sich bei Rückfragen.',
                'Mit freundlichen Grüßen',
                'Ihr Verein'
            ]

            // RTF helpers: escape control chars and encode non-ASCII as Unicode escapes
            function rtfUnicodeEncode(s: string): string {
                const map: Record<string, string> = { 'ä': "\\u228?", 'ö': "\\u246?", 'ü': "\\u252?", 'Ä': "\\u196?", 'Ö': "\\u214?", 'Ü': "\\u220?", 'ß': "\\u223?" }
                let out = ''
                for (const ch of s) {
                    if (ch === '\\' || ch === '{' || ch === '}') { out += '\\' + ch; continue }
                    const code = ch.codePointAt(0) as number
                    if (code < 128) { out += ch } else if (map[ch]) { out += map[ch] } else {
                        // RTF expects signed 16-bit for \uN; clamp
                        const signed = ((code & 0xFFFF) > 0x7FFF) ? (code & 0xFFFF) - 0x10000 : (code & 0xFFFF)
                        out += `\\u${signed}?`
                    }
                }
                return out
            }

            // Determine salutation
            const name = payload.name || ''
            const lastName = (() => { const parts = name.trim().split(/\s+/); return parts.length ? parts[parts.length - 1] : name })()
            const hasHerr = /\bHerr\b/i.test(name)
            const hasFrau = /\bFrau\b/i.test(name)
            const salutation = hasHerr ? `Sehr geehrter Herr ${lastName},` : hasFrau ? `Sehr geehrte Frau ${lastName},` : `Sehr geehrte/r ${name},`

            // Minimal, Word-compatible RTF with margins and font table
            const rtf = [
                '{\\rtf1\\ansi\\ansicpg1252\\deff0\\uc1',
                '{\\fonttbl{\\f0 Arial;}}',
                '\\paperw11906\\paperh16838\\margl1134\\margr1134\\margt1134\\margb1134', // ~2cm margins
                '\\fs22',
                // Address block (top-left) with real RTF line breaks
                '{\\pard ' + rtfUnicodeEncode(payload.name || '')
                    + (street ? ' \\line ' + rtfUnicodeEncode(street) : '')
                    + (zipCity ? ' \\line ' + rtfUnicodeEncode(zipCity) : '')
                    + ' \\par}\\par',
                // Subject (bold)
                '{\\pard\\b ' + rtfUnicodeEncode('Betreff: ' + subjectPlaceholder) + ' \\b0 \\par}',
                // City + Pretty Date
                '{\\pard ' + rtfUnicodeEncode(dateLine) + ' \\par}\\par',
                // Salutation and body paragraphs
                '{\\pard ' + rtfUnicodeEncode(salutation) + ' \\par}\\par',
                '{\\pard ' + rtfUnicodeEncode('wir wenden uns an Sie bezüglich Ihrer Mitgliedsbeiträge im Verein.') + ' \\par}\\par',
                '{\\pard ' + rtfUnicodeEncode('Falls Sie Fragen oder Unklarheiten haben, melden Sie sich bitte bei uns. Wir stehen Ihnen gerne zur Verfügung.') + ' \\par}\\par',
                '{\\pard ' + rtfUnicodeEncode('Mit freundlichen Grüßen') + ' \\par}',
                '{\\pard ' + rtfUnicodeEncode('Ihr Vereinsvorstand') + ' \\par}',
                '}'
            ].join('\n')

            const os = process.platform
            const tmpDir = os === 'win32' ? (process.env.TEMP || process.env.TMP || '.') : (process.env.TMPDIR || '/tmp')
            const fname = `Mitglied_${(payload.memberNo || payload.name || 'Brief').toString().replace(/[^a-zA-Z0-9_-]+/g,'_')}_${Date.now()}.rtf`
            const fullPath = path.join(tmpDir, fname)
            // Write as ASCII-safe string (contains only ASCII and RTF escapes), avoid UTF-8 BOM issues
            fs.writeFileSync(fullPath, rtf, 'ascii')
            await shell.openPath(fullPath)
            return { ok: true, filePath: fullPath }
        } catch (e: any) {
            return { ok: false, error: e?.message || String(e) }
        }
    })

    // ============= SUBMISSIONS =============
    // List submissions
    ipcMain.handle('submissions.list', async (_e, payload) => {
        const parsed = SubmissionsListInput.parse(payload)
        const db = getDb()
        const repo = createSubmissionsRepository(db)
        const result = repo.list(parsed || {})
        return SubmissionsListOutput.parse(result)
    })

    // Get single submission
    ipcMain.handle('submissions.get', async (_e, payload) => {
        const parsed = SubmissionGetInput.parse(payload)
        const db = getDb()
        const repo = createSubmissionsRepository(db)
        const result = repo.get(parsed.id)
        return SubmissionGetOutput.parse(result)
    })

    // Import submissions from JSON
    ipcMain.handle('submissions.import', async (_e, payload) => {
        const parsed = SubmissionsImportInput.parse(payload)
        const db = getDb()
        const repo = createSubmissionsRepository(db)
        const result = repo.import(parsed)
        return SubmissionsImportOutput.parse(result)
    })

    // Export category catalog for the public submission web form
    ipcMain.handle('submissions.exportCatalog', async () => {
        const activeOrg = getActiveOrganization()
        const bindings = listBindings({ activeOnly: true })
        const budgets = listBudgets({ includeArchived: false } as any)
        const tags = listTags({})
        const bindingById = new Map(bindings.map((binding: any) => [binding.id, binding]))

        const labelForBudget = (budget: any) => {
            if (budget.name && String(budget.name).trim()) return String(budget.name).trim()
            if (budget.categoryName && String(budget.categoryName).trim()) return `${budget.year} - ${budget.categoryName}`
            if (budget.projectName && String(budget.projectName).trim()) return `${budget.year} - ${budget.projectName}`
            if (budget.earmarkId) {
                const binding = bindingById.get(budget.earmarkId)
                if (binding) return `${budget.year} - ${binding.code} ${binding.name}`
            }
            return `Budget ${budget.year}`
        }

        const paymentAccounts = listPaymentAccounts({ activeOnly: true })
        const iconForPaymentAccountKind = (kind?: string | null) => {
            switch (kind) {
                case 'CASH': return '💵'
                case 'BANK': return '🏦'
                case 'PAYPAL': return '💳'
                case 'CARD': return '💳'
                default: return '💳'
            }
        }
        const paymentMethodOptions = [
            { id: 'BAR', label: 'Bar', icon: '💵', paymentMethod: 'BAR' },
            { id: 'BANK', label: 'Bank', icon: '🏦', paymentMethod: 'BANK' }
        ]

        const exportData = {
            type: 'vereino-submission-catalog',
            version: '1.1',
            exportedAt: new Date().toISOString(),
            organization: activeOrg ? {
                id: activeOrg.id,
                name: activeOrg.name
            } : null,
            paymentMethods: paymentMethodOptions,
            paymentAccounts: paymentAccounts.map((account: any) => ({
                id: account.id,
                name: account.name,
                label: account.name,
                icon: iconForPaymentAccountKind(account.kind),
                paymentMethod: account.kind === 'CASH' ? 'BAR' : 'BANK',
                kind: account.kind,
                color: account.color ?? null,
                iban: account.iban ?? null
            })),
            categories: {
                budgets: budgets.map((budget: any) => ({
                    id: budget.id,
                    label: labelForBudget(budget),
                    year: budget.year,
                    sphere: budget.sphere,
                    amountPlanned: budget.amountPlanned,
                    startDate: budget.startDate ?? null,
                    endDate: budget.endDate ?? null,
                    color: budget.color ?? null
                })),
                earmarks: bindings.map((binding: any) => ({
                    id: binding.id,
                    code: binding.code,
                    name: binding.name,
                    label: `${binding.code} - ${binding.name}`,
                    startDate: binding.startDate ?? null,
                    endDate: binding.endDate ?? null,
                    color: binding.color ?? null
                })),
                tags: tags.map((tag: any) => ({
                    id: tag.id,
                    name: tag.name,
                    color: tag.color ?? null
                }))
            }
        }

        const orgPart = (activeOrg?.name || 'verein').replace(/[^a-zA-Z0-9_-]+/g, '_')
        const date = new Date().toISOString().slice(0, 10)
        const save = await dialog.showSaveDialog({
            title: 'Webformular-Kategorien exportieren',
            defaultPath: `${orgPart}-${date}.vereino-catalog.json`,
            filters: [{ name: 'VereinO Webformular-Kategorien', extensions: ['vereino-catalog.json', 'json'] }]
        })
        if (save.canceled || !save.filePath) {
            return SubmissionsExportCatalogOutput.parse({ filePath: '' })
        }

        fs.writeFileSync(save.filePath, JSON.stringify(exportData, null, 2), 'utf-8')
        return SubmissionsExportCatalogOutput.parse({ filePath: save.filePath })
    })

    // Import submissions from file picker
    ipcMain.handle('submissions.importFromFile', async () => {
        const result = await dialog.showOpenDialog({
            title: 'Einreichungen importieren',
            filters: [
                { name: 'Einreichungen', extensions: ['vereino-submission.json', 'json'] }
            ],
            properties: ['openFile', 'multiSelections']
        })
        if (result.canceled || !result.filePaths.length) {
            return { imported: 0, ids: [] }
        }

        const allSubmissions: any[] = []
        for (const filePath of result.filePaths) {
            try {
                const content = fs.readFileSync(filePath, 'utf-8')
                const data = JSON.parse(content)
                if (Array.isArray(data.submissions)) {
                    // Transform web-app format to internal format
                    const transformed = data.submissions.map((sub: any) => ({
                        externalId: sub.externalId || sub.id,
                        date: sub.date,
                        type: sub.type || 'OUT',
                        sphere: sub.sphere || null,
                        paymentMethod: sub.paymentMethod || null,
                        description: sub.description,
                        grossAmount: sub.grossAmount,
                        categoryHint: sub.categoryHint,
                        counterparty: sub.counterparty,
                        budgetId: sub.budgetId ?? sub.budget?.id ?? null,
                        budgetLabel: sub.budgetLabel ?? sub.budget?.label ?? null,
                        earmarkId: sub.earmarkId ?? sub.earmark?.id ?? null,
                        earmarkLabel: sub.earmarkLabel ?? sub.earmark?.label ?? (sub.earmark ? [sub.earmark.code, sub.earmark.name].filter(Boolean).join(' - ') : null),
                        tags: Array.isArray(sub.tags) ? sub.tags.map((tag: any) => typeof tag === 'string' ? tag : tag?.name).filter(Boolean) : [],
                        submittedBy: sub.submittedBy,
                        submittedAt: sub.submittedAt,
                        // Convert single attachment to attachments array
                        attachments: sub.attachment ? [{
                            filename: sub.attachment.name,
                            mimeType: sub.attachment.mimeType,
                            data: sub.attachment.dataBase64
                        }] : (sub.attachments || []).map((att: any) => ({
                            filename: att.filename || att.name,
                            mimeType: att.mimeType,
                            data: att.data || att.dataBase64
                        }))
                    }))
                    allSubmissions.push(...transformed)
                } else if (data.date && data.grossAmount) {
                    // Single submission format
                    const sub = data
                    allSubmissions.push({
                        externalId: sub.externalId || sub.id,
                        date: sub.date,
                        type: sub.type || 'OUT',
                        sphere: sub.sphere || null,
                        paymentMethod: sub.paymentMethod || null,
                        description: sub.description,
                        grossAmount: sub.grossAmount,
                        categoryHint: sub.categoryHint,
                        counterparty: sub.counterparty,
                        budgetId: sub.budgetId ?? sub.budget?.id ?? null,
                        budgetLabel: sub.budgetLabel ?? sub.budget?.label ?? null,
                        earmarkId: sub.earmarkId ?? sub.earmark?.id ?? null,
                        earmarkLabel: sub.earmarkLabel ?? sub.earmark?.label ?? (sub.earmark ? [sub.earmark.code, sub.earmark.name].filter(Boolean).join(' - ') : null),
                        tags: Array.isArray(sub.tags) ? sub.tags.map((tag: any) => typeof tag === 'string' ? tag : tag?.name).filter(Boolean) : [],
                        submittedBy: sub.submittedBy,
                        submittedAt: sub.submittedAt,
                        attachments: sub.attachment ? [{
                            filename: sub.attachment.name,
                            mimeType: sub.attachment.mimeType,
                            data: sub.attachment.dataBase64
                        }] : []
                    })
                }
            } catch (e) {
                console.error(`Failed to parse submission file: ${filePath}`, e)
            }
        }

        if (allSubmissions.length === 0) {
            return { imported: 0, ids: [] }
        }

        const db = getDb()
        const repo = createSubmissionsRepository(db)
        const importResult = repo.import({ submissions: allSubmissions })
        return SubmissionsImportOutput.parse(importResult)
    })

    // Approve submission
    ipcMain.handle('submissions.approve', async (_e, payload) => {
        const parsed = SubmissionApproveInput.parse(payload)
        const db = getDb()
        const repo = createSubmissionsRepository(db)
        const result = repo.approve(parsed.id, { reviewerNotes: parsed.reviewerNotes })
        if (result.ok && parsed.voucherId) {
            repo.linkToVoucher(parsed.id, parsed.voucherId)
        }
        return SubmissionApproveOutput.parse(result)
    })

    // Reject submission
    ipcMain.handle('submissions.reject', async (_e, payload) => {
        const parsed = SubmissionRejectInput.parse(payload)
        const db = getDb()
        const repo = createSubmissionsRepository(db)
        const result = repo.reject(parsed.id, { reviewerNotes: parsed.reviewerNotes })
        return SubmissionRejectOutput.parse(result)
    })

    // Delete submission
    ipcMain.handle('submissions.delete', async (_e, payload) => {
        const parsed = SubmissionDeleteInput.parse(payload)
        const db = getDb()
        const repo = createSubmissionsRepository(db)
        const result = repo.delete(parsed.id)
        return SubmissionDeleteOutput.parse(result)
    })

    // Convert approved submission to voucher
    ipcMain.handle('submissions.convert', async (_e, payload) => {
        const parsed = SubmissionConvertInput.parse(payload)
        const db = getDb()
        const submRepo = createSubmissionsRepository(db)
        
        const submission = submRepo.get(parsed.id)
        if (!submission) {
            return { ok: false }
        }
        if (submission.status !== 'approved') {
            return { ok: false }
        }

        // Create voucher from submission
        const voucherPayload = {
            date: submission.date,
            type: submission.type as 'IN' | 'OUT',
            sphere: parsed.sphere,
            description: submission.description || undefined,
            grossAmount: submission.grossAmount,
            vatRate: 0,
            paymentMethod: parsed.paymentMethod,
            categoryId: parsed.categoryId,
            earmarkId: parsed.earmarkId,
            budgetId: parsed.budgetId,
            counterparty: submission.counterparty || undefined,
            files: [] as Array<{ name: string; dataBase64: string; mime?: string }>
        }

        // Add attachments as files
        for (const att of submission.attachments) {
            const fullAtt = submRepo.getAttachment(att.id)
            if (fullAtt) {
                voucherPayload.files.push({
                    name: fullAtt.filename,
                    dataBase64: fullAtt.data.toString('base64'),
                    mime: fullAtt.mimeType || undefined
                })
            }
        }

        const voucherResult = createVoucher(voucherPayload)
        
        // Link submission to voucher
        if (voucherResult.id) {
            submRepo.linkToVoucher(parsed.id, voucherResult.id)
        }

        return SubmissionConvertOutput.parse({ ok: true, voucherId: voucherResult.id })
    })

    // Summary
    ipcMain.handle('submissions.summary', async () => {
        const db = getDb()
        const repo = createSubmissionsRepository(db)
        const result = repo.summary()
        return SubmissionsSummaryOutput.parse(result)
    })

    // Read attachment data
    ipcMain.handle('submissions.readAttachment', async (_e, payload) => {
        const parsed = SubmissionAttachmentReadInput.parse(payload)
        const db = getDb()
        const repo = createSubmissionsRepository(db)
        const att = repo.getAttachment(parsed.attachmentId)
        if (!att) {
            return null
        }
        return SubmissionAttachmentReadOutput.parse({
            filename: att.filename,
            mimeType: att.mimeType,
            dataBase64: att.data.toString('base64')
        })
    })

    // ─────────────────────────────────────────────────────────────────────────
    // Organization Management
    // ─────────────────────────────────────────────────────────────────────────
    
    ipcMain.handle('organizations.list', async () => {
        return { organizations: listOrganizations() }
    })
    
    ipcMain.handle('organizations.active', async () => {
        return { organization: getActiveOrganization() }
    })
    
    ipcMain.handle('organizations.create', async (_e, payload: { name: string }) => {
        if (!payload?.name) throw new Error('Name ist erforderlich')
        const org = createOrganization(payload.name)
        return { organization: org }
    })
    
    ipcMain.handle('organizations.switch', async (_e, payload: { orgId: string }) => {
        if (!payload?.orgId) throw new Error('orgId ist erforderlich')
        const before = getActiveOrganization()
        const beforeId = before?.id || 'default'
        const result = switchOrganization(payload.orgId)

        // Ensure DB is initialized for the newly active organization.
        // This is critical because renderer reload does NOT restart the main process.
        try {
            const db = getDb()
            applyMigrations(db)
        } catch (err) {
            // Roll back config to the previous org to avoid leaving the app in a broken state.
            try { switchOrganization(beforeId) } catch { /* ignore rollback errors */ }
            throw err
        }
        // Signal renderer to reload
        const win = BrowserWindow.getFocusedWindow()
        if (win) {
            win.webContents.send('organizations:switched', result.org)
        }
        return result
    })
    
    ipcMain.handle('organizations.rename', async (_e, payload: { orgId: string; name: string }) => {
        if (!payload?.orgId || !payload?.name) throw new Error('orgId und name sind erforderlich')
        return renameOrganization(payload.orgId, payload.name)
    })
    
    ipcMain.handle('organizations.delete', async (_e, payload: { orgId: string; deleteData?: boolean }) => {
        if (!payload?.orgId) throw new Error('orgId ist erforderlich')

        const before = getActiveOrganization()
        const beforeId = before?.id || 'default'
        const result = deleteOrganization(payload.orgId, payload.deleteData ?? false)

        const after = getActiveOrganization()
        const afterId = after?.id || 'default'

        // If the active organization changed (e.g. deleted active org), ensure DB is initialized.
        if (afterId !== beforeId) {
            try {
                const db = getDb()
                applyMigrations(db)
            } catch (err) {
                // Deletion already succeeded (config/data updated).
                // Do not fail the delete call because a follow-up migration failed.
                console.warn('[organizations.delete] post-switch migration failed:', err)
            }

            const win = BrowserWindow.getFocusedWindow()
            if (win && after) {
                win.webContents.send('organizations:switched', { id: after.id, name: after.name, dbRoot: after.dbRoot })
            }
        }

        return result
    })
    
    ipcMain.handle('organizations.getAppearance', async (_e, payload: { orgId: string }) => {
        if (!payload?.orgId) throw new Error('orgId ist erforderlich')
        return getOrganizationAppearance(payload.orgId)
    })
    
    ipcMain.handle('organizations.setAppearance', async (_e, payload: { orgId: string; colorTheme?: string; backgroundImage?: string; customBackgroundImage?: string | null; glassModals?: boolean }) => {
        if (!payload?.orgId) throw new Error('orgId ist erforderlich')
        return setOrganizationAppearance(payload.orgId, {
            colorTheme: payload.colorTheme,
            backgroundImage: payload.backgroundImage,
            customBackgroundImage: payload.customBackgroundImage,
            glassModals: payload.glassModals
        })
    })
    
    ipcMain.handle('organizations.activeAppearance', async () => {
        return getActiveOrganizationAppearance()
    })
}
