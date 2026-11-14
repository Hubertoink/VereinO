import React, { type ReactNode } from 'react'

interface SettingsPageHeaderProps {
  title: string
  description: string
  actions?: ReactNode
  meta?: ReactNode
  count?: number
}

export function SettingsPageHeader({
  title,
  description,
  actions,
  meta,
  count
}: SettingsPageHeaderProps) {
  return (
    <header className="settings-page-header">
      <div className="settings-page-header__copy">
        <h2>
          {title}
          {count !== undefined && <span className="settings-page-count">{count}</span>}
        </h2>
        <p>{description}</p>
        {meta && <div className="settings-page-meta">{meta}</div>}
      </div>
      {actions && <div className="settings-page-header__actions">{actions}</div>}
    </header>
  )
}
