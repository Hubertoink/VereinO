import { randomBytes, randomUUID } from 'node:crypto'
import http, {
  type IncomingMessage,
  type Server as HttpServer,
  type ServerResponse
} from 'node:http'
import type { AddressInfo } from 'node:net'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js'
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { listAiAgentAutoRules, listAiAgentMemory } from '../repositories/aiAgentKnowledge'
import { listAiAgentEvents } from '../repositories/aiAgentSessions'
import { compactContext, type AiContext } from './ai'
import { buildAgentInstructions } from './aiAgentInstructions'
import { buildAiContext } from './aiContext'
import { createAiAgentTools, type AiAgentTool, type AiAgentToolResult } from './aiAgentTools'
import { getSetting, setSetting } from './settings'

const MCP_ENABLED_SETTING = 'ai.mcp.localhost.enabled'
const MCP_PORT_SETTING = 'ai.mcp.localhost.port'
const MCP_TOKEN_SETTING = 'ai.mcp.localhost.token'
const DEFAULT_MCP_PORT = 39727
const MCP_PATH = '/mcp'

type McpConnectionConfig = {
  id: string
  name: string
  enabled: boolean
  transport: 'stdio' | 'streamable-http'
  toolNamePrefix?: string
  allowTools?: string[]
  command?: string
  args?: string[]
  url?: string
}

export type AiMcpStatus = {
  localhostEnabled: boolean
  running: boolean
  port: number | null
  url: string | null
  token: string | null
  externalConnections: number
}

const externalMcpConnections: McpConnectionConfig[] = []

type JsonSchemaObject = Record<string, any>
type McpToolDefinition = {
  name: string
  description?: string
  inputSchema: Record<string, unknown>
  annotations?: {
    readOnlyHint?: boolean
  }
  _meta?: Record<string, unknown>
}

function isRecord(value: unknown): value is JsonSchemaObject {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function withDescription(schema: z.ZodTypeAny, description: unknown) {
  return typeof description === 'string' && description.trim()
    ? schema.describe(description)
    : schema
}

function unionSchemas(schemas: z.ZodTypeAny[]) {
  if (!schemas.length) return z.unknown()
  if (schemas.length === 1) return schemas[0]
  return z.union(schemas as [z.ZodTypeAny, z.ZodTypeAny, ...z.ZodTypeAny[]])
}

function literalUnion(values: unknown[]) {
  const literalSchemas = values.map((value) => z.literal(value as never))
  return unionSchemas(literalSchemas)
}

function jsonSchemaTypeToZod(type: string, schema: JsonSchemaObject): z.ZodTypeAny {
  if (type === 'string') return z.string()
  if (type === 'number') return z.number()
  if (type === 'integer') return z.number().int()
  if (type === 'boolean') return z.boolean()
  if (type === 'null') return z.null()
  if (type === 'array') return z.array(jsonSchemaToZod(schema.items || {}))
  if (type === 'object') {
    const properties = isRecord(schema.properties) ? schema.properties : {}
    const required = new Set(Array.isArray(schema.required) ? schema.required.map(String) : [])
    const shape: Record<string, z.ZodTypeAny> = {}
    for (const [key, propertySchema] of Object.entries(properties)) {
      const parsed = jsonSchemaToZod(propertySchema)
      shape[key] = required.has(key) ? parsed : parsed.optional()
    }
    const objectSchema = z.object(shape)
    return schema.additionalProperties === false
      ? objectSchema.strict()
      : objectSchema.passthrough()
  }
  return z.unknown()
}

export function jsonSchemaToZod(schema: unknown): z.ZodTypeAny {
  if (!isRecord(schema)) return z.unknown()

  if (Array.isArray(schema.enum)) {
    const hasNull = schema.enum.some((value: unknown) => value === null)
    const values = schema.enum.filter((value: unknown) => value !== null)
    const enumSchema = values.length ? literalUnion(values) : z.never()
    return withDescription(
      hasNull ? unionSchemas([enumSchema, z.null()]) : enumSchema,
      schema.description
    )
  }

  if (Array.isArray(schema.anyOf)) {
    return withDescription(unionSchemas(schema.anyOf.map(jsonSchemaToZod)), schema.description)
  }
  if (Array.isArray(schema.oneOf)) {
    return withDescription(unionSchemas(schema.oneOf.map(jsonSchemaToZod)), schema.description)
  }

  const rawType = schema.type
  if (Array.isArray(rawType)) {
    return withDescription(
      unionSchemas(rawType.map((type) => jsonSchemaTypeToZod(String(type), schema))),
      schema.description
    )
  }
  if (typeof rawType === 'string') {
    return withDescription(jsonSchemaTypeToZod(rawType, schema), schema.description)
  }
  return withDescription(z.unknown(), schema.description)
}

export function jsonSchemaParametersToZodShape(parameters: Record<string, unknown>) {
  const properties = isRecord(parameters?.properties) ? parameters.properties : {}
  const required = new Set(
    Array.isArray(parameters?.required) ? parameters.required.map(String) : []
  )
  const shape: Record<string, z.ZodTypeAny> = {}
  for (const [key, schema] of Object.entries(properties)) {
    const parsed = jsonSchemaToZod(schema)
    shape[key] = required.has(key) ? parsed : parsed.optional()
  }
  return shape
}

function summarizeMcpToolResult(value: unknown) {
  const text = JSON.stringify(value)
  return text.length > 700 ? `${text.slice(0, 700)}...` : text
}

function jsonResource(uri: string, data: unknown) {
  return {
    contents: [
      {
        uri,
        mimeType: 'application/json',
        text: JSON.stringify(data)
      }
    ]
  }
}

function toolSafetyKind(tool: AiAgentTool) {
  if (tool.readOnly) return 'READ_ONLY'
  if (/(^memory_upsert$|^auto_rule_upsert$)/.test(tool.name)) return 'MEMORY'
  if (/(reports_export|content_pdf_export)/.test(tool.name)) return 'EXPORT'
  return 'DRAFT'
}

function mcpToolAnnotations(tool: AiAgentTool) {
  const safety = toolSafetyKind(tool)
  return {
    title: tool.name,
    readOnlyHint: safety === 'READ_ONLY',
    destructiveHint: false,
    idempotentHint: safety === 'READ_ONLY',
    openWorldHint: false
  }
}

function createToolsByName(context: AiContext) {
  return new Map(createAiAgentTools({ context }).map((tool) => [tool.name, tool]))
}

function registerVereinoTools(server: McpServer, contextProvider: () => AiContext) {
  const definitions = createAiAgentTools({ context: contextProvider() })
  for (const tool of definitions) {
    ;(server.registerTool as any)(
      tool.name,
      {
        title: tool.name,
        description: tool.description,
        inputSchema: jsonSchemaParametersToZodShape(tool.parameters),
        annotations: mcpToolAnnotations(tool),
        _meta: {
          vereino: {
            safety: toolSafetyKind(tool),
            readOnly: tool.readOnly,
            parameters: tool.parameters
          }
        }
      },
      async (args: unknown) => {
        const liveTool = createToolsByName(contextProvider()).get(tool.name)
        if (!liveTool) {
          const missing = { ok: false, warning: `Unbekanntes Tool: ${tool.name}` }
          return {
            content: [{ type: 'text', text: missing.warning }],
            structuredContent: missing,
            isError: true
          }
        }
        try {
          const result = await liveTool.run(args)
          return {
            content: [{ type: 'text', text: summarizeMcpToolResult(result) }],
            structuredContent: result as Record<string, unknown>,
            isError: !result.ok
          }
        } catch (error: any) {
          const result = { ok: false, warning: error?.message || String(error) }
          return {
            content: [{ type: 'text', text: result.warning }],
            structuredContent: result,
            isError: true
          }
        }
      }
    )
  }
}

function createVereinoMcpServer(input: {
  contextProvider: () => AiContext
  defaultSessionId?: string | null
}) {
  const server = new McpServer(
    { name: 'vereino-agent-mcp', version: '1.0.0' },
    {
      instructions: buildAgentInstructions(),
      capabilities: { logging: {} }
    }
  )

  registerVereinoTools(server, input.contextProvider)

  server.registerResource(
    'vereino_context_overview',
    'vereino://context/overview',
    {
      title: 'VereinO Kontext',
      description: 'Kompakter VereinO-Datenkontext fuer den Agenten.',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, compactContext(input.contextProvider()))
  )

  server.registerResource(
    'vereino_agent_memory',
    'vereino://agent/memory',
    {
      title: 'VereinO Agent Memory',
      description: 'Aktive persistente Memory-Eintraege des VereinO Agenten.',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, listAiAgentMemory({ activeOnly: true, limit: 80 }))
  )

  server.registerResource(
    'vereino_agent_auto_rules',
    'vereino://agent/auto-rules',
    {
      title: 'VereinO Auto-Regeln',
      description: 'Aktive Auto-Approve-Regeln fuer Agent-Drafts.',
      mimeType: 'application/json'
    },
    async (uri) => jsonResource(uri.href, listAiAgentAutoRules({ enabledOnly: true, limit: 80 }))
  )

  server.registerResource(
    'vereino_agent_session_history',
    new ResourceTemplate('vereino://agent/session/{sessionId}/history', { list: undefined }),
    {
      title: 'VereinO Agent Session History',
      description: 'Persistenter Verlauf einer Agent-Sitzung.',
      mimeType: 'application/json'
    },
    async (uri, variables) => {
      const sessionId = String(variables.sessionId || input.defaultSessionId || '')
      const events = sessionId ? listAiAgentEvents(sessionId, 60) : []
      return jsonResource(uri.href, events)
    }
  )

  server.registerPrompt(
    'vereino_agent_system',
    {
      title: 'VereinO Agent System Prompt',
      description: 'Systeminstruktionen fuer den autonomen VereinO Agenten.'
    },
    () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: buildAgentInstructions()
          }
        }
      ]
    })
  )

  return server
}

function mcpResultToAiAgentToolResult(result: any): AiAgentToolResult {
  const structured = (result as any).structuredContent
  if (structured && typeof structured === 'object') return structured as AiAgentToolResult
  const text = Array.isArray((result as any).content)
    ? (result as any).content
        .filter((item: any) => item?.type === 'text')
        .map((item: any) => item.text)
        .join('\n')
    : ''
  return (result as any).isError
    ? { ok: false, warning: text || 'MCP-Toolaufruf fehlgeschlagen.' }
    : { ok: true, data: text }
}

function providerToolSchema(tool: McpToolDefinition) {
  const original = (tool._meta as any)?.vereino?.parameters
  return isRecord(original) ? original : tool.inputSchema
}

export class VereinoMcpHost {
  private toolsCache: McpToolDefinition[] | null = null

  private constructor(
    private readonly server: { close: () => Promise<void> },
    private readonly client: any
  ) {}

  static async create(input: { context: AiContext; sessionId?: string | null }) {
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
    const server = createVereinoMcpServer({
      contextProvider: () => input.context,
      defaultSessionId: input.sessionId || null
    })
    const client = new Client({ name: 'vereino-agent-host', version: '1.0.0' })
    await server.connect(serverTransport)
    await client.connect(clientTransport)
    return new VereinoMcpHost(server, client)
  }

  async listTools() {
    if (!this.toolsCache) {
      const result = await this.client.listTools()
      this.toolsCache = result.tools as McpToolDefinition[]
    }
    return this.toolsCache
  }

  // fallow-ignore-next-line unused-class-member -- public MCP host API used by aiAgent.ts and MCP tests
  async providerToolDefinitions() {
    const tools = await this.listTools()
    return tools.map((tool) => ({
      type: 'function',
      name: tool.name,
      description: tool.description,
      parameters: providerToolSchema(tool),
      strict: false
    }))
  }

  // fallow-ignore-next-line unused-class-member -- public MCP host API used by aiAgent.ts and MCP tests
  async readResource(uri: string) {
    return this.client.readResource({ uri })
  }

  // fallow-ignore-next-line unused-class-member -- public MCP host API used by aiAgent.ts
  async getAgentInstructions() {
    const prompt = await this.client.getPrompt({ name: 'vereino_agent_system' })
    const text = prompt.messages
      .map((message: any) => (message.content.type === 'text' ? message.content.text : ''))
      .filter(Boolean)
      .join('\n')
      .trim()
    return text || buildAgentInstructions()
  }

  // fallow-ignore-next-line unused-class-member -- public MCP host API used by aiAgent.ts and MCP tests
  async callTool(name: string, args: unknown) {
    const result = await this.client.callTool({ name, arguments: isRecord(args) ? args : {} })
    return {
      mcpResult: result,
      agentResult: mcpResultToAiAgentToolResult(result as any)
    }
  }

  // fallow-ignore-next-line unused-class-member -- public MCP host API used by aiAgent.ts and MCP tests
  async close() {
    await this.client.close()
    await this.server.close()
  }
}

function getStoredToken() {
  const existing = getSetting<string>(MCP_TOKEN_SETTING)
  if (existing) return existing
  const token = randomBytes(24).toString('base64url')
  setSetting(MCP_TOKEN_SETTING, token)
  return token
}

function endpointStatus(): AiMcpStatus {
  const localhostEnabled = !!getSetting<boolean>(MCP_ENABLED_SETTING)
  const port = endpointState?.port ?? getSetting<number>(MCP_PORT_SETTING) ?? DEFAULT_MCP_PORT
  return {
    localhostEnabled,
    running: !!endpointState,
    port: endpointState ? port : localhostEnabled ? port : null,
    url: endpointState ? `http://127.0.0.1:${endpointState.port}${MCP_PATH}` : null,
    token: endpointState ? endpointState.token : localhostEnabled ? getStoredToken() : null,
    externalConnections: externalMcpConnections.length
  }
}

let endpointState: {
  server: HttpServer
  transports: Record<string, StreamableHTTPServerTransport>
  port: number
  token: string
} | null = null

function headerValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value
}

function allowedHost(host: string | undefined, port: number) {
  if (!host) return false
  const lower = host.toLowerCase()
  return lower === `127.0.0.1:${port}` || lower === `localhost:${port}`
}

function allowedOrigin(origin: string | undefined, port: number) {
  if (!origin) return true
  try {
    const parsed = new URL(origin)
    return (
      (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.port === String(port)
    )
  } catch {
    return false
  }
}

function hasBearerToken(req: IncomingMessage, token: string) {
  const authorization = headerValue(req.headers.authorization)
  return authorization === `Bearer ${token}`
}

async function readJsonBody(req: IncomingMessage) {
  const chunks: Buffer[] = []
  for await (const chunk of req) chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk))
  const body = Buffer.concat(chunks).toString('utf8').trim()
  return body ? JSON.parse(body) : undefined
}

function sendJsonRpcError(res: ServerResponse, status: number, message: string) {
  if (res.headersSent) return
  res.writeHead(status, { 'content-type': 'application/json' })
  res.end(
    JSON.stringify({
      jsonrpc: '2.0',
      error: {
        code: -32000,
        message
      },
      id: null
    })
  )
}

async function closeEndpointState() {
  if (!endpointState) return
  const current = endpointState
  endpointState = null
  for (const transport of Object.values(current.transports)) {
    try {
      await transport.close()
    } catch {}
  }
  await new Promise<void>((resolve) => current.server.close(() => resolve()))
}

async function startEndpoint(port: number, token: string) {
  if (endpointState) {
    if (endpointState.port === port && endpointState.token === token) return
    await closeEndpointState()
  }

  const transports: Record<string, StreamableHTTPServerTransport> = {}
  let actualPort = port
  const server = http.createServer(async (req, res) => {
    try {
      if (!req.url) {
        sendJsonRpcError(res, 400, 'Bad Request')
        return
      }
      const url = new URL(req.url, `http://127.0.0.1:${actualPort}`)
      if (url.pathname !== MCP_PATH) {
        res.writeHead(404)
        res.end('Not Found')
        return
      }
      if (
        !allowedHost(headerValue(req.headers.host), actualPort) ||
        !allowedOrigin(headerValue(req.headers.origin), actualPort)
      ) {
        sendJsonRpcError(res, 403, 'Forbidden')
        return
      }
      if (!hasBearerToken(req, token)) {
        sendJsonRpcError(res, 401, 'Unauthorized')
        return
      }

      const method = String(req.method || '').toUpperCase()
      if (method === 'GET') {
        res.writeHead(405, { allow: 'POST, DELETE' })
        res.end('Method Not Allowed')
        return
      }
      if (method === 'DELETE') {
        const sessionId = headerValue(req.headers['mcp-session-id'])
        const transport = sessionId ? transports[sessionId] : null
        if (!transport) {
          sendJsonRpcError(res, 400, 'Invalid or missing MCP session.')
          return
        }
        await transport.handleRequest(req, res)
        return
      }
      if (method !== 'POST') {
        res.writeHead(405, { allow: 'POST, DELETE' })
        res.end('Method Not Allowed')
        return
      }

      const body = await readJsonBody(req)
      const sessionId = headerValue(req.headers['mcp-session-id'])
      if (sessionId && transports[sessionId]) {
        await transports[sessionId].handleRequest(req, res, body)
        return
      }
      if (!sessionId && isInitializeRequest(body)) {
        const transport = new StreamableHTTPServerTransport({
          sessionIdGenerator: () => randomUUID(),
          enableJsonResponse: true,
          onsessioninitialized: (initializedSessionId) => {
            transports[initializedSessionId] = transport
          }
        })
        transport.onclose = () => {
          const closedSessionId = transport.sessionId
          if (closedSessionId) delete transports[closedSessionId]
        }
        const mcpServer = createVereinoMcpServer({ contextProvider: buildAiContext })
        await mcpServer.connect(transport)
        await transport.handleRequest(req, res, body)
        return
      }
      sendJsonRpcError(res, 400, 'Bad Request: No valid MCP session.')
    } catch (error: any) {
      sendJsonRpcError(res, 500, error?.message || 'Internal MCP server error')
    }
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', () => {
      server.off('error', reject)
      const address = server.address() as AddressInfo
      actualPort = address.port
      resolve()
    })
  })

  endpointState = { server, transports, port: actualPort, token }
}

export async function getAiMcpStatus(): Promise<AiMcpStatus> {
  const enabled = !!getSetting<boolean>(MCP_ENABLED_SETTING)
  if (enabled && !endpointState) {
    await startEndpoint(getSetting<number>(MCP_PORT_SETTING) ?? DEFAULT_MCP_PORT, getStoredToken())
  }
  if (!enabled && endpointState) await closeEndpointState()
  return endpointStatus()
}

export async function configureAiMcpEndpoint(input: {
  localhostEnabled: boolean
  port?: number | null
}) {
  const port = Math.max(
    1,
    Math.min(
      65535,
      Math.floor(Number(input.port || getSetting<number>(MCP_PORT_SETTING) || DEFAULT_MCP_PORT))
    )
  )
  setSetting(MCP_ENABLED_SETTING, !!input.localhostEnabled)
  setSetting(MCP_PORT_SETTING, port)
  const token = getStoredToken()
  if (!input.localhostEnabled) {
    await closeEndpointState()
    return endpointStatus()
  }
  await startEndpoint(port, token)
  return endpointStatus()
}
