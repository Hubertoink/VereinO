import { AiMarkdown, type AiVoucherMention } from './AiMarkdown'
import type { AiMessage } from './aiChat'
import type { ReportScope } from '../../../../shared/aiReporting'
import ReportAnswerCard from '../../components/ai/ReportAnswerCard'
import { openReportBookings } from '../../utils/reportNavigation'
import { visibleAiText, reportSupplement } from '../../../../shared/aiVisibleText'

type BookingDraft = NonNullable<AiMessage['bookingDraft']>

type Props = {
  messages: AiMessage[]
  onOpenVoucher: (mention: AiVoucherMention) => void
  onOpenJob: (id: number) => void
  onOpenBookingDraftFromJob: (id: number) => void
  onOpenMessageDraft: (draft: BookingDraft) => void
  onShowFile: (path: string) => void
  onReportFollowUp?: (question: string, scope: ReportScope) => void
  busy?: boolean
}

export function AiMessageList({
  messages,
  onOpenVoucher,
  onOpenJob,
  onOpenBookingDraftFromJob,
  onOpenMessageDraft,
  onShowFile,
  onReportFollowUp,
  busy = false
}: Props) {
  if (!messages.length) return null
  return <section className="ai-conversation-card">
    <div className="ai-message-list">
      {messages.map((message) => {
        const body = message.role === 'assistant' ? visibleAiText(message.displayBody ?? message.body) : message.body
        const supplement = reportSupplement(body, message.reports)
        return <article key={message.id} className={`ai-message ai-message--${message.role}${message.reports?.length ? ' ai-message--report' : ''} ${message.role === 'assistant' && message.isStreaming ? 'is-streaming' : ''}`}>
          <div className="ai-message-head"><strong>{message.title || (message.role === 'user' ? 'Du' : 'VereinO KI')}</strong>{message.meta && <span>{message.meta}</span>}</div>
          {message.reports?.length ? message.reports.map((report, index) => <ReportAnswerCard key={index} answer={report}
            question={message.reportQuestion || message.title || ''} onSource={openReportBookings}
            busy={busy || !onReportFollowUp} onFollowUp={(question, scope) => onReportFollowUp?.(question, scope)} />) : message.role === 'assistant'
            ? message.isStreaming
              ? <p className="ai-message-stream-text">{body}</p>
              : <AiMarkdown text={body} onOpenVoucher={onOpenVoucher} />
            : <p>{message.body}</p>}
          {!!message.reports?.length && supplement && <AiMarkdown text={supplement} onOpenVoucher={onOpenVoucher} />}
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
