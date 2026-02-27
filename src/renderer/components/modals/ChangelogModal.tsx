import React, { useMemo } from 'react'
import changelogRaw from '../../../../CHANGELOG.md?raw'

interface ChangelogEntry {
  version: string
  date: string
  sections: { heading: string; items: string[] }[]
}

function parseChangelog(raw: string): ChangelogEntry[] {
  const entries: ChangelogEntry[] = []
  let current: ChangelogEntry | null = null
  let currentSection: { heading: string; items: string[] } | null = null

  for (const line of raw.split('\n')) {
    // Match version headings like ## [1.8.1] – 2026-02-26
    const versionMatch = line.match(/^## \[(.+?)\]\s*[–-]\s*(\d{4}-\d{2}-\d{2})/)
    if (versionMatch) {
      if (current) entries.push(current)
      current = { version: versionMatch[1], date: versionMatch[2], sections: [] }
      currentSection = null
      continue
    }

    // Match section headings like ### Hinzugefügt
    const sectionMatch = line.match(/^### (.+)/)
    if (sectionMatch && current) {
      currentSection = { heading: sectionMatch[1], items: [] }
      current.sections.push(currentSection)
      continue
    }

    // Match list items
    const itemMatch = line.match(/^- (.+)/)
    if (itemMatch && currentSection) {
      currentSection.items.push(itemMatch[1])
    }
  }
  if (current) entries.push(current)
  return entries
}

const SECTION_ICONS: Record<string, string> = {
  Hinzugefügt: '✨',
  Geändert: '🔄',
  Behoben: '🐛',
  Entfernt: '🗑️',
  Sicherheit: '🔒',
}

interface ChangelogModalProps {
  onClose: () => void
  appVersion: string
}

export function ChangelogModal({ onClose, appVersion }: ChangelogModalProps): React.JSX.Element {
  const entries = useMemo(() => parseChangelog(changelogRaw), [])

  return (
    <div className="modal-overlay" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal changelog-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="modal-header">
          <h2>
            📋 Changelog {appVersion && <span className="changelog-version-badge">v{appVersion}</span>}
          </h2>
          <button className="btn ghost" onClick={onClose} aria-label="Schließen">✕</button>
        </div>

        {/* Content */}
        <div className="changelog-content">
          {entries.length === 0 && (
            <p className="changelog-empty">Keine Einträge vorhanden.</p>
          )}
          {entries.map((entry) => (
            <div key={entry.version} className="changelog-entry">
              <div className="changelog-entry-header">
                <span className="changelog-entry-version">v{entry.version}</span>
                <span className="changelog-entry-date">{formatDate(entry.date)}</span>
              </div>
              {entry.sections.map((section) => (
                <div key={section.heading} className="changelog-section">
                  <h4 className="changelog-section-heading">
                    {SECTION_ICONS[section.heading] ?? '📌'} {section.heading}
                  </h4>
                  <ul className="changelog-items">
                    {section.items.map((item, i) => (
                      <li key={i}>{item}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function formatDate(iso: string): string {
  try {
    return new Date(iso + 'T00:00:00').toLocaleDateString('de-DE', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
    })
  } catch {
    return iso
  }
}
