import React, { useId, useLayoutEffect, useRef, useState } from 'react'
import {
  IconArrowDownLeft,
  IconArrowUpRight,
  IconChartLine,
  IconReceipt2
} from '@tabler/icons-react'
import type {
  ReportAnswer,
  ReportBookingSource,
  ReportFinanceData,
  ReportScope
} from '../../../../shared/aiReporting'
import { useScrollToLatest } from '../../hooks/useScrollToLatest'
import './reportAnswer.css'

const money = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' })
const dateLabel = (value: string) =>
  new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`))
const monthLabel = (value: string) =>
  new Intl.DateTimeFormat('de-DE', { month: 'long', year: 'numeric' }).format(
    new Date(`${value}-01T12:00:00`)
  )
const shortMonth = (value: string) =>
  new Intl.DateTimeFormat('de-DE', { month: 'short', year: '2-digit' }).format(
    new Date(`${value}-01T12:00:00`)
  )

type SourceAction = (source: ReportBookingSource) => void

function Metrics({ data, onSource }: { data: ReportFinanceData; onSource: SourceAction }) {
  return (
    <dl className="ai-report-metrics">
      <div className="ai-report-metric ai-report-metric--income">
        <dt>
          <IconArrowDownLeft size={18} />
          Einnahmen
        </dt>
        <dd>{money.format(data.income)}</dd>
        <button type="button" onClick={() => onSource({ ...data.scope, type: 'IN' })}>
          Einnahmen ansehen <IconArrowUpRight size={14} />
        </button>
      </div>
      <div className="ai-report-metric ai-report-metric--expense">
        <dt>
          <IconArrowUpRight size={18} />
          Ausgaben
        </dt>
        <dd>{money.format(data.expense)}</dd>
        <button type="button" onClick={() => onSource({ ...data.scope, type: 'OUT' })}>
          Ausgaben ansehen <IconArrowUpRight size={14} />
        </button>
      </div>
      <div
        className={`ai-report-metric ai-report-metric--change${data.change < 0 ? ' is-negative' : ''}`}
      >
        <dt>
          <IconChartLine size={18} />
          Veränderung im Zeitraum
        </dt>
        <dd>
          {data.change > 0 ? '+' : ''}
          {money.format(data.change)}
        </dd>
        <small>Einnahmen minus Ausgaben · brutto</small>
      </div>
    </dl>
  )
}

function BalanceChart({ data, onSource }: { data: ReportFinanceData; onSource: SourceAction }) {
  const [mode, setMode] = useState<'balance' | 'flows'>('balance')
  const [active, setActive] = useState(data.months.length - 1)
  const id = useId().replace(/:/g, '')
  const scroll = useRef<HTMLDivElement>(null)
  const [viewportWidth, setViewportWidth] = useState(560)
  useLayoutEffect(() => {
    const element = scroll.current
    if (!element) return
    const observer = new ResizeObserver(() => setViewportWidth(element.clientWidth))
    observer.observe(element)
    return () => observer.disconnect()
  }, [])
  useScrollToLatest(scroll, data.generatedAt)
  const rows = data.months
  const selected = rows[active] || rows[rows.length - 1]
  if (!selected) return <p>Für diesen Zeitraum liegen keine Monatswerte vor.</p>
  const width = Math.max(560, viewportWidth, rows.length * 56 + 80),
    left = 74,
    right = width - 20,
    top = 18,
    bottom = 180
  const values =
    mode === 'balance'
      ? rows.map((row) => row.balance)
      : rows.flatMap((row) => [row.income, row.expense])
  const min = Math.min(0, ...values),
    max = Math.max(0, ...values)
  const span = max - min || 1
  const y = (value: number) => bottom - ((value - min) / span) * (bottom - top)
  const step = (right - left) / rows.length
  const x = (index: number) => left + (index + 0.5) * step
  const points = rows.map((row, index) => `${x(index)},${y(row.balance)}`).join(' ')
  const barWidth = Math.min(14, step * 0.22)
  const ticks = max === min ? [0] : [max, min + span / 2, min]
  return (
    <section className="ai-report-chart" aria-label="Monatliche Finanzentwicklung">
      <div className="ai-report-chart-heading">
        <div>
          <h4>Entwicklung im Zeitraum</h4>
          <span>
            {mode === 'balance'
              ? `Gebuchter Gesamtbestand · letzter Wert am ${dateLabel(data.scope.to)}`
              : 'Einnahmen und Ausgaben pro Monat'}
          </span>
        </div>
        <div className="ai-report-switch" role="group" aria-label="Diagrammdarstellung">
          <button
            type="button"
            aria-pressed={mode === 'balance'}
            onClick={() => setMode('balance')}
          >
            Bestand
          </button>
          <button type="button" aria-pressed={mode === 'flows'} onClick={() => setMode('flows')}>
            Einnahmen / Ausgaben
          </button>
        </div>
      </div>
      {mode === 'flows' && (
        <div className="ai-report-legend">
          <span>
            <i />
            Einnahmen
          </span>
          <span>
            <i />
            Ausgaben
          </span>
        </div>
      )}
      <div
        ref={scroll}
        className="ai-report-chart-scroll"
        tabIndex={0}
        aria-label="Diagramm horizontal scrollen"
      >
        <div className="ai-report-plot" style={{ width }}>
          <svg viewBox={`0 0 ${width} 218`} width={width} height="218" aria-hidden="true">
            <defs>
              <linearGradient id={id} x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="var(--accent)" stopOpacity=".2" />
                <stop offset="100%" stopColor="var(--accent)" stopOpacity=".03" />
              </linearGradient>
            </defs>
            {ticks.map((tick, index) => (
              <g key={index}>
                <line
                  x1={left}
                  x2={right}
                  y1={y(tick)}
                  y2={y(tick)}
                  className="ai-report-gridline"
                />
                <text x={left - 10} y={y(tick) + 4} textAnchor="end" className="ai-report-axis">
                  {new Intl.NumberFormat('de-DE', {
                    notation: 'compact',
                    maximumFractionDigits: 1
                  }).format(tick)}{' '}
                  €
                </text>
              </g>
            ))}
            <line x1={left} x2={right} y1={y(0)} y2={y(0)} className="ai-report-zero" />
            <rect
              x={x(active) - step / 2 + 3}
              y={top - 8}
              width={step - 6}
              height={bottom - top + 16}
              className="ai-report-selected-month"
              rx="6"
            />
            {mode === 'balance' ? (
              <>
                <path
                  d={`M${x(0)},${y(0)} L${points.split(' ').join(' L')} L${x(rows.length - 1)},${y(0)} Z`}
                  fill={`url(#${id})`}
                />
                <polyline
                  points={points}
                  fill="none"
                  stroke="var(--accent)"
                  strokeWidth="2.5"
                  strokeLinejoin="round"
                />
                {rows.map((row, index) => (
                  <circle
                    key={row.month}
                    cx={x(index)}
                    cy={y(row.balance)}
                    r={index === active ? 5 : 3}
                    fill="var(--accent)"
                    stroke="var(--surface)"
                    strokeWidth="2"
                  />
                ))}
              </>
            ) : (
              rows.map((row, index) => (
                <g key={row.month}>
                  {(['income', 'expense'] as const).map((key, offset) => (
                    <rect
                      key={key}
                      x={x(index) + (offset ? 2 : -barWidth - 2)}
                      y={Math.min(y(0), y(row[key]))}
                      width={barWidth}
                      height={Math.abs(y(row[key]) - y(0))}
                      rx="2"
                      fill={key === 'income' ? 'var(--success)' : 'var(--accent)'}
                    />
                  ))}
                </g>
              ))
            )}
            {rows.map((row, index) => (
              <text
                key={row.month}
                x={x(index)}
                y="208"
                textAnchor="middle"
                className="ai-report-axis"
              >
                {shortMonth(row.month)}
              </text>
            ))}
          </svg>
          <div className="ai-report-month-targets" style={{ left, right: width - right }}>
            {rows.map((row, index) => (
              <button
                key={row.month}
                type="button"
                aria-label={`${monthLabel(row.month)}: Bestand ${money.format(row.balance)}, Einnahmen ${money.format(row.income)}, Ausgaben ${money.format(row.expense)}. Buchungen öffnen.`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                onClick={() => onSource({ from: row.from, to: row.to })}
              />
            ))}
          </div>
        </div>
      </div>
      <div className="ai-report-month-detail">
        <div>
          <strong>{monthLabel(selected.month)}</strong>
          <span>
            {dateLabel(selected.from)} – {dateLabel(selected.to)}
          </span>
        </div>
        <dl>
          <div>
            <dt>Einnahmen</dt>
            <dd>{money.format(selected.income)}</dd>
          </div>
          <div>
            <dt>Ausgaben</dt>
            <dd>{money.format(selected.expense)}</dd>
          </div>
          <div>
            <dt>{mode === 'balance' ? 'Bestand' : 'Veränderung'}</dt>
            <dd>{money.format(mode === 'balance' ? selected.balance : selected.change)}</dd>
          </div>
        </dl>
        <button
          type="button"
          className="ai-report-source-button"
          onClick={() => onSource({ from: selected.from, to: selected.to })}
        >
          <IconReceipt2 size={16} />
          Monatsbuchungen öffnen
        </button>
      </div>
    </section>
  )
}

/** Shared renderer for typed answer blocks; never executes model-generated markup. */
export default function ReportAnswerCard({
  answer,
  question,
  onSource,
  onFollowUp,
  busy = false
}: {
  answer: ReportAnswer
  question: string
  onSource: SourceAction
  onFollowUp: (question: string, scope: ReportScope) => void
  busy?: boolean
}) {
  const data = answer.datasets.finance
  const visual = answer.blocks.length > 0
  const strongest = data.months.reduce<(typeof data.months)[number] | undefined>(
    (best, row) => (!best || Math.abs(row.change) > Math.abs(best.change) ? row : best),
    undefined
  )
  return (
    <article className="ai-report-answer">
      <header className="ai-report-heading">
        <p className="ai-report-question">{question}</p>
        <div className="ai-report-eyebrow">
          <span className="ai-report-dot" />
          {visual ? 'Finanzauswertung' : 'KI-Einordnung'}
          <span>·</span>
          {dateLabel(data.scope.from)} – {dateLabel(data.scope.to)}
        </div>
        <h3>{answer.title}</h3>
        <p className="ai-report-summary">{answer.summary}</p>
      </header>
      {visual && !data.hasBookings && (
        <p className="ai-report-notice">
          Keine Einnahmen- oder Ausgabenbuchungen in diesem Zeitraum. Ein vorhandener Anfangsbestand
          wird fortgeführt.
        </p>
      )}
      {answer.blocks.map((block, index) =>
        block.type === 'metrics' ? (
          <Metrics key={index} data={answer.datasets[block.data]} onSource={onSource} />
        ) : (
          <BalanceChart key={index} data={answer.datasets[block.data]} onSource={onSource} />
        )
      )}
      {visual && strongest && strongest.change !== 0 && (
        <div className="ai-report-insight">
          <IconChartLine size={19} />
          <p>
            <strong>Stärkste monatliche Veränderung</strong>
            <span>
              {monthLabel(strongest.month)} · {money.format(strongest.change)}
            </span>
          </p>
          <button
            type="button"
            onClick={() => onSource({ from: strongest.from, to: strongest.to })}
          >
            Buchungen ansehen <IconArrowUpRight size={15} />
          </button>
        </div>
      )}
      <details className="ai-report-sources">
        <summary>Datenbasis{visual ? ' und Monatswerte' : ''}</summary>
        <p>
          Auswertung vom {new Date(data.generatedAt).toLocaleString('de-DE')}. Gebuchte Bruttowerte
          in EUR aus VereinO. Offene Posten sind nicht enthalten. Umbuchungen und interne Buchungen
          verändern den Gesamtbestand nicht.
        </p>
        {visual && (
          <>
            <dl className="ai-report-balances">
              <div>
                <dt>Anfangsbestand vor {dateLabel(data.scope.from)}</dt>
                <dd>{money.format(data.opening)}</dd>
              </div>
              <div>
                <dt>Gebuchter Bestand am {dateLabel(data.scope.to)}</dt>
                <dd>{money.format(data.closing)}</dd>
              </div>
            </dl>
            <p>
              Der gebuchte Bestand ist kein abgeglichener Bankkontostand. Erste und letzte Monate
              können Teilzeiträume sein.
            </p>
            <div className="ai-report-table-scroll">
              <table>
                <caption>Berechnete Monatswerte</caption>
                <thead>
                  <tr>
                    <th>Zeitraum</th>
                    <th>Einnahmen</th>
                    <th>Ausgaben</th>
                    <th>Veränderung</th>
                    <th>Bestand</th>
                  </tr>
                </thead>
                <tbody>
                  {data.months.map((row) => (
                    <tr key={row.month}>
                      <th>
                        <button
                          type="button"
                          onClick={() => onSource({ from: row.from, to: row.to })}
                        >
                          {dateLabel(row.from)} – {dateLabel(row.to)}
                        </button>
                      </th>
                      <td>{money.format(row.income)}</td>
                      <td>{money.format(row.expense)}</td>
                      <td>{money.format(row.change)}</td>
                      <td>{money.format(row.balance)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
        <button
          type="button"
          className="ai-report-source-button"
          onClick={() => onSource(data.scope)}
        >
          <IconReceipt2 size={16} />
          Buchungen im Zeitraum öffnen
        </button>
      </details>
      {answer.notes.length > 0 && (
        <details className="ai-report-sources">
          <summary>Hinweise zur Einordnung</summary>
          <ul>
            {answer.notes.map((note, index) => (
              <li key={index}>{note}</li>
            ))}
          </ul>
        </details>
      )}
      <div className="ai-report-followups" aria-label="Passende Anschlussfragen">
        {(visual
          ? [
              'Erkläre die Entwicklung kurz für den Vorstand.',
              'Wie unterscheiden sich Einnahmen und Ausgaben im Zeitraum?'
            ]
          : ['Wie hat sich unser Saldo entwickelt?']
        ).map((prompt) => (
          <button
            type="button"
            key={prompt}
            disabled={busy}
            onClick={() => onFollowUp(prompt, data.scope)}
          >
            {prompt}
            <IconArrowUpRight size={14} />
          </button>
        ))}
      </div>
    </article>
  )
}
