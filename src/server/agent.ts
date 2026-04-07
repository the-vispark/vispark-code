import type {
  AgentProvider,
  ChatAttachment,
  ContextWindowUsageSnapshot,
  NormalizedToolCall,
  PendingToolSnapshot,
  TranscriptEntry,
  VisparkCodeStatus,
} from "../shared/types"
import type { ClientCommand } from "../shared/protocol"
import { normalizeToolCall } from "../shared/tools"
import { query, type CanUseTool, type PermissionResult, type Query } from "./harness-sdk"
import { EventStore } from "./event-store"
import { fallbackTitleFromMessage, type GenerateChatTitleResult, generateTitleForChatDetailed } from "./generate-title"
import type { HarnessEvent, HarnessToolRequest, HarnessTurn } from "./harness-types"
import {
  getServerProviderCatalog,
  normalizeServerModel,
  normalizeVisionModelOptions,
} from "./provider-catalog"

const VISION_TOOLSET = [
  "Skill",
  "WebFetch",
  "WebSearch",
  "Task",
  "TaskOutput",
  "Bash",
  "Glob",
  "Grep",
  "Read",
  "Edit",
  "Write",
  "TodoWrite",
  "KillShell",
  "AskUserQuestion",
  "EnterPlanMode",
  "ExitPlanMode",
] as const

const CONTINUAL_LEARNING_MARKER = "<vispark-code-continual-learning enabled=\"true\" />"

interface PendingToolRequest {
  toolUseId: string
  tool: NormalizedToolCall & { toolKind: "ask_user_question" | "exit_plan_mode" }
  resolve: (result: unknown) => void
}

interface ActiveTurn {
  chatId: string
  provider: AgentProvider
  turn: HarnessTurn
  model: string
  planMode: boolean
  status: VisparkCodeStatus
  pendingTool: PendingToolRequest | null
  hasFinalResult: boolean
  cancelRequested: boolean
  cancelRecorded: boolean
}

interface AgentCoordinatorArgs {
  store: EventStore
  onStateChange: () => void
  generateTitle?: (messageContent: string, cwd: string) => Promise<GenerateChatTitleResult>
}

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(
  entry: T,
  createdAt = Date.now()
): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt,
    ...entry,
  } as TranscriptEntry
}

function stringFromUnknown(value: unknown) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null
}

function asNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined
}

function escapeXmlAttribute(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("\"", "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
}

export function buildAttachmentHintText(attachments: ChatAttachment[]) {
  if (attachments.length === 0) return ""

  const lines = attachments.map((attachment) => (
    `<attachment kind="${escapeXmlAttribute(attachment.kind)}" mime_type="${escapeXmlAttribute(attachment.mimeType)}" path="${escapeXmlAttribute(attachment.absolutePath)}" project_path="${escapeXmlAttribute(attachment.relativePath)}" content_url="${escapeXmlAttribute(attachment.contentUrl)}" size_bytes="${attachment.size}" display_name="${escapeXmlAttribute(attachment.displayName)}" />`
  ))

  return [
    "<vispark-code-attachments>",
    ...lines,
    "</vispark-code-attachments>",
  ].join("\n")
}

export function buildPromptText(content: string, attachments: ChatAttachment[]) {
  const attachmentHint = buildAttachmentHintText(attachments)
  if (!attachmentHint) {
    return content.trim()
  }

  const trimmed = content.trim()
  return [
    trimmed || "Please inspect the attached files.",
    attachmentHint,
  ].join("\n\n").trim()
}

function discardedToolResult(
  tool: NormalizedToolCall & { toolKind: "ask_user_question" | "exit_plan_mode" }
) {
  if (tool.toolKind === "ask_user_question") {
    return {
      discarded: true,
      answers: {},
    }
  }

  return {
    discarded: true,
  }
}

export function normalizeHarnessUsageSnapshot(
  value: unknown,
  maxTokens?: number,
): ContextWindowUsageSnapshot | null {
  const usage = asRecord(value)
  if (!usage) return null

  const directInputTokens = asNumber(usage.input_tokens) ?? asNumber(usage.inputTokens) ?? 0
  const cacheCreationInputTokens =
    asNumber(usage.cache_creation_input_tokens) ?? asNumber(usage.cacheCreationInputTokens) ?? 0
  const cacheReadInputTokens =
    asNumber(usage.cache_read_input_tokens) ?? asNumber(usage.cacheReadInputTokens) ?? 0
  const outputTokens = asNumber(usage.output_tokens) ?? asNumber(usage.outputTokens) ?? 0
  const reasoningOutputTokens =
    asNumber(usage.reasoning_output_tokens) ?? asNumber(usage.reasoningOutputTokens)
  const toolUses = asNumber(usage.tool_uses) ?? asNumber(usage.toolUses)
  const durationMs = asNumber(usage.duration_ms) ?? asNumber(usage.durationMs)

  const inputTokens = directInputTokens + cacheCreationInputTokens + cacheReadInputTokens
  const usedTokens = inputTokens + outputTokens
  if (usedTokens <= 0) {
    return null
  }

  return {
    usedTokens,
    inputTokens,
    ...(cacheReadInputTokens > 0 ? { cachedInputTokens: cacheReadInputTokens } : {}),
    ...(outputTokens > 0 ? { outputTokens } : {}),
    ...(reasoningOutputTokens !== undefined ? { reasoningOutputTokens } : {}),
    lastUsedTokens: usedTokens,
    lastInputTokens: inputTokens,
    ...(cacheReadInputTokens > 0 ? { lastCachedInputTokens: cacheReadInputTokens } : {}),
    ...(outputTokens > 0 ? { lastOutputTokens: outputTokens } : {}),
    ...(reasoningOutputTokens !== undefined ? { lastReasoningOutputTokens: reasoningOutputTokens } : {}),
    ...(toolUses !== undefined ? { toolUses } : {}),
    ...(durationMs !== undefined ? { durationMs } : {}),
    ...(typeof maxTokens === "number" && maxTokens > 0 ? { maxTokens } : {}),
    compactsAutomatically: false,
  }
}

export function maxContextWindowFromModelUsage(modelUsage: unknown): number | undefined {
  const record = asRecord(modelUsage)
  if (!record) return undefined

  let maxContextWindow: number | undefined
  for (const value of Object.values(record)) {
    const usage = asRecord(value)
    const contextWindow = asNumber(usage?.contextWindow) ?? asNumber(usage?.context_window)
    if (contextWindow === undefined) continue
    maxContextWindow = Math.max(maxContextWindow ?? 0, contextWindow)
  }
  return maxContextWindow
}

function getAssistantMessageUsageId(message: any): string | null {
  if (typeof message?.message?.id === "string" && message.message.id) {
    return message.message.id
  }
  if (typeof message?.uuid === "string" && message.uuid) {
    return message.uuid
  }
  return null
}

export function normalizeHarnessStreamMessage(message: any): TranscriptEntry[] {
  const debugRaw = JSON.stringify(message)
  const messageId = typeof message.uuid === "string" ? message.uuid : undefined

  if (message.type === "system" && message.subtype === "init") {
    return [
      timestamped({
        kind: "system_init",
        messageId,
        provider: "vision",
        model: typeof message.model === "string" ? message.model : "unknown",
        tools: Array.isArray(message.tools) ? message.tools : [],
        agents: Array.isArray(message.agents) ? message.agents : [],
        slashCommands: Array.isArray(message.slash_commands)
          ? message.slash_commands.filter((entry: string) => !entry.startsWith("._"))
          : [],
        mcpServers: Array.isArray(message.mcp_servers) ? message.mcp_servers : [],
        debugRaw,
      }),
    ]
  }

  if (message.type === "assistant" && Array.isArray(message.message?.content)) {
    const entries: TranscriptEntry[] = []
    for (const content of message.message.content) {
      if (content.type === "text" && typeof content.text === "string") {
        entries.push(timestamped({
          kind: "assistant_text",
          messageId,
          text: content.text,
          debugRaw,
        }))
      }
      if (content.type === "tool_use" && typeof content.name === "string" && typeof content.id === "string") {
        entries.push(timestamped({
          kind: "tool_call",
          messageId,
          tool: normalizeToolCall({
            toolName: content.name,
            toolId: content.id,
            input: (content.input ?? {}) as Record<string, unknown>,
          }),
          debugRaw,
        }))
      }
    }
    return entries
  }

  if (message.type === "user" && Array.isArray(message.message?.content)) {
    const entries: TranscriptEntry[] = []
    for (const content of message.message.content) {
      if (content.type === "tool_result" && typeof content.tool_use_id === "string") {
        entries.push(timestamped({
          kind: "tool_result",
          messageId,
          toolId: content.tool_use_id,
          content: content.content,
          isError: Boolean(content.is_error),
          debugRaw,
        }))
      }
      if (message.message.role === "user" && typeof message.message.content === "string") {
        entries.push(timestamped({
          kind: "compact_summary",
          messageId,
          summary: message.message.content,
          debugRaw,
        }))
      }
    }
    return entries
  }

  if (message.type === "result") {
    if (message.subtype === "cancelled") {
      return [timestamped({ kind: "interrupted", messageId, debugRaw })]
    }
    return [
      timestamped({
        kind: "result",
        messageId,
        subtype: message.is_error ? "error" : "success",
        isError: Boolean(message.is_error),
        durationMs: typeof message.duration_ms === "number" ? message.duration_ms : 0,
        result: typeof message.result === "string" ? message.result : stringFromUnknown(message.result),
        costUsd: typeof message.total_cost_usd === "number" ? message.total_cost_usd : undefined,
        debugRaw,
      }),
    ]
  }

  if (message.type === "system" && message.subtype === "status" && typeof message.status === "string") {
    return [timestamped({ kind: "status", messageId, status: message.status, debugRaw })]
  }

  if (message.type === "system" && message.subtype === "compact_boundary") {
    return [timestamped({ kind: "compact_boundary", messageId, debugRaw })]
  }

  if (message.type === "system" && message.subtype === "context_cleared") {
    return [timestamped({ kind: "context_cleared", messageId, debugRaw })]
  }

  if (
    message.type === "user" &&
    message.message?.role === "user" &&
    typeof message.message.content === "string" &&
    message.message.content.startsWith("This session is being continued")
  ) {
    return [timestamped({ kind: "compact_summary", messageId, summary: message.message.content, debugRaw })]
  }

  return []
}

async function* createVisionHarnessStream(q: Query): AsyncGenerator<HarnessEvent> {
  let seenAssistantUsageIds = new Set<string>()
  let latestUsageSnapshot: ContextWindowUsageSnapshot | null = null
  let lastKnownContextWindow: number | undefined
  for await (const sdkMessage of q as AsyncIterable<any>) {
    const sessionToken = typeof sdkMessage.session_id === "string" ? sdkMessage.session_id : null
    if (sessionToken) {
      yield { type: "session_token", sessionToken }
    }

    if (sdkMessage?.type === "assistant") {
      const usageId = getAssistantMessageUsageId(sdkMessage)
      const usageSnapshot = normalizeHarnessUsageSnapshot(sdkMessage.usage, lastKnownContextWindow)
      if (usageId && usageSnapshot && !seenAssistantUsageIds.has(usageId)) {
        seenAssistantUsageIds.add(usageId)
        latestUsageSnapshot = usageSnapshot
        yield {
          type: "transcript",
          entry: timestamped({
            kind: "context_window_updated",
            usage: usageSnapshot,
          }),
        }
      }
    }

    if (sdkMessage?.type === "result") {
      const resultContextWindow = maxContextWindowFromModelUsage(sdkMessage.modelUsage)
      if (resultContextWindow !== undefined) {
        lastKnownContextWindow = resultContextWindow
      }

      const accumulatedUsage = normalizeHarnessUsageSnapshot(
        sdkMessage.usage,
        resultContextWindow ?? lastKnownContextWindow,
      )
      const finalUsage = latestUsageSnapshot
        ? {
            ...latestUsageSnapshot,
            ...(typeof (resultContextWindow ?? lastKnownContextWindow) === "number"
              ? { maxTokens: resultContextWindow ?? lastKnownContextWindow }
              : {}),
            ...(accumulatedUsage && accumulatedUsage.usedTokens > latestUsageSnapshot.usedTokens
              ? { totalProcessedTokens: accumulatedUsage.usedTokens }
              : {}),
          }
        : accumulatedUsage

      if (finalUsage) {
        yield {
          type: "transcript",
          entry: timestamped({
            kind: "context_window_updated",
            usage: finalUsage,
          }),
        }
      }

      seenAssistantUsageIds = new Set<string>()
      latestUsageSnapshot = null
    }

    for (const entry of normalizeHarnessStreamMessage(sdkMessage)) {
      yield { type: "transcript", entry }
    }
  }
}

async function startVisionTurn(args: {
  content: string
  localPath: string
  model: string
  planMode: boolean
  continualLearning: boolean
  sessionToken: string | null
  onToolRequest: (request: HarnessToolRequest) => Promise<unknown>
}): Promise<HarnessTurn> {
  const canUseTool: CanUseTool = async (toolName, input, options) => {
    if (toolName !== "AskUserQuestion" && toolName !== "ExitPlanMode") {
      return {
        behavior: "allow",
        updatedInput: input,
      }
    }

    const tool = normalizeToolCall({
      toolName,
      toolId: options.toolUseID,
      input: (input ?? {}) as Record<string, unknown>,
    })

    if (tool.toolKind !== "ask_user_question" && tool.toolKind !== "exit_plan_mode") {
      return {
        behavior: "deny",
        message: "Unsupported tool request",
      }
    }

    const result = await args.onToolRequest({ tool })

    if (tool.toolKind === "ask_user_question") {
      const record = result && typeof result === "object" ? result as Record<string, unknown> : {}
      return {
        behavior: "allow",
        updatedInput: {
          ...(tool.rawInput ?? {}),
          questions: record.questions ?? tool.input.questions,
          answers: record.answers ?? result,
        },
      } satisfies PermissionResult
    }

    const record = result && typeof result === "object" ? result as Record<string, unknown> : {}
    const confirmed = Boolean(record.confirmed)
    if (confirmed) {
      return {
        behavior: "allow",
        updatedInput: {
          ...(tool.rawInput ?? {}),
          ...record,
        },
      } satisfies PermissionResult
    }

    return {
      behavior: "deny",
      message: typeof record.message === "string"
        ? `User wants to suggest edits to the plan: ${record.message}`
        : "User wants to suggest edits to the plan before approving.",
    } satisfies PermissionResult
  }

  const q = query({
    prompt: args.content,
    options: {
      cwd: args.localPath,
      model: args.model,
      resume: args.sessionToken ?? undefined,
      permissionMode: args.planMode ? "plan" : "acceptEdits",
      systemPrompt: args.continualLearning
        ? {
            type: "preset",
            preset: "Vision_code",
            append: CONTINUAL_LEARNING_MARKER,
          }
        : undefined,
      canUseTool,
      tools: [...VISION_TOOLSET],
      settingSources: ["project", "local"],
      env: { ...process.env },
      stderr: (data: string) => {
        console.error(`[Harness Stderr] ${data}`)
      },
    },
  })

  return {
    provider: "vision",
    stream: createVisionHarnessStream(q),
    getAccountInfo: async () => {
      try {
        return await q.accountInfo()
      } catch {
        return null
      }
    },
    interrupt: async () => {
      await q.interrupt()
    },
    close: () => {
      q.close()
    },
  }
}

function formatErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error)
  const jsonMatch = message.match(/API Error: \d+ (\{.*\})/i)
  if (jsonMatch?.[1]) {
    try {
      const parsed = JSON.parse(jsonMatch[1])
      if (parsed.error?.message) {
        return parsed.error.message
      }
    } catch {
      // Ignore parsing errors.
    }
  }

  return message.replace(/^Vision API Error: /i, "").replace(/^Vision API \d+: /i, "")
}

export class AgentCoordinator {
  private readonly store: EventStore
  private readonly onStateChange: () => void
  private readonly generateTitle: (messageContent: string, cwd: string) => Promise<GenerateChatTitleResult>
  private reportBackgroundError: ((message: string) => void) | null = null
  readonly activeTurns = new Map<string, ActiveTurn>()
  readonly drainingStreams = new Map<string, { turn: HarnessTurn }>()

  constructor(args: AgentCoordinatorArgs) {
    this.store = args.store
    this.onStateChange = args.onStateChange
    this.generateTitle = args.generateTitle ?? generateTitleForChatDetailed
  }

  setBackgroundErrorReporter(report: ((message: string) => void) | null) {
    this.reportBackgroundError = report
  }

  getActiveStatuses() {
    const statuses = new Map<string, VisparkCodeStatus>()
    for (const [chatId, turn] of this.activeTurns.entries()) {
      statuses.set(chatId, turn.status)
    }
    return statuses
  }

  getPendingTool(chatId: string): PendingToolSnapshot | null {
    const pending = this.activeTurns.get(chatId)?.pendingTool
    if (!pending) return null
    return { toolUseId: pending.toolUseId, toolKind: pending.tool.toolKind }
  }

  getDrainingChatIds(): Set<string> {
    return new Set(this.drainingStreams.keys())
  }

  async stopDraining(chatId: string) {
    const draining = this.drainingStreams.get(chatId)
    if (!draining) return
    draining.turn.close()
    this.drainingStreams.delete(chatId)
    this.onStateChange()
  }

  async closeChat(chatId: string) {
    await this.stopDraining(chatId)
    this.onStateChange()
  }

  private resolveProvider() {
    return "vision" as const
  }

  private getProviderSettings(command: Extract<ClientCommand, { type: "chat.send" }>) {
    const provider = this.resolveProvider()
    const catalog = getServerProviderCatalog(provider)
    const visionModelOptions = normalizeVisionModelOptions(command.modelOptions)
    return {
      provider,
      model: normalizeServerModel(provider, command.model),
      planMode: catalog.supportsPlanMode ? Boolean(command.planMode) : false,
      continualLearning: visionModelOptions.continualLearning,
    }
  }

  private async startTurnForChat(args: {
    chatId: string
    provider: AgentProvider
    content: string
    attachments: ChatAttachment[]
    model: string
    planMode: boolean
    continualLearning: boolean
    appendUserPrompt: boolean
  }) {
    const draining = this.drainingStreams.get(args.chatId)
    if (draining) {
      draining.turn.close()
      this.drainingStreams.delete(args.chatId)
    }

    const chat = this.store.requireChat(args.chatId)
    if (this.activeTurns.has(args.chatId)) {
      throw new Error("Chat is already running")
    }

    if (!chat.provider) {
      await this.store.setChatProvider(args.chatId, args.provider)
    }
    await this.store.setPlanMode(args.chatId, args.planMode)

    const existingMessages = this.store.getMessages(args.chatId)
    const shouldGenerateTitle = args.appendUserPrompt && chat.title === "New Chat" && existingMessages.length === 0
    const optimisticTitle = shouldGenerateTitle ? fallbackTitleFromMessage(args.content) : null

    if (optimisticTitle) {
      await this.store.renameChat(args.chatId, optimisticTitle)
    }

    const project = this.store.getProject(chat.projectId)
    if (!project) {
      throw new Error("Project not found")
    }

    if (args.appendUserPrompt) {
      const userPromptEntry = timestamped(
        { kind: "user_prompt", content: args.content, attachments: args.attachments },
        Date.now()
      )
      await this.store.appendMessage(args.chatId, userPromptEntry)
    }
    await this.store.recordTurnStarted(args.chatId)

    if (shouldGenerateTitle) {
      void this.generateTitleInBackground(args.chatId, args.content, project.localPath, optimisticTitle ?? "New Chat")
    }

    const onToolRequest = async (request: HarnessToolRequest): Promise<unknown> => {
      const active = this.activeTurns.get(args.chatId)
      if (!active) {
        throw new Error("Chat turn ended unexpectedly")
      }

      active.status = "waiting_for_user"
      this.onStateChange()

      return await new Promise<unknown>((resolve) => {
        active.pendingTool = {
          toolUseId: request.tool.toolId,
          tool: request.tool,
          resolve,
        }
      })
    }

    const turn = await startVisionTurn({
      content: buildPromptText(args.content, args.attachments),
      localPath: project.localPath,
      model: args.model,
      planMode: args.planMode,
      continualLearning: args.continualLearning,
      sessionToken: chat.sessionToken,
      onToolRequest,
    })

    const active: ActiveTurn = {
      chatId: args.chatId,
      provider: args.provider,
      turn,
      model: args.model,
      planMode: args.planMode,
      status: "starting",
      pendingTool: null,
      hasFinalResult: false,
      cancelRequested: false,
      cancelRecorded: false,
    }
    this.activeTurns.set(args.chatId, active)
    this.onStateChange()

    if (turn.getAccountInfo) {
      void turn.getAccountInfo()
        .then(async (accountInfo) => {
          if (!accountInfo) return
          if (!this.store.getChat(args.chatId)) return
          await this.store.appendMessage(args.chatId, timestamped({ kind: "account_info", accountInfo }))
          this.onStateChange()
        })
        .catch(() => undefined)
    }

    void this.runTurn(active)
  }

  async send(command: Extract<ClientCommand, { type: "chat.send" }>) {
    let chatId = command.chatId

    if (!chatId) {
      if (!command.projectId) {
        throw new Error("Missing projectId for new chat")
      }
      const created = await this.store.createChat(command.projectId)
      chatId = created.id
    }

    const settings = this.getProviderSettings(command)
    await this.startTurnForChat({
      chatId,
      provider: settings.provider,
      content: command.content,
      attachments: command.attachments ?? [],
      model: settings.model,
      planMode: settings.planMode,
      continualLearning: settings.continualLearning,
      appendUserPrompt: true,
    })

    return { chatId }
  }

  private async generateTitleInBackground(chatId: string, messageContent: string, cwd: string, expectedCurrentTitle: string) {
    try {
      const result = await this.generateTitle(messageContent, cwd)
      if (result.failureMessage) {
        this.reportBackgroundError?.(`[title-generation] chat ${chatId} failed: ${result.failureMessage}`)
      }
      if (!result.title || result.usedFallback) return

      const chat = this.store.requireChat(chatId)
      if (chat.title !== expectedCurrentTitle) return

      await this.store.renameChat(chatId, result.title)
      this.onStateChange()
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      this.reportBackgroundError?.(`[title-generation] chat ${chatId} failed: ${message}`)
    }
  }

  private async runTurn(active: ActiveTurn) {
    try {
      for await (const event of active.turn.stream) {
        if (active.cancelRequested || !this.store.getChat(active.chatId)) {
          break
        }

        if (event.type === "session_token" && event.sessionToken) {
          await this.store.setSessionToken(active.chatId, event.sessionToken)
          this.onStateChange()
          continue
        }

        if (!event.entry) continue
        await this.store.appendMessage(active.chatId, event.entry)

        if (event.entry.kind === "system_init") {
          active.status = "running"
        }

        if (event.entry.kind === "result") {
          active.hasFinalResult = true
          if (event.entry.isError) {
            await this.store.recordTurnFailed(active.chatId, event.entry.result || "Turn failed")
          } else if (!active.cancelRequested) {
            await this.store.recordTurnFinished(active.chatId)
          }
          this.activeTurns.delete(active.chatId)
          this.drainingStreams.set(active.chatId, { turn: active.turn })
        }

        this.onStateChange()
      }
    } catch (error) {
      if (!active.cancelRequested && this.store.getChat(active.chatId)) {
        const message = formatErrorMessage(error)
        try {
          await this.store.appendMessage(
            active.chatId,
            timestamped({
              kind: "result",
              subtype: "error",
              isError: true,
              durationMs: 0,
              result: message,
            })
          )
          await this.store.recordTurnFailed(active.chatId, message)
        } catch {
          // Ignore failures while saving the error.
        }
      }
    } finally {
      if (active.cancelRequested && !active.cancelRecorded && this.store.getChat(active.chatId)) {
        try {
          await this.store.recordTurnCancelled(active.chatId)
        } catch {
          // Ignore if chat is concurrently deleted.
        }
      }
      active.turn.close()
      if (this.activeTurns.get(active.chatId) === active) {
        this.activeTurns.delete(active.chatId)
      }
      this.drainingStreams.delete(active.chatId)
      this.onStateChange()
    }
  }

  async cancel(chatId: string) {
    const draining = this.drainingStreams.get(chatId)
    if (draining) {
      draining.turn.close()
      this.drainingStreams.delete(chatId)
    }

    const active = this.activeTurns.get(chatId)
    if (!active) return

    if (active.cancelRequested) return
    active.cancelRequested = true

    const pendingTool = active.pendingTool
    active.pendingTool = null

    if (pendingTool) {
      const result = discardedToolResult(pendingTool.tool)
      if (this.store.getChat(chatId)) {
        try {
          await this.store.appendMessage(
            chatId,
            timestamped({
              kind: "tool_result",
              toolId: pendingTool.toolUseId,
              content: result,
            })
          )
        } catch {
          // Ignore if chat is concurrently deleted.
        }
      }
    }

    if (this.store.getChat(chatId)) {
      try {
        await this.store.appendMessage(chatId, timestamped({ kind: "interrupted" }))
        await this.store.recordTurnCancelled(chatId)
      } catch {
        // Ignore if chat is concurrently deleted.
      }
    }
    active.cancelRecorded = true
    active.hasFinalResult = true

    this.activeTurns.delete(chatId)
    this.onStateChange()

    try {
      await Promise.race([
        active.turn.interrupt(),
        new Promise((resolve) => setTimeout(resolve, 5_000)),
      ])
    } catch {
      // Fall through to force-close below.
    }
    active.turn.close()
  }

  async respondTool(command: Extract<ClientCommand, { type: "chat.respondTool" }>) {
    const active = this.activeTurns.get(command.chatId)
    if (!active || !active.pendingTool) {
      throw new Error("No pending tool request")
    }

    const pending = active.pendingTool
    if (pending.toolUseId !== command.toolUseId) {
      throw new Error("Tool response does not match active request")
    }

    await this.store.appendMessage(
      command.chatId,
      timestamped({
        kind: "tool_result",
        toolId: command.toolUseId,
        content: command.result,
      })
    )

    active.pendingTool = null
    active.status = "running"

    if (pending.tool.toolKind === "exit_plan_mode") {
      const result = (command.result ?? {}) as {
        confirmed?: boolean
        clearContext?: boolean
      }
      if (result.confirmed && result.clearContext) {
        await this.store.setSessionToken(command.chatId, null)
        await this.store.appendMessage(command.chatId, timestamped({ kind: "context_cleared" }))
      }
    }

    pending.resolve(command.result)
    this.onStateChange()
  }
}
