import { AiMarkdown, type AiVoucherMention } from './AiMarkdown'
import type { AiMessage } from './aiChat'

type BookingDraft = NonNullable<AiMessage['bookingDraft']>

type Props = {
  messages: AiMessage[]
  onOpenVoucher: (mention: AiVoucherMention) => void
  onOpenJob: (id: number) => void
  onOpenBookingDraftFromJob: (id: number) => void
  onOpenMessageDraft: (draft: BookingDraft) => void
  onShowFile: (path: string) => void
}

export function AiMessageList({
  messages,
  onOpenVoucher,
  onOpenJob,
  onOpenBookingDraftFromJob,
  onOpenMessageDraft,
  onShowFile
}: Props) {
  if (!messages.length) return null
  return <section className="ai-conversation-card">
    <div className="ai-message-list">
      {messages.map((message) => {
        const body = message.displayBody ?? message.body
        return <article key={message.id} className={`ai-message ai-message--${message.role} ${message.role === 'assistant' && message.isStreaming ? 'is-streaming' : ''}`}>
          <div className="ai-message-head"><strong>{message.title || (message.role === 'user' ? 'Du' : 'VereinO KI')}</strong>{message.meta && <span>{message.meta}</span>}</div>
          {message.role === 'assistant'
            ? message.isStreaming
              ? <p className="ai-message-stream-text">{body}</p>
              : <AiMarkdown text={body} onOpenVoucher={onOpenVoucher} />
            : <p>{message.body}</p>}
          {message.jobId && message.reviewable && <>
            <button className="btn" type="button" onClick={() => onOpenJob(message.jobId!)}>Review öffnen</button>
            <button className="btn" type="button" onClick={() => onOpenBookingDraftFromJob(message.jobId!)}>Buchungsentwurf</button>
          </>}
          {message.bookingDraft && <button className="btn" type="button" disabled={message.bookingDraft.status === 'SAVED'} onClick={() => onOpenMessageDraft(message.bookingDraft!)}>
            {message.bookingDraft.status === 'SAVED' ? message.bookingDraft.voucherNo ? `Erstellt · ${message.bookingDraft.voucherNo}` : 'Erstellt' : 'Buchungsentwurf öffnen'}
          </button>}
          {message.filePath && <button className="btn" type="button" onClick={() => onShowFile(message.filePath!)}>Im Ordner anzeigen</button>}
        </article>
      })}
    </div>
  </section>
}
