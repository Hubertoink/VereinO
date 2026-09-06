const defaultSrc = new URL('../../../../assets/VereinI/VereinI-Default.png', import.meta.url).href
const blinkSrc = new URL('../../../../assets/VereinI/Vereini_Blink.png', import.meta.url).href
const smirkSrc = new URL('../../../../assets/VereinI/Vereini_Smirk.png', import.meta.url).href
const successSrc = new URL('../../../../assets/VereinI/Vereini_Sucess.png', import.meta.url).href
const thinkingSrc = new URL('../../../../assets/VereinI/Vereini_Thinking.png', import.meta.url).href

export type AiAvatarFrame = 'default' | 'blink' | 'smirk' | 'success' | 'thinking'

export function AiAvatar({ busy, hasPendingReview, frame }: { busy: boolean; hasPendingReview: boolean; frame: AiAvatarFrame }) {
  return <div className={`ai-header-avatar ${busy ? 'is-busy' : ''} ${hasPendingReview ? 'is-reviewing' : ''} ${frame === 'thinking' || frame === 'success' ? 'is-replacement-state' : ''}`} aria-hidden="true">
    <img src={defaultSrc} alt="" className="ai-header-avatar__layer ai-header-avatar__layer--base" />
    <img src={blinkSrc} alt="" className={`ai-header-avatar__layer ai-header-avatar__layer--overlay ${frame === 'blink' ? 'is-active' : ''}`} />
    <img src={smirkSrc} alt="" className={`ai-header-avatar__layer ai-header-avatar__layer--overlay ${frame === 'smirk' ? 'is-active' : ''}`} />
    <img src={thinkingSrc} alt="" className={`ai-header-avatar__layer ai-header-avatar__layer--replacement ${frame === 'thinking' ? 'is-active' : ''}`} />
    <img src={successSrc} alt="" className={`ai-header-avatar__layer ai-header-avatar__layer--replacement ${frame === 'success' ? 'is-active' : ''}`} />
  </div>
}
