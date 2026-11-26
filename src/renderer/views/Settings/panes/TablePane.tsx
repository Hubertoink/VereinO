
import { DATE_FORMAT_OPTIONS } from '../../../utils/appearanceOptions'
import type { TablePaneProps } from '../types'
import { DnDOrder, SettingsPageHeader, SettingsSection, SettingsRow } from '../components'
import { IconPaperclip, IconSettings } from '@tabler/icons-react'
import { getEffectiveJournalOrder } from '../../Journal/utils/journalColumnVisibility'
import {
  getDetailsJournalColumnPreset,
  getMinimalJournalColumnPreset,
  getStandardJournalColumnPreset,
  type JournalColumnPreset
} from '../../Journal/utils/journalColumnPresets'

export function TablePane({
  journalRowStyle,
  setJournalRowStyle,
  journalRowDensity,
  setJournalRowDensity,
  dateFmt,
  setDateFmt,
  cols,
  setCols,
  order,
  setOrder,
  defaultCols,
  defaultOrder,
  journalLimit,
  setJournalLimit,
  labelForCol,
  allowVoucherDeletion
}: TablePaneProps) {
  const columnOrder = getEffectiveJournalOrder(order, true)
  const effectiveCols = { ...cols, actions: allowVoucherDeletion && cols.actions }
  const previewColumns = columnOrder.filter(key => effectiveCols[key])
  const sample = {
    actions: <IconSettings size={16} aria-label="Aktionen" />,
    date: DATE_FORMAT_OPTIONS.find(option => option.id === dateFmt)?.label,
    voucherNo: 'B-001',
    type: 'IN',
    sphere: 'IDEELL',
    description: 'Beispiel',
    note: 'Kommentar',
    earmark: '—',
    budget: '—',
    paymentMethod: 'BANK',
    attachments: <IconPaperclip size={16} aria-label="Anhang" />,
    net: '42,02',
    vat: '7,98',
    gross: '50,00'
  }

  const samples = [sample, { ...sample, voucherNo: 'B-002', description: 'Mitgliedsbeitrag' }]

  function applyPreset(preset: JournalColumnPreset) {
    setCols(preset.cols)
    setOrder(preset.order)
  }

  function resetAll() {
    setCols({ ...defaultCols })
    setOrder([...defaultOrder])
    setJournalLimit(20)
  }

  return (
    <div className="settings-page settings-table-pane">
      <SettingsPageHeader
        title="Buchungstabelle"
        description="Lege fest, wie Buchungen angezeigt werden."
      />
      <section className="settings-preview-card" aria-label="Vorschau">
        <header><h3>Vorschau</h3><span>Beispieldaten – keine echten Buchungen</span></header>
        {previewColumns.length ? (
          <div className="settings-preview-scroll">
            <table className="settings-table-preview" data-density={journalRowDensity} data-row-style={journalRowStyle}>
              <thead>
                <tr>{previewColumns.map(key => <th key={key} data-column={key} scope="col">{labelForCol(key)}</th>)}</tr>
              </thead>
              <tbody>
                {samples.map(row => (
                  <tr key={row.voucherNo}>{previewColumns.map(key => <td key={key} data-column={key}>{row[key]}</td>)}</tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="helper">Wähle eine Spalte für die Vorschau aus.</p>}
      </section>
      <SettingsSection title="Lesbarkeit">
        <SettingsRow
          title="Zeilenhöhe"
        >
          <div className="btn-group" role="group" aria-label="Zeilenhöhe">
            {(['normal', 'compact'] as const).map((value) => (
              <button
                key={value}
                className={`btn-option ${journalRowDensity === value ? 'active' : ''}`}
                aria-pressed={journalRowDensity === value}
                onClick={() => setJournalRowDensity(value)}
              >
                {value === 'normal' ? 'Normal' : 'Kompakt'}
              </button>
            ))}
          </div>
        </SettingsRow>
        <SettingsRow
          title="Zeilenlayout"
          htmlFor="select-row-style"
        >
          <select
            id="select-row-style"
            className="input"
            value={journalRowStyle}
            onChange={(e) =>
              setJournalRowStyle(e.target.value as TablePaneProps['journalRowStyle'])
            }
          >
            <option value="both">Linien + Zebra</option>
            <option value="lines">Nur Linien</option>
            <option value="zebra">Nur Zebra</option>
            <option value="none">Ohne Linien/Zebra</option>
          </select>
        </SettingsRow>
        <SettingsRow
          title="Einträge pro Seite"
        >
          <div className="btn-group" role="group" aria-label="Einträge pro Seite">
            {[20, 50, 100].map((value) => (
              <button
                key={value}
                className={`btn-option ${journalLimit === value ? 'active' : ''}`}
                aria-pressed={journalLimit === value}
                onClick={() => setJournalLimit(value)}
              >
                {value}
              </button>
            ))}
          </div>
        </SettingsRow>
        <SettingsRow
          title="Datumsformat"
          description="Gilt in der gesamten App."
        >
          <div className="btn-group" role="group" aria-label="Datumsformat">
            {DATE_FORMAT_OPTIONS.map((option) => (
              <button
                key={option.id}
                className={`btn-option ${dateFmt === option.id ? 'active' : ''}`}
                aria-pressed={dateFmt === option.id}
                onClick={() => setDateFmt(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </SettingsRow>
      </SettingsSection>
      <SettingsSection
        title="Spalten"
        description="Klicke auf eine Spalte, um sie ein- oder auszublenden. Ziehe sie, um die Reihenfolge zu ändern. „Aktionen“ bleibt an seiner Position."
      >
        <DnDOrder
          order={columnOrder}
          cols={effectiveCols}
          actionsAvailable={allowVoucherDeletion}
          labelFor={labelForCol}
          onToggle={key => setCols({ ...cols, [key]: !cols[key] })}
          onChange={setOrder}
        />
        {allowVoucherDeletion && !cols.actions && (
          <div className="helper">„Aktionen“ einblenden, um Zeilen zu bearbeiten oder zu löschen.</div>
        )}
      </SettingsSection>
      <SettingsSection
        title="Vorlagen"
        description="Übernimm eine Spaltenauswahl oder setze Spalten und Eintragsanzahl zurück."
      >
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn" onClick={() => applyPreset(getStandardJournalColumnPreset(allowVoucherDeletion))}>
            Voreinstellung: Standard
          </button>
          <button className="btn" onClick={() => applyPreset(getMinimalJournalColumnPreset(allowVoucherDeletion))}>
            Voreinstellung: Minimal
          </button>
          <button className="btn" onClick={() => applyPreset(getDetailsJournalColumnPreset(allowVoucherDeletion))}>
            Voreinstellung: Details
          </button>
          <button className="btn" onClick={resetAll}>
            Zurücksetzen
          </button>
        </div>
      </SettingsSection>
    </div>
  )
}
