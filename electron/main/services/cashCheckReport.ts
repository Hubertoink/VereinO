import { BrowserWindow } from 'electron'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { getCashCheckById } from '../repositories/cashChecks'
import { getDb } from '../db/database'
import { getSetting } from './settings'

function esc(s: any) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' } as any)[c])
}

function euro(n: number) {
  return new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)
}

function prepareExportPath(prefix: string, dateISO: string): string {
  const when = new Date()
  const stamp = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}_${String(when.getHours()).padStart(2, '0')}${String(when.getMinutes()).padStart(2, '0')}`
  const baseDir = path.join(os.homedir(), 'Documents', 'VereinPlannerExports')
  try {
    fs.mkdirSync(baseDir, { recursive: true })
  } catch {
    // ignore
  }
  return path.join(baseDir, `${prefix}_${dateISO}_${stamp}.pdf`)
}

function getAuditorsFromMembers(): { pr1?: string; pr2?: string } {
  const d = getDb()
  try {
    const rows = d
      .prepare(
        "SELECT name, board_role as boardRole, status FROM members WHERE board_role IN ('KASSENPR1','KASSENPR2') AND status <> 'LEFT'"
      )
      .all() as any[]
    const pr1 = rows.find((r) => r.boardRole === 'KASSENPR1')?.name
    const pr2 = rows.find((r) => r.boardRole === 'KASSENPR2')?.name
    return {
      pr1: pr1 ? String(pr1) : undefined,
      pr2: pr2 ? String(pr2) : undefined
    }
  } catch {
    return {}
  }
}

export async function generateCashCheckPDF(options: {
  cashCheckId: number
}): Promise<{ filePath: string }> {
  const cashCheck = getCashCheckById(options.cashCheckId)
  if (!cashCheck) throw new Error('Kassenprüfung nicht gefunden')

  const orgName = (getSetting<string>('org.name') || 'VereinO').trim() || 'VereinO'

  const auditorsFromDb = {
    pr1: cashCheck.inspector1Name && cashCheck.inspector1Name.trim() ? cashCheck.inspector1Name.trim() : undefined,
    pr2: cashCheck.inspector2Name && cashCheck.inspector2Name.trim() ? cashCheck.inspector2Name.trim() : undefined
  }

  const auditorsFromMembers = getAuditorsFromMembers()
  const pr1 = auditorsFromDb.pr1 ?? auditorsFromMembers.pr1
  const pr2 = auditorsFromDb.pr2 ?? auditorsFromMembers.pr2

  if (!pr1 && !pr2) {
    const err: any = new Error('KASSENPRUEFER_REQUIRED')
    err.code = 'KASSENPRUEFER_REQUIRED'
    throw err
  }

  const filePath = prepareExportPath('Kassenpruefung', cashCheck.date)

  const html = `<!DOCTYPE html>
<html lang="de">
<head>
  <meta charset="utf-8"/>
  <title>Kassenprüfung ${esc(cashCheck.date)} – ${esc(orgName)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Arial, sans-serif;
      padding: 28px 22px;
      color: #222;
      font-size: 11pt;
    }
    h1 { margin: 0 0 6px; font-size: 18pt; }
    .sub { color: #666; font-size: 10pt; margin-bottom: 18px; }
    .box { border: 1px solid #ddd; border-radius: 10px; padding: 12px 14px; margin: 10px 0; }
    .row { display: flex; justify-content: space-between; gap: 18px; padding: 6px 0; border-bottom: 1px solid #eee; }
    .row:last-child { border-bottom: none; }
    .label { font-weight: 600; }
    .val { font-variant-numeric: tabular-nums; }
    .ok { color: #2e7d32; font-weight: 700; }
    .bad { color: #c62828; font-weight: 700; }
    .sig { margin-top: 22px; display: grid; grid-template-columns: 1fr 1fr; gap: 24px; }
    .sigbox { border-top: 1px solid #333; padding-top: 6px; font-size: 10pt; }
    .note { margin-top: 10px; white-space: pre-wrap; }
    .meta { color:#444; font-size:10pt; }
  </style>
</head>
<body>
  <h1>Kassenprüfer-Bericht (Kassenprüfung)</h1>
  <div class="sub">${esc(orgName)} · Jahr ${esc(cashCheck.year)} · Stichtag ${esc(cashCheck.date)}</div>

  <div class="box">
    <div class="row"><div class="label">Soll-Bestand (BAR)</div><div class="val">${esc(euro(cashCheck.soll))}</div></div>
    <div class="row"><div class="label">Ist-Bestand (gezählt)</div><div class="val">${esc(euro(cashCheck.ist))}</div></div>
    <div class="row"><div class="label">Differenz (Ist − Soll)</div><div class="val ${cashCheck.diff === 0 ? 'ok' : (cashCheck.diff > 0 ? 'ok' : 'bad')}">${esc(euro(cashCheck.diff))}</div></div>
  </div>

  <div class="box">
    <div class="row"><div class="label">Beleg</div><div class="val">${cashCheck.voucherNo ? esc(cashCheck.voucherNo) : '—'}</div></div>
    <div class="row"><div class="label">Budget (optional)</div><div class="val">${cashCheck.budgetLabel ? esc(cashCheck.budgetLabel) : '—'}</div></div>
    <div class="row"><div class="label">Sphäre</div><div class="val">IDEELL</div></div>
    <div class="row"><div class="label">Prüfer</div><div class="val">${esc([pr1, pr2].filter(Boolean).join(' · '))}</div></div>
    <div class="meta">Erstellt am ${esc(new Date().toISOString().slice(0, 10))}</div>
    ${cashCheck.note ? `<div class="note"><div class="label">Notiz</div><div>${esc(cashCheck.note)}</div></div>` : ''}
  </div>

  <div class="sig">
    <div>
      <div style="height: 38px"></div>
      <div class="sigbox">Unterschrift Prüfer 1${pr1 ? ` (${esc(pr1)})` : ''}</div>
    </div>
    <div>
      <div style="height: 38px"></div>
      <div class="sigbox">Unterschrift Prüfer 2${pr2 ? ` (${esc(pr2)})` : ''}</div>
    </div>
  </div>
</body>
</html>`

  const win = new BrowserWindow({
    show: false,
    width: 900,
    height: 1200,
    webPreferences: {
      sandbox: true,
      nodeIntegration: false,
      contextIsolation: true
    }
  })

  try {
    await win.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html))
    const buff = await win.webContents.printToPDF({ pageSize: 'A4', printBackground: true })
    fs.writeFileSync(filePath, buff)
  } finally {
    try {
      win.close()
    } catch {
      // ignore
    }
  }

  return { filePath }
}
