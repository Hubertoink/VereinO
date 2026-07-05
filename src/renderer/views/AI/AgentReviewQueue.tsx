export type AgentReviewQueueItem = {
  id: string
  title: string
  summary: string
  status: 'OPEN' | 'DONE' | 'WAITING'
  count?: number | null
  anchorId: string
}

type Props = {
  items: AgentReviewQueueItem[]
  onOpen: (item: AgentReviewQueueItem) => void
}

function statusLabel(status: AgentReviewQueueItem['status']) {
  if (status === 'DONE') return 'erledigt'
  if (status === 'WAITING') return 'wartet'
  return 'offen'
}

export function AgentReviewQueue({ items, onOpen }: Props) {
  if (!items.length) return null
  const openCount = items.filter((item) => item.status !== 'DONE').length

  return (
    <section className="card ai-agent-review-queue">
      <div className="ai-section-head">
        <strong>Agent-Review-Queue</strong>
        <span>{openCount} offen · {items.length} gesamt</span>
      </div>
      <div className="ai-agent-review-queue__list">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`ai-agent-review-queue__item ai-agent-review-queue__item--${item.status.toLowerCase()}`}
            onClick={() => onOpen(item)}
          >
            <span>
              <strong>{item.title}</strong>
              <em>{item.summary}</em>
            </span>
            <small>{[item.count != null ? `${item.count}` : null, statusLabel(item.status)].filter(Boolean).join(' · ')}</small>
          </button>
        ))}
      </div>
    </section>
  )
}
