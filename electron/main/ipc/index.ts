import { ipcMain, dialog, shell, BrowserWindow, app } from 'electron'
import { VoucherCreateInput, VoucherCreateOutput, VoucherReverseInput, VoucherReverseOutput, ReportsExportInput, ReportsExportOutput, VouchersListInput, VouchersListOutput, VoucherUpdateInput, VoucherUpdateOutput, VoucherDeleteInput, VoucherDeleteOutput, ReportsSummaryInput, ReportsSummaryOutput, ReportsMonthlyInput, ReportsMonthlyOutput, ReportsCashBalanceInput, ReportsCashBalanceOutput, BindingUpsertInput, BindingUpsertOutput, BindingListInput, BindingListOutput, BindingDeleteInput, BindingDeleteOutput, BindingUsageInput, BindingUsageOutput, BudgetUpsertInput, BudgetUpsertOutput, BudgetListInput, BudgetListOutput, BudgetDeleteInput, BudgetDeleteOutput, QuoteWeeklyInput, QuoteWeeklyOutput, ImportPreviewInput, ImportPreviewOutput, ImportExecuteInput, ImportExecuteOutput, ImportTemplateInput, ImportTemplateOutput, ImportTestDataInput, ImportTestDataOutput, AttachmentsListInput, AttachmentsListOutput, AttachmentOpenInput, AttachmentOpenOutput, AttachmentSaveAsInput, AttachmentSaveAsOutput, AttachmentReadInput, AttachmentReadOutput, AttachmentAddInput, AttachmentAddOutput, AttachmentDeleteInput, AttachmentDeleteOutput, VouchersClearAllInput, VouchersClearAllOutput, TagsListInput, TagsListOutput, TagUpsertInput, TagUpsertOutput, TagDeleteInput, TagDeleteOutput, ReportsYearsOutput, BudgetUsageInput, BudgetUsageOutput, SettingsGetInput, SettingsGetOutput, SettingsSetInput, SettingsSetOutput, VouchersRecentInput, VouchersRecentOutput, VouchersBatchAssignEarmarkInput, VouchersBatchAssignEarmarkOutput, VouchersBatchAssignBudgetInput, VouchersBatchAssignBudgetOutput, VouchersBatchAssignTagsInput, VouchersBatchAssignTagsOutput, InvoiceCreateInput, InvoiceCreateOutput, InvoiceUpdateInput, InvoiceUpdateOutput, InvoiceDeleteInput, InvoiceDeleteOutput, InvoicesListInput, InvoicesListOutput, InvoiceByIdInput, InvoiceByIdOutput, InvoiceAddPaymentInput, InvoiceAddPaymentOutput, InvoiceFilesListInput, InvoiceFilesListOutput, InvoiceFileAddInput, InvoiceFileAddOutput, InvoiceFileDeleteInput, InvoiceFileDeleteOutput, YearEndPreviewInput, YearEndPreviewOutput, YearEndExportInput, YearEndExportOutput, YearEndCloseInput, YearEndCloseOutput, YearEndReopenInput, YearEndReopenOutput, YearEndStatusOutput, InvoicesSummaryInput, InvoicesSummaryOutput, MembersListInput, MembersListOutput, MemberCreateInput, MemberCreateOutput, MemberUpdateInput, MemberUpdateOutput, MemberDeleteInput, MemberDeleteOutput, MemberGetInput, MemberGetOutput, PaymentsListDueInput, PaymentsListDueOutput, PaymentsMarkPaidInput, PaymentsMarkPaidOutput, PaymentsUnmarkInput, PaymentsUnmarkOutput, PaymentsSuggestVouchersInput, PaymentsSuggestVouchersOutput } from './schemas'
import { getDb, getAppDataDir, closeDb, getCurrentDbInfo, migrateToRoot, readAppConfig, writeAppConfig } from '../db/database'
import { createVoucher, reverseVoucher, listRecentVouchers, listVouchersFiltered, listVouchersAdvanced, listVouchersAdvancedPaged, updateVoucher, deleteVoucher, summarizeVouchers, monthlyVouchers, cashBalance, listFilesForVoucher, getFileById, addFileToVoucher, deleteVoucherFile, clearAllVouchers, listVoucherYears, batchAssignEarmark, batchAssignBudget, batchAssignTags } from '../repositories/vouchers'
import { createInvoice, updateInvoice, deleteInvoice, listInvoicesPaged, summarizeInvoices, getInvoiceById, addPayment, markPaid, getInvoiceFileById, listFilesForInvoice, addFileToInvoice, deleteInvoiceFile } from '../repositories/invoices'
import { listTags, upsertTag, deleteTag } from '../repositories/tags'
import { listMembers, createMember, updateMember, deleteMember, getMemberById } from '../repositories/members'
import { listBindings, upsertBinding, deleteBinding, bindingUsage } from '../repositories/bindings'
import { upsertBudget, listBudgets, deleteBudget, budgetUsage } from '../repositories/budgets'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getSetting, setSetting } from '../services/settings'
import ExcelJS from 'exceljs'
import { getWeeklyQuote } from '../services/quotes'
import { previewFile, executeFile, generateImportTemplate, generateImportTestData } from '../services/imports'
import { DbExportInput, DbExportOutput, DbImportInput, DbImportOutput } from './schemas'
import { applyMigrations } from '../db/migrations'
import { listRecentAudit } from '../repositories/audit'
import { AuditRecentInput, AuditRecentOutput } from './schemas'
import * as yearEnd from '../services/yearEnd'
import * as backup from '../services/backup'
import * as mp from '../repositories/members_payments'

export function registerIpcHandlers() {
    // App info
    ipcMain.handle('app.version', async () => {
        try { return { version: app.getVersion(), name: app.getName() } } catch { return { version: '0.0.0', name: 'VereinO' } }
    })
    // Window controls (frameless)
    ipcMain.handle('window.minimize', async () => {
        const win = BrowserWindow.getFocusedWindow()
        win?.minimize()
        return { ok: true }
    })
    ipcMain.handle('window.toggleMaximize', async () => {
        const win = BrowserWindow.getFocusedWindow()
        if (win) {
            if (win.isMaximized()) win.unmaximize(); else win.maximize()
            return { ok: true, isMaximized: win.isMaximized() }
        }
        return { ok: false }
    })
    ipcMain.handle('window.close', async () => {
        const win = BrowserWindow.getFocusedWindow()
        if (win) {
            // On Windows: ensure app quits when user clicks close button
            if (process.platform === 'win32') {
                app.quit()
            } else {
                win.close()
            }
        }
        return { ok: true }
    })
    ipcMain.handle('window.isMaximized', async () => {
        const win = BrowserWindow.getFocusedWindow()
        return { isMaximized: !!win?.isMaximized() }
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
            sphere: parsed.sphere as any,
            type: parsed.type as any,
            from: parsed.from,
            to: parsed.to,
            // extend filters with optional earmarkId
            ...(parsed.earmarkId != null ? { earmarkId: parsed.earmarkId } as any : {}),
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
            type: parsed.type as any
        })
        return ReportsMonthlyOutput.parse({ buckets })
    })

    ipcMain.handle('reports.cashBalance', async (_e, payload) => {
        const parsed = ReportsCashBalanceInput.parse(payload)
        const res = cashBalance({ to: parsed.to, sphere: parsed.sphere as any })
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

        const defaultCols = ['date', 'voucherNo', 'type', 'sphere', 'description', 'paymentMethod', 'netAmount', 'vatAmount', 'grossAmount'] as const
        const colsSel = (parsed.fields && parsed.fields.length ? parsed.fields : defaultCols) as string[]
        const headerMap: Record<string, string> = {
            date: 'Datum', voucherNo: 'Nr.', type: 'Typ', sphere: 'Sphäre', description: 'Beschreibung', paymentMethod: 'Zahlweg', netAmount: 'Netto', vatAmount: 'MwSt', grossAmount: 'Brutto', tags: 'Tags'
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
                to: parsed.to
            } as any)
            const buckets = monthlyVouchers({ from: parsed.from, to: parsed.to, paymentMethod: (parsed.filters?.paymentMethod as any) || undefined, sphere: (parsed.filters?.sphere as any) || undefined, type: (parsed.filters?.type as any) || undefined })
            // Build accurate monthly series for IN/OUT/Saldo (ignore type filter to show both lines)
            const d2 = getDb()
            const p2: any[] = []
            const wh2: string[] = []
            if (parsed.from) { wh2.push('date >= ?'); p2.push(parsed.from) }
            if (parsed.to) { wh2.push('date <= ?'); p2.push(parsed.to) }
            if (parsed.filters?.paymentMethod) { wh2.push('payment_method = ?'); p2.push(parsed.filters.paymentMethod) }
            if (parsed.filters?.sphere) { wh2.push('sphere = ?'); p2.push(parsed.filters.sphere) }
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
                    ${(summary.byPaymentMethod as any[]).map(p => `<tr><td>${p.key ?? '—'}</td><td class=right>${Number(p.gross).toFixed(2)} €</td></tr>`).join('')}
                </tbody>
            </table>
        </div>
    </div>
    <div class="card" style="margin-top:16px;">
        <div class="title">Monatsverlauf (Saldo: IN − OUT)</div>
        <div class="chart">
            ${(() => {
                    const max = Math.max(1, ...buckets.map((b: any) => Math.abs(b.gross)))
                    const m = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
                    return buckets.map((b: any) => {
                        const frac = Math.abs(b.gross) / max
                        const h = Math.max(10, Math.round(frac * 120))
                        const monIdx = Math.max(0, Math.min(11, Number(String(b.month).slice(5)) - 1))
                        const mon = m[monIdx] || String(b.month).slice(5)
                        const val = `${Number(b.gross).toFixed(2)} €`
                        return `<div style="display:flex;flex-direction:column;align-items:center;gap:4px">
                            <div class="small" style="color:#333">${val}</div>
                            <div class=bar style="width:22px;height:${h}px" title="${mon} ${val}"></div>
                            <div class=small>${mon}</div>
                        </div>`
                    }).join('')
                })()}
        </div>
    </div>

    <div class="card" style="margin-top:16px;">
        <div class="title">Verlaufslinie (IN / OUT / Saldo)</div>
        <div class="line-wrap">
            ${(() => {
                // Accurate line chart from detailed series
                const W = 760, H = 220, P = 28
                const xs = (i: number, n: number) => P + (i * (W - 2 * P)) / Math.max(1, n - 1)
                const maxAbs = Math.max(1, ...detailed.map((b: any) => Math.max(Number(b.inGross)||0, Number(b.outGross)||0, Math.abs(Number(b.saldo)||0))))
                const ys = (v: number) => H/2 - (v / maxAbs) * (H/2 - 16)
                const ptsIn: string[] = []
                const ptsOut: string[] = []
                const ptsNet: string[] = []
                const m = ['Jan','Feb','Mär','Apr','Mai','Jun','Jul','Aug','Sep','Okt','Nov','Dez']
                const labels: string[] = []
                detailed.forEach((b: any, i: number) => {
                    const x = xs(i, detailed.length)
                    const inV = Number(b.inGross)||0
                    const outV = Number(b.outGross)||0
                    const netV = Number(b.saldo)||0
                    const yIn = ys(inV)
                    const yOut = ys(-outV)
                    const yNet = ys(netV)
                    ptsIn.push(`${x},${yIn}`)
                    ptsOut.push(`${x},${yOut}`)
                    ptsNet.push(`${x},${yNet}`)
                    const monIdx = Math.max(0, Math.min(11, Number(String(b.month).slice(5)) - 1))
                    const mon = m[monIdx] || String(b.month).slice(5)
                    labels.push(`
                        <text class="lbl" x="${x}" y="${H-6}" text-anchor="middle">${mon}</text>
                        <text class="lbl" x="${x}" y="${yIn - 6}" text-anchor="middle" fill="#4CC38A">${inV.toFixed(0)}€</text>
                        <text class="lbl" x="${x}" y="${yOut + 12}" text-anchor="middle" fill="#F06A6A">${outV.toFixed(0)}€</text>
                        <text class="lbl" x="${x}" y="${yNet - 6}" text-anchor="middle" fill="#6AA6FF">${netV.toFixed(0)}€</text>
                    `)
                })
                return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}">
                    <line class="axis" x1="0" y1="${H/2}" x2="${W}" y2="${H/2}"/>
                    <polyline class="stroke-in" points="${ptsIn.join(' ')}"/>
                    <polyline class="stroke-out" points="${ptsOut.join(' ')}"/>
                    <polyline class="stroke-net" points="${ptsNet.join(' ')}"/>
                    ${labels.join('')}
                </svg>`
            })()}
        </div>
        <div class="legend" style="margin-top:8px;">
            <span class="legend-item"><span class="sw" style="background:#4CC38A"></span>IN</span>
            <span class="legend-item"><span class="sw" style="background:#F06A6A"></span>OUT</span>
            <span class="legend-item"><span class="sw" style="background:#6AA6FF"></span>SALDO</span>
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
                    return `<tr>
                        <td class="nowrap">${esc(r.date)}</td>
                        <td class="nowrap">${esc(r.voucherNo)}</td>
                        <td class="nowrap">${esc(r.type)}</td>
                        <td class="nowrap">${esc(r.sphere)}</td>
                        <td>${esc(r.description ?? '')}</td>
                        <td class="nowrap">${esc(r.paymentMethod ?? '')}</td>
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
                    if (c === 'paymentMethod') return r.paymentMethod ?? ''
                    if (c === 'tags') return (r.tags || []).join(', ')
                    return (r as any)[c]
                })
                ws.addRow(values)
            }
            // Simple formatting
            ws.getRow(1).font = { bold: true, size: 14 }
            ws.getRow(5).font = { bold: true }
            // Column widths
            ws.columns = colsSel.map((c) => ({ width: c === 'description' ? 40 : 12 })) as any

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
                    if (c === 'paymentMethod') return r.paymentMethod ?? ''
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

    ipcMain.handle('vouchers.list', async (_e, payload) => {
        const parsed = VouchersListInput.parse(payload) ?? { limit: 20, offset: 0, sort: 'DESC' }
        const { rows, total } = listVouchersAdvancedPaged({
            limit: parsed.limit,
            offset: parsed.offset ?? 0,
            sort: (parsed.sort as any) || 'DESC',
            sortBy: (parsed as any).sortBy,
            paymentMethod: parsed.paymentMethod as any,
            sphere: parsed.sphere as any,
            type: parsed.type as any,
            from: parsed.from,
            to: parsed.to,
            earmarkId: parsed.earmarkId,
            budgetId: (parsed as any).budgetId,
            q: parsed.q,
            tag: (parsed as any).tag
        })
        return VouchersListOutput.parse({ rows, total })
    })

    ipcMain.handle('vouchers.update', async (_e, payload) => {
        const parsed = VoucherUpdateInput.parse(payload)
        const res = updateVoucher(parsed as any)
        return VoucherUpdateOutput.parse(res)
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
        const res = await executeFile(parsed.fileBase64, parsed.mapping as any)
        return ImportExecuteOutput.parse(res as any)
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
        const res = await shell.openPath(f.filePath)
        const ok = !res
        return AttachmentOpenOutput.parse({ ok })
    })
    ipcMain.handle('attachments.saveAs', async (_e, payload) => {
        const parsed = AttachmentSaveAsInput.parse(payload)
        const f = getFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const save = await dialog.showSaveDialog({ title: 'Datei speichern unter …', defaultPath: f.fileName })
        if (save.canceled || !save.filePath) throw new Error('Abbruch')
        fs.copyFileSync(f.filePath, save.filePath)
        return AttachmentSaveAsOutput.parse({ filePath: save.filePath })
    })
    ipcMain.handle('attachments.read', async (_e, payload) => {
        const parsed = AttachmentReadInput.parse(payload)
        const f = getFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const buff = fs.readFileSync(f.filePath)
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
        const save = await dialog.showSaveDialog({ title: 'Datenbank exportieren …', defaultPath: 'VereinO_database.sqlite', filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }] })
        if (save.canceled || !save.filePath) throw new Error('Abbruch')
        fs.copyFileSync(dbPath, save.filePath)
        return DbExportOutput.parse({ filePath: save.filePath })
    })

    // Database: Import (replace current database.sqlite with selected file)
    ipcMain.handle('db.import', async () => {
        DbImportInput.parse({})
        const open = await dialog.showOpenDialog({ title: 'Datenbank importieren …', filters: [{ name: 'SQLite', extensions: ['sqlite', 'db'] }], properties: ['openFile'] })
        if (open.canceled || !open.filePaths?.[0]) throw new Error('Abbruch')
        const importPath = open.filePaths[0]
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
            return DbImportOutput.parse({ ok: true, filePath: importPath })
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

    // Invoice files: open/save/read
    ipcMain.handle('invoiceFiles.open', async (_e, payload) => {
        const parsed = AttachmentOpenInput.parse(payload)
        const f = getInvoiceFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const res = await shell.openPath(f.filePath)
        const ok = !res
        return AttachmentOpenOutput.parse({ ok })
    })
    ipcMain.handle('invoiceFiles.saveAs', async (_e, payload) => {
        const parsed = AttachmentSaveAsInput.parse(payload)
        const f = getInvoiceFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const save = await dialog.showSaveDialog({ title: 'Datei speichern unter …', defaultPath: f.fileName })
        if (save.canceled || !save.filePath) throw new Error('Abbruch')
        fs.copyFileSync(f.filePath, save.filePath)
        return AttachmentSaveAsOutput.parse({ filePath: save.filePath })
    })
    ipcMain.handle('invoiceFiles.read', async (_e, payload) => {
        const parsed = AttachmentReadInput.parse(payload)
        const f = getInvoiceFileById(parsed.fileId)
        if (!f) throw new Error('Datei nicht gefunden')
        const buff = fs.readFileSync(f.filePath)
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
}
