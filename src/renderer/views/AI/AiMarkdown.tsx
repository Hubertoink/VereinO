import React from 'react'
import { normalizeLookup } from './aiText'

export type AiVoucherMention = {
  key: string
  id?: number
  voucherNo?: string
  date?: string
  description: string
  amount?: string
  type?: 'IN' | 'OUT'
}

function stripMarkdownInline(value: string) {
  return String(value || '')
    .replace(/\*\*/g, '')
    .trim()
}

function voucherMentionFromContext(
  id: number | null,
  voucherNo: string | null,
  text: string,
  start: number
): AiVoucherMention {
  const context = cleanVoucherMentionText(
    text.slice(Math.max(0, start - 80), Math.min(text.length, start + 140))
  )
  const date = context.match(/\b20\d{2}-\d{2}-\d{2}\b/)?.[0]
  const amount = context.match(/[+-]?\d{1,3}(?:\.\d{3})*,\d{2}\s*€/)?.[0]
  const type = context.match(/\b(IN|OUT)\b/)?.[1] as AiVoucherMention['type'] | undefined
  const description = context
    .replace(/\b(?:ID|Beleg|Belege|Buchung|Buchungen|Voucher)\s*#?\s*\d+(?:\s*\/\s*\d+)*/gi, '')
    .replace(/\b20\d{2}-\d{2}-\d{2}_\d{5}\b/g, '')
    .replace(/\b20\d{2}-\d{2}-\d{2}\b/g, '')
    .replace(/[+-]?\d{1,3}(?:\.\d{3})*,\d{2}\s*€/g, '')
    .replace(/[–—-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  return {
    key: id ? `id-${id}` : `no-${voucherNo}`,
    id: id || undefined,
    voucherNo: voucherNo || undefined,
    date,
    amount,
    type,
    description: description || (id ? `Buchung #${id}` : `Voucher ${voucherNo}`)
  }
}

function shouldSkipInlineVoucherReference(text: string, start: number, label?: string) {
  const before = normalizeLookup(text.slice(Math.max(0, start - 32), start))
  const after = normalizeLookup(text.slice(start, start + 48))
  const context = `${before} ${after}`
  const nonVoucherPrefix =
    /(budget|bank\s*import|bankimport|bank\s*transaktion|banktransaktion|bank\s*beleg|bankbeleg|transaktion|transaction|zahlungskonto|konto)$/
  const nonVoucherId =
    /(budget id|bank\s*import id|bankimport id|bank\s*transaktion id|banktransaktion id|bank\s*beleg id|bankbeleg id|transaktion id|transaction id|paymentaccount id)/
  if (nonVoucherPrefix.test(before)) return true
  if (nonVoucherId.test(context)) return true
  return (
    normalizeLookup(label) === 'id' &&
    /(budget|bank\s*import|bankimport|bank\s*transaktion|banktransaktion|bank\s*beleg|bankbeleg|transaktion|transaction)/.test(
      before
    )
  )
}

function renderVoucherReference(
  mention: AiVoucherMention,
  onOpenVoucher: (mention: AiVoucherMention) => void,
  key: string
) {
  return (
    <button
      key={key}
      type="button"
      className={`ai-inline-voucher-ref ai-inline-voucher-ref--${mention.type ? mention.type.toLowerCase() : 'neutral'}`}
      title={`${mention.description}${mention.amount ? ` · ${mention.amount}` : ''}`}
      onClick={() => onOpenVoucher(mention)}
    >
      {mention.id ? `ID ${mention.id}` : mention.voucherNo}
    </button>
  )
}

function renderInlineVoucherReferences(
  text: string,
  onOpenVoucher?: (mention: AiVoucherMention) => void
) {
  if (!onOpenVoucher) return [text]
  const nodes: React.ReactNode[] = []
  const regex =
    /\b(Buchungen|Buchung|Belege|Beleg|Voucher|ID)\s*#?\s*((?:\d+\s*(?:\/\s*)?)+)|\b(20\d{2}-\d{2}-\d{2}_\d{5})\b/gi
  let lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(text))) {
    const start = match.index
    if (start > lastIndex) nodes.push(text.slice(lastIndex, start))
    if (match[3]) {
      const voucherNo = match[3]
      const mention = voucherMentionFromContext(null, voucherNo, text, start)
      nodes.push(renderVoucherReference(mention, onOpenVoucher, `voucher-no-${voucherNo}-${start}`))
    } else if (shouldSkipInlineVoucherReference(text, start, match[1])) {
      nodes.push(match[0])
    } else {
      const ids = Array.from(match[2].matchAll(/\d+/g))
        .map((item) => Number(item[0]))
        .filter((id) => Number.isInteger(id) && id > 0)
      nodes.push(`${match[1]} `)
      ids.forEach((id, idx) => {
        if (idx > 0) nodes.push(' / ')
        nodes.push(
          renderVoucherReference(
            voucherMentionFromContext(id, null, text, start),
            onOpenVoucher,
            `voucher-id-${id}-${start}-${idx}`
          )
        )
      })
    }
    lastIndex = regex.lastIndex
  }
  if (lastIndex < text.length) nodes.push(text.slice(lastIndex))
  return nodes.length ? nodes : [text]
}

function renderInlineMarkdown(text: string, onOpenVoucher?: (mention: AiVoucherMention) => void) {
  const parts = String(text || '').split(/(\*\*[^*]+\*\*)/g)
  return parts.map((part, idx) => {
    const strong = part.match(/^\*\*([^*]+)\*\*$/)
    return strong ? (
      <strong key={idx}>{renderInlineColorValues(strong[1], onOpenVoucher)}</strong>
    ) : (
      <React.Fragment key={idx}>
        {renderInlineColorValues(part, onOpenVoucher)}
      </React.Fragment>
    )
  })
}

const HEX_COLOR_PATTERN = /#[0-9a-fA-F]{3,8}\b/g

function renderInlineColorValues(text: string, onOpenVoucher?: (mention: AiVoucherMention) => void) {
  const parts = String(text || '').split(HEX_COLOR_PATTERN)
  const matches = String(text || '').match(HEX_COLOR_PATTERN) || []
  const nodes: React.ReactNode[] = []
  parts.forEach((part, idx) => {
    if (part) nodes.push(renderInlineVoucherReferences(part, onOpenVoucher))
    const color = matches[idx]
    if (color) {
      nodes.push(
        <span className="ai-inline-color" key={`color-${idx}`} title={`Farbe ${color}`}>
          <i aria-hidden="true" style={{ backgroundColor: color }} />
          {color}
        </span>
      )
    }
  })
  return nodes.length ? nodes : [text]
}

function splitMarkdownTableRow(line: string) {
  const trimmed = String(line || '')
    .trim()
    .replace(/^\|/, '')
    .replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

function isMarkdownTableSeparator(line: string) {
  const cells = splitMarkdownTableRow(line)
  return cells.length > 1 && cells.every((cell) => /^:?-{3,}:?$/.test(cell.replace(/\s+/g, '')))
}

function isMarkdownTableLine(line: string) {
  return /^\s*\|.+\|\s*$/.test(line) && splitMarkdownTableRow(line).length > 1
}

function parseCompactMarkdownTable(line: string) {
  const normalized = String(line || '').trim()
  const separator = normalized.match(/\|\s*:?-{3,}:?(?:\s*\|\s*:?-{3,}:?)+\s*\|?/)
  if (!separator) return null
  const before = normalized.slice(0, separator.index).trim()
  const after = normalized.slice((separator.index || 0) + separator[0].length).trim()
  const headers = splitMarkdownTableRow(before)
  if (headers.length < 2 || !after) return null
  const cells = splitMarkdownTableRow(after)
  if (cells.length < headers.length) return null
  const rows: string[][] = []
  for (let idx = 0; idx < cells.length; idx += headers.length) {
    const row = cells.slice(idx, idx + headers.length)
    if (row.length === headers.length && row.some(Boolean)) rows.push(row)
  }
  return rows.length ? { headers, rows } : null
}

function renderMarkdownTable(
  headers: string[],
  rows: string[][],
  key: string,
  onOpenVoucher?: (mention: AiVoucherMention) => void
) {
  const shouldRenderVoucherLinksInColumn = (header: string) => {
    const normalized = normalizeLookup(header)
    return !/\b(bank\s*transaktion|banktransaktion|bank\s*beleg|bankbeleg|transaktion|transaction)\b/.test(
      normalized
    )
  }
  const columnClassName = (header: string) => {
    const normalized = normalizeLookup(header)
    if (/(betrag|summe|saldo|einnahm|ausgab|brutto|netto|mwst|ust|preis|kosten)/.test(normalized))
      return 'is-number'
    if (/(datum|faellig|fallig|zeitraum)/.test(normalized)) return 'is-date'
    return undefined
  }
  return (
    <div key={key} className="ai-markdown-table-wrap">
      <table className="ai-markdown-table">
        <thead>
          <tr>
            {headers.map((header, headerIdx) => (
              <th key={headerIdx} className={columnClassName(header)}>
                {renderInlineMarkdown(header, onOpenVoucher)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {headers.map((header, cellIdx) => {
                const cellOpenVoucher = shouldRenderVoucherLinksInColumn(header)
                  ? onOpenVoucher
                  : undefined
                return (
                  <td key={cellIdx} className={columnClassName(header || '')}>
                    {renderInlineMarkdown(row[cellIdx] || '', cellOpenVoucher)}
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AiMarkdown({
  text,
  onOpenVoucher
}: {
  text: string
  onOpenVoucher?: (mention: AiVoucherMention) => void
}) {
  const blocks: React.ReactNode[] = []
  const lines = String(text || '').split(/\r?\n/)
  let idx = 0
  while (idx < lines.length) {
    const line = lines[idx].trim()
    if (!line) {
      idx += 1
      continue
    }

    const heading = line.match(/^(#{1,3})\s+(.+)$/) || line.match(/^\*\*([^*]+)\*\*$/)
    if (heading) {
      const content = heading[2] || heading[1]
      blocks.push(<h4 key={`h-${idx}`}>{renderInlineMarkdown(content, onOpenVoucher)}</h4>)
      idx += 1
      continue
    }

    if (isMarkdownTableLine(line)) {
      const compactTable = parseCompactMarkdownTable(line)
      if (compactTable) {
        blocks.push(
          renderMarkdownTable(
            compactTable.headers,
            compactTable.rows,
            `table-${idx}`,
            onOpenVoucher
          )
        )
        idx += 1
        continue
      }

      if (idx + 1 < lines.length && isMarkdownTableSeparator(lines[idx + 1])) {
        const headers = splitMarkdownTableRow(line)
        idx += 2
        const rows: string[][] = []
        while (idx < lines.length && isMarkdownTableLine(lines[idx])) {
          const row = splitMarkdownTableRow(lines[idx])
          rows.push(headers.map((_, cellIdx) => row[cellIdx] || ''))
          idx += 1
        }
        blocks.push(renderMarkdownTable(headers, rows, `table-${idx}`, onOpenVoucher))
        continue
      }
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = []
      while (idx < lines.length && /^[-*]\s+/.test(lines[idx].trim())) {
        items.push(lines[idx].trim().replace(/^[-*]\s+/, ''))
        idx += 1
      }
      blocks.push(
        <ul key={`ul-${idx}`}>
          {items.map((item, itemIdx) => (
            <li key={itemIdx}>{renderInlineMarkdown(item, onOpenVoucher)}</li>
          ))}
        </ul>
      )
      continue
    }

    if (/^\d+[.)]\s+/.test(line)) {
      const items: string[] = []
      while (idx < lines.length && /^\d+[.)]\s+/.test(lines[idx].trim())) {
        items.push(lines[idx].trim().replace(/^\d+[.)]\s+/, ''))
        idx += 1
      }
      blocks.push(
        <ol key={`ol-${idx}`}>
          {items.map((item, itemIdx) => (
            <li key={itemIdx}>{renderInlineMarkdown(item, onOpenVoucher)}</li>
          ))}
        </ol>
      )
      continue
    }

    const paragraph: string[] = []
    while (
      idx < lines.length &&
      lines[idx].trim() &&
      !/^(#{1,3})\s+/.test(lines[idx].trim()) &&
      !/^\*\*[^*]+\*\*$/.test(lines[idx].trim()) &&
      !isMarkdownTableLine(lines[idx].trim()) &&
      !/^[-*]\s+/.test(lines[idx].trim()) &&
      !/^\d+[.)]\s+/.test(lines[idx].trim())
    ) {
      paragraph.push(lines[idx].trim())
      idx += 1
    }
    blocks.push(<p key={`p-${idx}`}>{renderInlineMarkdown(paragraph.join(' '), onOpenVoucher)}</p>)
  }

  return <div className="ai-markdown">{blocks}</div>
}

function cleanVoucherMentionText(value: string) {
  return stripMarkdownInline(value)
    .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
    .replace(/\s+/g, ' ')
    .trim()
}
