jest.mock('../../electron/main/repositories/aiAgentKnowledge', () => ({
  listAiAgentMemory: jest.fn(() => [
    { id: 1, scope: 'ORG', key: 'standard', value: 'Foerdermittel taggen', confidence: 1 }
  ]),
  listAiAgentAutoRules: jest.fn(() => [
    {
      id: 2,
      name: 'Tags vorselektieren',
      draftKind: 'tagChange',
      action: 'AUTO_PRESELECT',
      conditions: {}
    }
  ])
}))

jest.mock('../../electron/main/repositories/aiAgentSessions', () => ({
  listAiAgentEvents: jest.fn(() => [
    {
      id: 3,
      sessionId: 'session-1',
      role: 'user',
      kind: 'message',
      content: 'Hallo',
      createdAt: '2026-07-07'
    }
  ])
}))

jest.mock('../../electron/main/services/settings', () => ({
  getSetting: jest.fn(),
  setSetting: jest.fn()
}))

jest.mock('../../electron/main/services/aiContext', () => ({
  buildAiContext: jest.fn(() => ({
    organization: { name: 'Testverein' },
    generatedAt: '2026-07-07',
    paymentAccounts: [],
    budgets: [],
    earmarks: [],
    tags: [],
    members: { total: 0, rows: [] },
    reports: {},
    invoices: {}
  }))
}))

jest.mock('../../electron/main/services/aiAgentTools', () => ({
  createAiAgentTools: jest.fn(({ context }) => [
    {
      name: 'vereino_context_overview',
      description: 'Liefert eine kompakte Übersicht.',
      readOnly: true,
      parameters: {
        type: 'object',
        additionalProperties: false,
        properties: {},
        required: []
      },
      run: () => ({ ok: true, data: context })
    }
  ])
}))

import {
  jsonSchemaParametersToZodShape,
  jsonSchemaToZod,
  VereinoMcpHost
} from '../../electron/main/services/aiMcp'

const context = {
  organization: { name: 'Testverein' },
  generatedAt: '2026-07-07',
  paymentAccounts: [],
  budgets: [],
  earmarks: [],
  tags: [],
  members: { total: 0, rows: [] },
  reports: {},
  invoices: {}
}

describe('ai MCP schema adapter', () => {
  it('converts object parameters with nullable enum values into zod validators', () => {
    const shape = jsonSchemaParametersToZodShape({
      type: 'object',
      properties: {
        sphere: { type: ['string', 'null'], enum: ['IDEELL', 'ZWECK', null] },
        limit: { type: 'integer' },
        tags: { type: 'array', items: { type: 'string' } }
      },
      required: ['sphere']
    })

    expect(shape.sphere.safeParse('IDEELL').success).toBe(true)
    expect(shape.sphere.safeParse(null).success).toBe(true)
    expect(shape.limit.safeParse(undefined).success).toBe(true)
    expect(shape.tags.safeParse(['A', 'B']).success).toBe(true)
    expect(shape.tags.safeParse([1]).success).toBe(false)
  })

  it('keeps object additionalProperties=false strict', () => {
    const schema = jsonSchemaToZod({
      type: 'object',
      additionalProperties: false,
      properties: { name: { type: 'string' } },
      required: ['name']
    })

    expect(schema.safeParse({ name: 'A' }).success).toBe(true)
    expect(schema.safeParse({ name: 'A', extra: true }).success).toBe(false)
  })
})

describe('VereinoMcpHost', () => {
  it('lists VereinO agent tools and calls them through MCP', async () => {
    const host = await VereinoMcpHost.create({ context, sessionId: 'session-1' })
    try {
      const tools = await host.listTools()
      expect(tools.map((tool) => tool.name)).toContain('vereino_context_overview')

      const { agentResult } = await host.callTool('vereino_context_overview', {})
      expect(agentResult.ok).toBe(true)
      expect((agentResult.data as any).organization.name).toBe('Testverein')
    } finally {
      await host.close()
    }
  })

  it('reads MCP resources for context, memory, rules and session history', async () => {
    const host = await VereinoMcpHost.create({ context, sessionId: 'session-1' })
    try {
      const overview = await host.readResource('vereino://context/overview')
      const memory = await host.readResource('vereino://agent/memory')
      const rules = await host.readResource('vereino://agent/auto-rules')
      const history = await host.readResource('vereino://agent/session/session-1/history')
      const systemPrompt = await host.getAgentInstructions()

      expect(JSON.parse((overview.contents[0] as any).text).organization.name).toBe('Testverein')
      expect(JSON.parse((memory.contents[0] as any).text)[0].key).toBe('standard')
      expect(JSON.parse((rules.contents[0] as any).text)[0].draftKind).toBe('tagChange')
      expect(JSON.parse((history.contents[0] as any).text)[0].content).toBe('Hallo')
      expect(systemPrompt).toContain('Denke wie ein sorgfaeltiger Kassier')
      expect(systemPrompt).toContain('Waehle niemals ein riskanteres oder fachlich anderes Tool')
    } finally {
      await host.close()
    }
  })
})
