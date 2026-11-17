import { niceStep } from '../../../shared/chartScale'
import { writeReportPdf } from './reportPdf'
import { escapeReportHtml as esc, voucherDescriptionHtml } from './reportHtml'
import path from 'node:path'
import fsp from 'node:fs/promises'
import { ReportsExportInput, ReportsExportOutput } from '../ipc/schemas'
import { listVouchersAdvanced, summarizeVouchers, monthlyVouchers } from '../repositories/vouchers'
import { getSetting } from './settings'
import { voucherStatusKind, voucherStatusText } from './voucherStatus'
import { buildReportMonths, renderReportAnalytics, reportAnalyticsCss } from '../../../shared/reportAnalytics'
import { createExportStamp, ensureExportsDir } from './exportPaths'

export async function exportReport(payload: unknown) {
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

  const stamp = createExportStamp()
  const baseDir = await ensureExportsDir()

  const defaultCols = [
    'date',
    'voucherNo',
    'type',
    'sphere',
    'description',
    'status',
    'paymentMethod',
    'netAmount',
    'vatAmount',
    'grossAmount'
  ] as const
  const colsSel = (
    parsed.fields && parsed.fields.length ? parsed.fields : defaultCols
  ) as string[]
  const headerMap: Record<string, string> = {
    date: 'Datum',
    voucherNo: 'Nr.',
    type: 'Typ',
    sphere: 'Sphäre',
    description: 'Beschreibung',
    status: 'Status',
    paymentMethod: 'Zahlweg',
    netAmount: 'Netto',
    vatAmount: 'MwSt',
    grossAmount: 'Brutto',
    tags: 'Tags'
  }
  const paymentAccountLabel = (row: any) => {
    if (row?.type === 'TRANSFER') {
      const from =
        row.transferFromAccountName ||
        (row.transferFrom === 'BAR' ? 'Bar' : row.transferFrom === 'BANK' ? 'Bank' : '')
      const to =
        row.transferToAccountName ||
        (row.transferTo === 'BAR' ? 'Bar' : row.transferTo === 'BANK' ? 'Bank' : '')
      return from && to ? `${from} -> ${to}` : 'Transfer'
    }
    return (
      row?.paymentAccountName ||
      (row?.paymentMethod === 'BAR' ? 'Bar' : row?.paymentMethod === 'BANK' ? 'Bank' : '')
    )
  }
  const outNegative = parsed.amountMode === 'OUT_NEGATIVE'
  const reportBase = parsed.type === 'JOURNAL' ? 'Journal' : `Report_${parsed.type}`

  if (parsed.format === 'PDF') {
    // Phase 1 PDF: simple summary page rendered in an offscreen BrowserWindow and printed to PDF
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
    // Use the same signed monthly series and filters as the report view.
    const monthlyFilters = { from: parsed.from, to: parsed.to,
      paymentMethod: parsed.filters?.paymentMethod, sphere: parsed.filters?.sphere,
      earmarkId: parsed.filters?.earmarkId, budgetId: parsed.filters?.budgetId }
    const income = parsed.filters?.type && parsed.filters.type !== 'IN' ? [] : monthlyVouchers({ ...monthlyFilters, type: 'IN' })
    const expense = parsed.filters?.type && parsed.filters.type !== 'OUT' ? [] : monthlyVouchers({ ...monthlyFilters, type: 'OUT' })
    const reportMonths = buildReportMonths(income, expense, parsed.from, parsed.to)
    const detailed = reportMonths.map(row => ({ month: row.month, inGross: row.income, outGross: row.expense, saldo: row.net }))
    const orgName =
      (parsed.orgName && parsed.orgName.trim()) ||
      ((getSetting<string>('org.name') || 'VereinO') as string)
    const orgLogoDataUrl = String(getSetting<string>('org.logoDataUrl') || '')
    const outNegative = parsed.amountMode === 'OUT_NEGATIVE'

    // Prepare data for sphere chart
    const sphereAgg = (summary.bySphere as any[]).map((s) => ({
      key: s.key as string,
      gross: Number(s.gross)
    }))
    const totalSphere = Math.max(
      0.0001,
      sphereAgg.reduce((a, b) => a + Math.abs(b.gross), 0)
    )
    const colors: Record<string, string> = {
      IDEELL: '#6AA6FF',
      ZWECK: '#00C853',
      VERMOEGEN: '#FFC107',
      WGB: '#9C27B0'
    }
    function arcPath(cx: number, cy: number, r: number, r2: number, start: number, end: number) {
      const toXY = (ang: number, rad: number) => [
        cx + rad * Math.cos(ang),
        cy + rad * Math.sin(ang)
      ]
      const [x1, y1] = toXY(start, r)
      const [x2, y2] = toXY(end, r)
      const [x3, y3] = toXY(end, r2)
      const [x4, y4] = toXY(start, r2)
      const large = end - start > Math.PI ? 1 : 0
      return `M ${x1} ${y1} A ${r} ${r} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r2} ${r2} 0 ${large} 0 ${x4} ${y4} Z`
    }
    function sphereDonutSVG(size = 160) {
      const cx = size / 2,
        cy = size / 2,
        r = size / 2 - 4,
        r2 = r * 0.62
      let a0 = -Math.PI / 2
      const parts = sphereAgg
        .map((s) => {
          const frac = Math.abs(s.gross) / totalSphere
          const a1 = a0 + frac * Math.PI * 2
          const d = arcPath(cx, cy, r, r2, a0, a1)
          const seg = `<path d="${d}" fill="${colors[s.key] || '#888'}" />`
          a0 = a1
          return seg
        })
        .join('')
      return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-label="Sphären-Donut">${parts}</svg>`
    }

    // Helpers

    const euro = (n: number) => `${n.toFixed(2)} €`

    const paymentAccountRows =
      Array.isArray((summary as any).byPaymentAccount) && (summary as any).byPaymentAccount.length
        ? (summary as any).byPaymentAccount
        : (summary.byPaymentMethod as any[]).map((p) => ({
            key: p.key === 'BAR' ? 'Bar' : p.key === 'BANK' ? 'Bank' : 'Ohne Konto',
            color: null,
            gross: p.gross
          }))

    const totalIn = reportMonths.reduce((sum, row) => sum + row.income, 0)
    const totalOut = reportMonths.reduce((sum, row) => sum + row.expense, 0)
    const saldo = Math.round((totalIn - totalOut) * 100) / 100

    const html = `<!doctype html>
<!DOCTYPE html><html lang="de"><head><meta charset="utf-8"/><title>Controlling-Bericht</title>
<style>
${reportAnalyticsCss}

  body { font-family: -apple-system, Segoe UI, Roboto, Arial, sans-serif; padding: 24px; color: #222; }
  h1 { margin: 0 0 4px; }
  .muted { color: #666; font-size: 12px; }
  .report-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 24px; margin-bottom: 12px; }
  .report-title { min-width: 0; }
  .report-logo { max-width: 150px; max-height: 72px; object-fit: contain; flex: 0 0 auto; }
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
  @media print { .card { break-inside: avoid; } tr { break-inside: avoid; } .report-logo { max-width: 140px; max-height: 64px; } }
</style>
</head><body>
  <div class="report-header">
      <div class="report-title">
          <h1>Controlling-Bericht</h1>
          <div class="muted">${esc(orgName)} · Zeitraum: ${esc(parsed.from)} – ${esc(parsed.to)} · Erstellt: ${new Date().toLocaleString('de-DE')}</div>
      </div>
      ${orgLogoDataUrl ? `<img class="report-logo" src="${esc(orgLogoDataUrl)}" alt="Organisationslogo" />` : ''}
  </div>
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
                  ${(summary.bySphere as any[]).map((s) => `<span class="legend-item"><span class="sw" style="background:${colors[(s as any).key] || '#888'}"></span>${esc((s as any).key)} · ${euro(Number((s as any).gross))}</span>`).join('')}
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
            const W = 760,
              H = 220,
              P = 100
            const baseY = H - 28
            const maxH = baseY - 24
            const m = [
              'Jan',
              'Feb',
              'Mär',
              'Apr',
              'Mai',
              'Jun',
              'Jul',
              'Aug',
              'Sep',
              'Okt',
              'Nov',
              'Dez'
            ]

            // Build cumulative saldo
            const cumSaldo: number[] = []
            let run = 0
            for (const b of detailed) {
              run += Number(b.saldo) || 0
              cumSaldo.push(run)
            }

            // Scale by max of bars and cumulative line
            const maxBar = Math.max(
              1,
              ...detailed.map((b: any) =>
                Math.max(Number(b.inGross) || 0, Number(b.outGross) || 0)
              )
            )
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
              const range = maxValue - -maxValue
              return 16 + ((maxValue - v) / range) * (baseY - 16)
            }

            const barW = 12,
              gap = 8

            // Y-axis ticks

            const yStep = niceStep(maxValue)
            const yTicks: number[] = []
            for (let v = 0; v <= maxValue + 1e-9; v += yStep) yTicks.push(Math.round(v))

            const formatEuro = (v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k€` : `${v.toFixed(0)}€`

            // Bars
            const bars = detailed
              .map((b: any, i: number) => {
                const xCenter = xs(i, detailed.length)
                const inV = Number(b.inGross) || 0
                const outV = Number(b.outGross) || 0
                const hIn = inV ? baseY - yBar(inV) : 0
                const hOut = outV ? baseY - yBar(outV) : 0
                return `<rect x="${xCenter - barW - gap / 2}" y="${yBar(inV)}" width="${barW}" height="${hIn}" fill="#2e7d32" rx="2"/>
                          <rect x="${xCenter + gap / 2}" y="${yBar(outV)}" width="${barW}" height="${hOut}" fill="#c62828" rx="2"/>`
              })
              .join('')

            // Cumulative line
            const linePts = cumSaldo
              .map((v, i) => `${xs(i, detailed.length)},${yLine(v)}`)
              .join(' ')

            // X labels (thinned out for readability)
            let tickEvery = 1
            const total = detailed.length
            if (total > 48) tickEvery = 12
            else if (total > 24) tickEvery = 6
            else if (total > 12) tickEvery = 3

            const xLabels = detailed
              .map((b: any, i: number) => {
                if (i % tickEvery !== 0 && i !== detailed.length - 1) return ''
                const monIdx = Math.max(0, Math.min(11, Number(String(b.month).slice(5)) - 1))
                const mon = m[monIdx] || String(b.month).slice(5)
                return `<text x="${xs(i, detailed.length)}" y="${H - 6}" fill="#666" font-size="10" text-anchor="middle">${mon}</text>`
              })
              .join('')

            // Y grid + labels
            const yGrid = yTicks
              .map((v) => {
                return `<line x1="${P}" x2="${W - P / 2}" y1="${yBar(v)}" y2="${yBar(v)}" stroke="#ddd" opacity="0.5"/>
                          <text x="${P - 6}" y="${yBar(v) + 4}" fill="#666" font-size="10" text-anchor="end">${formatEuro(v)}</text>`
              })
              .join('')

            return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%">
                  <line x1="${P}" x2="${W - P / 2}" y1="${baseY}" y2="${baseY}" stroke="#ccc"/>
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
            const W = 760,
              H = 200,
              P = 100
            const baseY = H - 28
            const maxH = baseY - 16
            const m = [
              'Jan',
              'Feb',
              'Mär',
              'Apr',
              'Mai',
              'Jun',
              'Jul',
              'Aug',
              'Sep',
              'Okt',
              'Nov',
              'Dez'
            ]

            const maxVal = Math.max(
              1,
              ...detailed.map((b: any) =>
                Math.max(Number(b.inGross) || 0, Number(b.outGross) || 0)
              )
            )

            const xs = (i: number, n: number) => {
              const usable = W - 2 * P
              const seg = usable / Math.max(1, n)
              return P + seg / 2 + i * seg
            }
            const yFor = (v: number) => baseY - Math.min(1, v / Math.max(1e-9, maxVal)) * maxH

            const barW = 10,
              gap = 5

            // Y-axis ticks

            const yStep = niceStep(maxVal)
            const yTicks: number[] = []
            for (let v = 0; v <= maxVal + 1e-9; v += yStep) yTicks.push(Math.round(v))

            const formatEuro = (v: number) =>
              v >= 1000 ? `${(v / 1000).toFixed(0)}k€` : `${v.toFixed(0)}€`

            // Bars
            const bars = detailed
              .map((b: any, i: number) => {
                const xCenter = xs(i, detailed.length)
                const inV = Number(b.inGross) || 0
                const outV = Number(b.outGross) || 0
                const hIn = Math.round((inV / maxVal) * maxH)
                const hOut = Math.round((outV / maxVal) * maxH)
                return `<rect x="${xCenter - barW * 1.5 - gap}" y="${baseY - hIn}" width="${barW}" height="${hIn}" fill="#2e7d32" rx="2"/>
                          <rect x="${xCenter - barW / 2}" y="${baseY - hOut}" width="${barW}" height="${hOut}" fill="#c62828" rx="2"/>`
              })
              .join('')

            // X labels (thinned out for readability)
            let tickEvery = 1
            const total = detailed.length
            if (total > 48) tickEvery = 12
            else if (total > 24) tickEvery = 6
            else if (total > 12) tickEvery = 3

            const xLabels = detailed
              .map((b: any, i: number) => {
                if (i % tickEvery !== 0 && i !== detailed.length - 1) return ''
                const monIdx = Math.max(0, Math.min(11, Number(String(b.month).slice(5)) - 1))
                const mon = m[monIdx] || String(b.month).slice(5)
                return `<text x="${xs(i, detailed.length)}" y="${H - 6}" fill="#666" font-size="10" text-anchor="middle">${mon}</text>`
              })
              .join('')

            // Y grid + labels
            const yGrid = yTicks
              .map((v) => {
                return `<line x1="${P}" x2="${W - P / 2}" y1="${yFor(v)}" y2="${yFor(v)}" stroke="#ddd" opacity="0.5"/>
                          <text x="${P - 6}" y="${yFor(v) + 4}" fill="#666" font-size="10" text-anchor="end">${formatEuro(v)}</text>`
              })
              .join('')

            return `<svg viewBox="0 0 ${W} ${H}" width="100%" height="100%">
                  <line x1="${P / 2}" x2="${W - P / 2}" y1="${baseY}" y2="${baseY}" stroke="#ccc"/>
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

  ${renderReportAnalytics(reportMonths, true, { from: parsed.from, to: parsed.to })}

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
              ${rows
                .map((r: any) => {
                  const g = r.type === 'OUT' && outNegative ? -r.grossAmount : r.grossAmount
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
                })
                .join('')}
          </tbody>
      </table>
      <div class="muted">Insgesamt ${rows.length} Beleg(e).</div>
  </div>
  <div class="footer">VereinO · Automatisch erstellt</div>
</body></html>`

    await writeReportPdf({ html, filePath })
    return ReportsExportOutput.parse({ filePath })
  } else if (parsed.format === 'XLSX') {
    const { default: ExcelJS } = await import('exceljs')
    const orgName =
      (parsed.orgName && parsed.orgName.trim()) ||
      ((getSetting<string>('org.name') || 'VereinO') as string)
    const filePath = path.join(baseDir, `${reportBase}_${stamp}.xlsx`)
    const wb = new ExcelJS.Workbook()
    const ws = wb.addWorksheet('Export')
    // Header block
    ws.addRow([`${reportBase} Export`])
    ws.addRow([`Organisation: ${orgName}`])
    ws.addRow([`Zeitraum: ${parsed.from ?? ''} – ${parsed.to ?? ''}`])
    ws.addRow([])
    // Table header
    ws.addRow(colsSel.map((c) => headerMap[c] || c))
    for (const r of rows) {
      const values = colsSel.map((c) => {
        if (c === 'grossAmount')
          return Number(
            (r.type === 'OUT' && outNegative ? -r.grossAmount : r.grossAmount).toFixed(2)
          )
        if (c === 'netAmount')
          return Number((r.type === 'OUT' && outNegative ? -r.netAmount : r.netAmount).toFixed(2))
        if (c === 'vatAmount')
          return Number((r.type === 'OUT' && outNegative ? -r.vatAmount : r.vatAmount).toFixed(2))
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
    ws.columns = colsSel.map((c) => ({
      width: c === 'description' ? 40 : c === 'status' ? 28 : 12
    })) as any

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
    lines.push(colsSel.map((c) => headerMap[c] || c).join(';'))
    for (const r of rows) {
      const vals = colsSel.map((c) => {
        if (c === 'description') return (r.description ?? '').replace(/\n|\r|;/g, ' ')
        if (c === 'status') return voucherStatusText(r)
        if (c === 'paymentMethod') return paymentAccountLabel(r)
        if (c === 'tags') return (r.tags || []).join(', ')
        if (c === 'grossAmount')
          return (r.type === 'OUT' && outNegative ? -r.grossAmount : r.grossAmount).toFixed(2)
        if (c === 'netAmount')
          return (r.type === 'OUT' && outNegative ? -r.netAmount : r.netAmount).toFixed(2)
        if (c === 'vatAmount')
          return (r.type === 'OUT' && outNegative ? -r.vatAmount : r.vatAmount).toFixed(2)
        return String((r as any)[c] ?? '')
      })
      lines.push(vals.join(';'))
    }
    await fsp.writeFile(filePath, lines.join('\n'), 'utf8')
    return ReportsExportOutput.parse({ filePath })
  }
}
