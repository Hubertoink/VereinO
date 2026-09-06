import type { AiPlannerQuestionOption, AiPlannerQuestionState } from './aiViewTypes'

type Props = {
  state: AiPlannerQuestionState
  busy: boolean
  onResolve: (option: AiPlannerQuestionOption) => void
}

export function AiPlannerQuestionCard({ state, busy, onResolve }: Props) {
  if (state.status !== 'OPEN') return null

  return (
    <section id="ai-review-planner-question" className="card ai-planner-question-card">
      <div className="ai-section-head">
        <strong>{state.question}</strong>
        <span>Planer</span>
      </div>
      <p>{state.body}</p>
      <div className="ai-planner-options">
        {state.options.map((option) => (
          <button
            key={option.id}
            className={option.id === 'CREATE_TAGS_AND_BOOK_ALL' ? 'primary' : ''}
            type="button"
            disabled={busy}
            onClick={() => onResolve(option)}
          >
            <strong>{option.label}</strong>
            <span>{option.description}</span>
          </button>
        ))}
      </div>
    </section>
  )
}
