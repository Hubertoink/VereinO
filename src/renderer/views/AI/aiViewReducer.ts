export type AiDrawer = 'history' | 'agentContext' | 'settings' | 'rules'

export type AiViewUiState = Record<AiDrawer, boolean>

export type AiViewUiAction =
  | { type: 'OPEN_ONLY'; drawer: AiDrawer }
  | { type: 'TOGGLE'; drawer: AiDrawer }
  | { type: 'CLOSE'; drawer: AiDrawer }
  | { type: 'CLOSE_ALL' }

export const initialAiViewUiState: AiViewUiState = {
  history: false,
  agentContext: false,
  settings: false,
  rules: false
}

/**
 * Die vier Drawer schließen sich gegenseitig aus. Das zentral festzuhalten
 * verhindert widersprüchliche UI-Zustände und erleichtert spätere Erweiterungen.
 */
export function aiViewUiReducer(state: AiViewUiState, action: AiViewUiAction): AiViewUiState {
  switch (action.type) {
    case 'CLOSE_ALL':
      return initialAiViewUiState
    case 'CLOSE':
      return { ...state, [action.drawer]: false }
    case 'OPEN_ONLY':
      return { ...initialAiViewUiState, [action.drawer]: true }
    case 'TOGGLE':
      return state[action.drawer]
        ? { ...state, [action.drawer]: false }
        : { ...initialAiViewUiState, [action.drawer]: true }
  }
}
