import { useCallback, useState } from 'react'
import type {
  TAiAgentAutoRulesListOutput,
  TAiAgentMemoryListOutput
} from '../../../../electron/main/ipc/schemas'

/** Loads the side-panel data which supplements an agent trace. */
export function useAiAgentKnowledge() {
  const [agentMemory, setAgentMemory] = useState<TAiAgentMemoryListOutput['rows']>([])
  const [agentAutoRules, setAgentAutoRules] = useState<TAiAgentAutoRulesListOutput['rows']>([])

  const loadAgentKnowledge = useCallback(async () => {
    try {
      const [memory, rules] = await Promise.all([
        window.api.ai.agent.memory.list({ activeOnly: true, limit: 80 }),
        window.api.ai.agent.autoRules.list({ enabledOnly: true, limit: 80 })
      ])
      setAgentMemory(memory.rows || [])
      setAgentAutoRules(rules.rows || [])
    } catch {
      setAgentMemory([])
      setAgentAutoRules([])
    }
  }, [])

  return { agentMemory, agentAutoRules, loadAgentKnowledge }
}
