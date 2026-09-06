import type { RefObject } from 'react'
import { IconDiamond, IconMenu2, IconSettings } from '@tabler/icons-react'
import AppIcon from '../../components/common/AppIcon'
import { AiAvatar, type AiAvatarFrame } from './AiAvatar'
import type { AiDrawer } from './aiViewReducer'

type Props = {
  busy: boolean
  hasPendingReview: boolean
  avatarFrame: AiAvatarFrame
  hasApiKey: boolean
  chatStarted: boolean
  onNewChat: () => void
  onToggleDrawer: (drawer: AiDrawer) => void
  historyButtonRef: RefObject<HTMLButtonElement>
  agentContextButtonRef: RefObject<HTMLButtonElement>
  settingsButtonRef: RefObject<HTMLButtonElement>
  rulesButtonRef: RefObject<HTMLButtonElement>
}

export function AiAssistantHeader({
  busy,
  hasPendingReview,
  avatarFrame,
  hasApiKey,
  chatStarted,
  onNewChat,
  onToggleDrawer,
  historyButtonRef,
  agentContextButtonRef,
  settingsButtonRef,
  rulesButtonRef
}: Props) {
  return (
    <header className="ai-header ai-assistant-header">
      <div className="ai-header-brand">
        <AiAvatar busy={busy} hasPendingReview={hasPendingReview} frame={avatarFrame} />
        <div className="ai-header-title">
          <div className="ai-header-title-line">
            <h1>KI</h1>
            <span className={`ai-key-state ${hasApiKey ? 'is-ready' : 'is-missing'}`}>
              {hasApiKey ? 'API-Key aktiv' : 'API-Key fehlt'}
            </span>
          </div>
        </div>
      </div>
      <div className="ai-header-actions">
        {chatStarted && (
          <button className="btn ai-header-new-chat" type="button" onClick={onNewChat}>
            + Neuer Chat
          </button>
        )}
        <button
          ref={rulesButtonRef}
          className="btn ai-header-rules"
          type="button"
          onClick={() => onToggleDrawer('rules')}
          aria-label="KI-Regelkatalog"
          title="KI-Regelkatalog"
        >
          ✦ Regeln
        </button>
        <button
          ref={historyButtonRef}
          className="btn ai-icon-btn"
          type="button"
          onClick={() => onToggleDrawer('history')}
          aria-label="KI-Verlauf"
        >
          <AppIcon icon={IconMenu2} size="action" />
        </button>
        <button
          ref={agentContextButtonRef}
          className="btn ai-icon-btn ai-agent-context-toggle"
          type="button"
          onClick={() => onToggleDrawer('agentContext')}
          aria-label="Agent-Kontext"
          title="Agent-Kontext"
        >
          <AppIcon icon={IconDiamond} size="action" />
        </button>
        <button
          ref={settingsButtonRef}
          className="btn ai-icon-btn"
          type="button"
          onClick={() => onToggleDrawer('settings')}
          aria-label="KI-Einstellungen"
        >
          <AppIcon icon={IconSettings} size="action" />
        </button>
      </div>
    </header>
  )
}
