import { randomUUID } from "node:crypto"
import http, { type IncomingMessage, type ServerResponse } from "node:http"
import type { AppSettingsStore } from "./app-settings"

const DEFAULT_VISION_ENDPOINT = "https://api.lab.vispark.in/model/text/vision"
const DEFAULT_VISION_MODEL = "vispark/vision-medium"
const CONTINUAL_LEARNING_MARKER = "<vispark-code-continual-learning enabled=\"true\" />"
const CONTINUAL_LEARNING_SYSTEM_GUIDANCE = [
  "Continual learning is enabled for this user.",
  "Learn only the user's code-relevant preferences and habits that can be useful in future coding work, such as coding style, code preferences, naming patterns, architecture habits, and technical communication preferences.",
  "Do not learn or retain anything unrelated to coding or future development usefulness.",
  "Apply what you learn quietly and consistently unless the user explicitly asks about the learning behavior.",
].join("\n\n")

type VisparkLabTextBlock = {
  type: "text";
  text: string;
}

type VisparkLabToolUseBlock = {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

type VisparkLabToolResultBlock = {
  type: "tool_result";
  tool_use_id: string;
  content: unknown;
  is_error?: boolean;
}

type VisparkLabMessage = {
  role: "user" | "assistant";
  content: Array<VisparkLabTextBlock | VisparkLabToolUseBlock | VisparkLabToolResultBlock>;
}

type VisparkLabToolDefinition = {
  name: string;
  description?: string;
  input_schema?: Record<string, unknown>;
}

type VisparkLabMessagesRequest = {
  model?: string;
  system?: Array<{ type: "text"; text: string }>;
  messages?: VisparkLabMessage[];
  tools?: VisparkLabToolDefinition[];
}

type VisionToolDefinition = {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

type VisionResponse = {
  status: string
  message?: string
  error?: string
  weights?: string
  data?:
    | {
        type: "text"
        content: string
        input_tokens?: number
        output_tokens?: number
        status?: boolean
        weights?: string
      }
    | {
        type: "tool_calls"
        tool_calls: Array<{
          name: string
          arguments: Record<string, unknown>
        }>
        input_tokens?: number
        output_tokens?: number
        status?: boolean
        weights?: string
      }
}

type FlattenedVisionPrompt = {
  systemMessage: string
  prompt: string
  continualLearningEnabled: boolean
  continualLearning: boolean
}

function stringifyContent(value: unknown) {
  if (typeof value === "string") return value
  try {
    return JSON.stringify(value, null, 2)
  } catch {
    return String(value)
  }
}

function compactToolDefinition(tool: VisparkLabToolDefinition): VisionToolDefinition {
  switch (tool.name) {
    case "Agent":
      return {
        type: "function",
        function: {
          name: "Agent",
          description: "Delegate a bounded task to a sub-agent when deeper parallel exploration or execution is needed.",
          parameters: {
            type: "object",
            properties: {
              description: { type: "string" },
              prompt: { type: "string" },
              subagent_type: { type: "string" },
              model: { type: "string" },
              resume: { type: "string" },
              run_in_background: { type: "boolean" },
              isolation: { type: "string" },
            },
            required: ["description", "prompt"],
          },
        },
      }
    case "TaskOutput":
      return {
        type: "function",
        function: {
          name: "TaskOutput",
          description: "Read output from a running or completed background task.",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string" },
              block: { type: "boolean" },
              timeout: { type: "number" },
            },
            required: ["task_id"],
          },
        },
      }
    case "Bash":
      return {
        type: "function",
        function: {
          name: "Bash",
          description: "Run a shell command in the project workspace.",
          parameters: {
            type: "object",
            properties: {
              command: { type: "string" },
              description: { type: "string" },
              timeout: { type: "number" },
              run_in_background: { type: "boolean" },
              dangerouslyDisableSandbox: { type: "boolean" },
            },
            required: ["command"],
          },
        },
      }
    case "Glob":
      return {
        type: "function",
        function: {
          name: "Glob",
          description: "Find files by glob pattern.",
          parameters: {
            type: "object",
            properties: {
              pattern: { type: "string" },
              path: { type: "string" },
            },
            required: ["pattern"],
          },
        },
      }
    case "Grep":
      return {
        type: "function",
        function: {
          name: "Grep",
          description: "Search file contents by pattern.",
          parameters: {
            type: "object",
            properties: {
              pattern: { type: "string" },
              path: { type: "string" },
              output_mode: { type: "string" },
            },
            required: ["pattern"],
          },
        },
      }
    case "Read":
      return {
        type: "function",
        function: {
          name: "Read",
          description: "Read file contents from the workspace.",
          parameters: {
            type: "object",
            properties: {
              file_path: { type: "string" },
              offset: { type: "number" },
              limit: { type: "number" },
            },
            required: ["file_path"],
          },
        },
      }
    case "Edit":
      return {
        type: "function",
        function: {
          name: "Edit",
          description: "Edit a file by replacing old text with new text.",
          parameters: {
            type: "object",
            properties: {
              file_path: { type: "string" },
              old_string: { type: "string" },
              new_string: { type: "string" },
              replace_all: { type: "boolean" },
            },
            required: ["file_path", "old_string", "new_string"],
          },
        },
      }
    case "Write":
      return {
        type: "function",
        function: {
          name: "Write",
          description: "Write full file contents to a path in the workspace.",
          parameters: {
            type: "object",
            properties: {
              file_path: { type: "string" },
              content: { type: "string" },
            },
            required: ["file_path", "content"],
          },
        },
      }
    case "WebFetch":
      return {
        type: "function",
        function: {
          name: "WebFetch",
          description: "Fetch a web page and extract information from it.",
          parameters: {
            type: "object",
            properties: {
              url: { type: "string" },
              prompt: { type: "string" },
            },
            required: ["url", "prompt"],
          },
        },
      }
    case "TodoWrite":
      return {
        type: "function",
        function: {
          name: "TodoWrite",
          description: "Create or update a structured todo list for the current task.",
          parameters: {
            type: "object",
            properties: {
              todos: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    content: { type: "string" },
                    status: { type: "string", enum: ["pending", "in_progress", "completed"] },
                    activeForm: { type: "string" },
                  },
                  required: ["content", "status", "activeForm"],
                },
              },
            },
            required: ["todos"],
          },
        },
      }
    case "WebSearch":
      return {
        type: "function",
        function: {
          name: "WebSearch",
          description: "Search the web for current information.",
          parameters: {
            type: "object",
            properties: {
              query: { type: "string" },
              allowed_domains: { type: "array", items: { type: "string" } },
              blocked_domains: { type: "array", items: { type: "string" } },
            },
            required: ["query"],
          },
        },
      }
    case "TaskStop":
      return {
        type: "function",
        function: {
          name: "TaskStop",
          description: "Stop a running background task.",
          parameters: {
            type: "object",
            properties: {
              task_id: { type: "string" },
              shell_id: { type: "string" },
            },
          },
        },
      }
    case "AskUserQuestion":
      return {
        type: "function",
        function: {
          name: "AskUserQuestion",
          description: "Ask the user a clarifying question and wait for their answer.",
          parameters: {
            type: "object",
            properties: {
              questions: {
                type: "array",
                items: {
                  type: "object",
                  properties: {
                    question: { type: "string" },
                    header: { type: "string" },
                    options: {
                      type: "array",
                      items: {
                        type: "object",
                        properties: {
                          label: { type: "string" },
                          description: { type: "string" },
                        },
                        required: ["label", "description"],
                      },
                    },
                    multiSelect: { type: "boolean" },
                  },
                  required: ["question", "header", "options", "multiSelect"],
                },
              },
              answers: { type: "object" },
            },
            required: ["questions"],
          },
        },
      }
    case "Skill":
      return {
        type: "function",
        function: {
          name: "Skill",
          description: "Invoke a named skill with optional arguments.",
          parameters: {
            type: "object",
            properties: {
              skill: { type: "string" },
              args: { type: "string" },
            },
            required: ["skill"],
          },
        },
      }
    case "EnterPlanMode":
      return {
        type: "function",
        function: {
          name: "EnterPlanMode",
          description: "Enter plan mode before a non-trivial implementation task.",
          parameters: {
            type: "object",
            properties: {},
          },
        },
      }
    case "ExitPlanMode":
      return {
        type: "function",
        function: {
          name: "ExitPlanMode",
          description: "Exit plan mode with a concise plan or summary for user approval.",
          parameters: {
            type: "object",
            properties: {
              plan: { type: "string" },
              summary: { type: "string" },
            },
          },
        },
      }
    default:
      return {
        type: "function",
        function: {
          name: tool.name,
          description: tool.description?.split("\n")[0]?.trim() || `Call the ${tool.name} tool when needed.`,
          parameters: tool.input_schema ?? {
            type: "object",
            properties: {},
          },
        },
      }
  }
}

function toVisionTools(tools: VisparkLabToolDefinition[] | undefined): VisionToolDefinition[] | undefined {
  if (!tools?.length) return undefined
  return tools.map((tool) => compactToolDefinition(tool))
}

function mapVisionModel(model?: string) {
  if (model === "vispark/vision-small") return { modelId: model, size: "small" as const }
  if (model === "vispark/vision-large") return { modelId: model, size: "large" as const }
  if (model === "vispark/vision-medium") return { modelId: model, size: "medium" as const }
  if (model?.includes("haiku")) return { modelId: "vispark/vision-small", size: "small" as const }
  if (model?.includes("opus")) return { modelId: "vispark/vision-large", size: "large" as const }
  return { modelId: DEFAULT_VISION_MODEL, size: "medium" as const }
}

function isInitialUserMessageRequest(messages: VisparkLabMessage[] | undefined) {
  const latestUserMessage = [...(messages ?? [])].reverse().find((message) => message.role === "user")
  if (!latestUserMessage) return false
  const hasToolResult = latestUserMessage.content.some((block) => block.type === "tool_result")
  const hasText = latestUserMessage.content.some((block) => block.type === "text" && block.text.trim().length > 0)
  return hasText && !hasToolResult
}

function flattenVisionPrompt(request: VisparkLabMessagesRequest): FlattenedVisionPrompt {
  let continualLearningEnabled = false
  const systemText = (request.system ?? [])
    .map((block) => {
      if (!block.text.includes(CONTINUAL_LEARNING_MARKER)) {
        return block.text
      }
      continualLearningEnabled = true
      return block.text.replaceAll(CONTINUAL_LEARNING_MARKER, "").trim()
    })
    .filter((block) => block.length > 0)
    .join("\n\n")
  const continualLearning = continualLearningEnabled && isInitialUserMessageRequest(request.messages)
  const effectiveSystemMessage = continualLearning
    ? [systemText, CONTINUAL_LEARNING_SYSTEM_GUIDANCE].filter((block) => block.length > 0).join("\n\n")
    : systemText

  const transcript = (request.messages ?? [])
    .flatMap((message) => {
      const role = message.role === "assistant" ? "assistant" : "user"
      return message.content.map((block) => {
        if (block.type === "text") {
          return `${role.toUpperCase()}:\n${block.text}`
        }
        if (block.type === "tool_use") {
          return `ASSISTANT TOOL CALL ${block.name} (${block.id}):\n${JSON.stringify(block.input, null, 2)}`
        }
        return `TOOL RESULT ${block.tool_use_id}${block.is_error ? " [error]" : ""}:\n${stringifyContent(block.content)}`
      })
    })
    .join("\n\n")

  return {
    systemMessage: effectiveSystemMessage || "You are the coding assistant backend for Vispark Code.",
    prompt: transcript || "USER:\n",
    continualLearningEnabled,
    continualLearning,
  }
}

function extractVisionWeights(payload: VisionResponse) {
  if (typeof payload.weights === "string") return payload.weights
  if (payload.data && "weights" in payload.data && typeof payload.data.weights === "string") {
    return payload.data.weights
  }
  return null
}

function sseChunk(event: string, data: unknown) {
  return `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
}

function writeTextStream(
  res: ServerResponse,
  model: string,
  content: string,
  usage: { inputTokens: number; outputTokens: number }
) {
  const messageId = `msg_${randomUUID()}`
  res.write(sseChunk("message_start", {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: usage.inputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
      },
    },
  }))
  res.write(sseChunk("content_block_start", {
    type: "content_block_start",
    index: 0,
    content_block: { type: "text", text: "" },
  }))
  if (content) {
    res.write(sseChunk("content_block_delta", {
      type: "content_block_delta",
      index: 0,
      delta: { type: "text_delta", text: content },
    }))
  }
  res.write(sseChunk("content_block_stop", { type: "content_block_stop", index: 0 }))
  res.write(sseChunk("message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: "end_turn",
      stop_sequence: null,
    },
    usage: {
      output_tokens: usage.outputTokens,
    },
  }))
  res.write(sseChunk("message_stop", { type: "message_stop" }))
  res.end()
}

function writeToolUseStream(
  res: ServerResponse,
  model: string,
  toolCalls: Array<{ name: string; arguments: Record<string, unknown> }>,
  usage: { inputTokens: number; outputTokens: number }
) {
  const messageId = `msg_${randomUUID()}`
  res.write(sseChunk("message_start", {
    type: "message_start",
    message: {
      id: messageId,
      type: "message",
      role: "assistant",
      model,
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: {
        input_tokens: usage.inputTokens,
        cache_creation_input_tokens: 0,
        cache_read_input_tokens: 0,
        output_tokens: 0,
      },
    },
  }))

  toolCalls.forEach((toolCall, index) => {
    const toolUseId = `toolu_${randomUUID()}`
    res.write(sseChunk("content_block_start", {
      type: "content_block_start",
      index,
      content_block: {
        type: "tool_use",
        id: toolUseId,
        name: toolCall.name,
        input: {},
      },
    }))
    res.write(sseChunk("content_block_delta", {
      type: "content_block_delta",
      index,
      delta: {
        type: "input_json_delta",
        partial_json: JSON.stringify(toolCall.arguments ?? {}),
      },
    }))
    res.write(sseChunk("content_block_stop", { type: "content_block_stop", index }))
  })

  res.write(sseChunk("message_delta", {
    type: "message_delta",
    delta: {
      stop_reason: "tool_use",
      stop_sequence: null,
    },
    usage: {
      output_tokens: usage.outputTokens,
    },
  }))
  res.write(sseChunk("message_stop", { type: "message_stop" }))
  res.end()
}

async function readJson<T>(req: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(Buffer.from(chunk))
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8")) as T
}

function cleanErrorMessage(message: string): string {
  return message
    .replace(/^Vision API Error: /i, "")
    .replace(/^Vision API \d+: /i, "")
    .trim()
}

async function callVision(
  request: VisparkLabMessagesRequest,
  apiKey: string,
  prompt: FlattenedVisionPrompt,
  currentWeights: string
) {
  const { modelId, size } = mapVisionModel(request.model)

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort(), 30000)

  try {
    const visionResponse = await fetch(DEFAULT_VISION_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        size,
        content: [
          {
            type: "text",
            content: prompt.prompt,
          },
        ],
        system_message: prompt.systemMessage,
        stream: false,
        continual_learning: prompt.continualLearning,
        weights: prompt.continualLearningEnabled ? currentWeights : undefined,
        tools: toVisionTools(request.tools),
      }),
    })

    if (!visionResponse.ok) {
      const text = await visionResponse.text()
      let errorMessage = text
      try {
        const parsed = JSON.parse(text)
        errorMessage = parsed.error || parsed.message || text
      } catch {
        // Not JSON
      }
      const error = new Error(cleanErrorMessage(errorMessage))
      ;(error as any).status = visionResponse.status
      throw error
    }

    const payload = (await visionResponse.json()) as VisionResponse
    if (payload.status !== "success" || (payload.data && (payload.data as any).status === false)) {
      const message = payload.message || payload.error || (payload.data as any)?.message || "Unknown Vision API error"
      const error = new Error(cleanErrorMessage(message))

      // Map application-level errors to appropriate HTTP status codes
      let status = 400 // Default to Bad Request
      const lowerMessage = message.toLowerCase()
      if (lowerMessage.includes("key") || lowerMessage.includes("unauthorized") || lowerMessage.includes("auth") || lowerMessage.includes("verify")) {
        // Use 400 for fatal auth errors to prevent SDK retries
        status = 400
      } else if (
        lowerMessage.includes("unit") ||
        lowerMessage.includes("balance") ||
        lowerMessage.includes("quota") ||
        lowerMessage.includes("credit")
      ) {
        status = 402
      } else if (lowerMessage.includes("rate limit") || lowerMessage.includes("too many requests")) {
        status = 429
      }

      ;(error as any).status = status
      throw error
    }

    return {
      modelId,
      payload,
      weights: extractVisionWeights(payload),
    }
  } finally {
    clearTimeout(timeoutId)
  }
}

export class VisionProxyServer {
  private readonly settings: AppSettingsStore
  private server: http.Server | null = null
  private port: number | null = null

  constructor(settings: AppSettingsStore) {
    this.settings = settings
  }

  async start() {
    if (this.server && this.port) {
      return this.baseUrl()
    }

    this.server = http.createServer(async (req, res) => {
      // Handle account info and user requests from the harness
      if (req.url?.includes("/v1/account") || req.url?.includes("/v1/users/me") || req.url?.includes("/v1/stats")) {
        res.writeHead(200, { "content-type": "application/json" })
        res.end(JSON.stringify({
          status: "success",
          data: {
            email: "user@vispark.in",
            plan: "pro",
            remaining_units: 1000000,
            has_completed_onboarding: true,
            is_authenticated: true
          }
        }))
        return
      }

      if (req.method !== "POST" || !req.url?.startsWith("/v1/messages")) {
        res.writeHead(404, { "content-type": "application/json" })
        res.end(JSON.stringify({ error: { type: "not_found_error", message: "Not found" } }))
        return
      }

      const { visionApiKey } = this.settings.getSnapshot()
      if (!visionApiKey) {
        res.writeHead(400, { "content-type": "application/json" })
        res.end(JSON.stringify({
          error: {
            type: "invalid_request_error",
            message: "Vispark Lab API key is not configured in Vispark Code settings.",
          },
        }))
        return
      }

      try {
        const request = await readJson<VisparkLabMessagesRequest>(req)
        const prompt = flattenVisionPrompt(request)
        const currentWeights = prompt.continualLearningEnabled
          ? this.settings.readVisionContinualLearningWeights()
          : ""
        const { modelId, payload, weights } = await callVision(request, visionApiKey, prompt, currentWeights)
        if (prompt.continualLearningEnabled && typeof weights === "string") {
          this.settings.updateVisionContinualLearningWeights(weights)
        }
        const responseData = payload.data

        res.writeHead(200, {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
          connection: "keep-alive",
        })

        if (responseData?.type === "tool_calls") {
          writeToolUseStream(res, modelId, responseData.tool_calls ?? [], {
            inputTokens: responseData.input_tokens ?? 0,
            outputTokens: responseData.output_tokens ?? 0,
          })
          return
        }

        writeTextStream(res, modelId, responseData?.content ?? "", {
          inputTokens: responseData?.input_tokens ?? 0,
          outputTokens: responseData?.output_tokens ?? 0,
        })
      } catch (error) {
        let status = (error as any).status || 500
        // Ensure we never return 200 for a caught error to prevent SDK hangs
        if (status === 200) status = 500

        let errorType = "api_error"
        let errorMessage = error instanceof Error ? error.message : String(error)
        errorMessage = cleanErrorMessage(errorMessage)
        const lowerMessage = errorMessage.toLowerCase()

        if (status === 401 || status === 400 || lowerMessage.includes("verify key") || lowerMessage.includes("invalid api key") || lowerMessage.includes("unauthorized")) {
          errorType = "invalid_request_error"
          status = 400 // Use 400 for fatal auth errors to prevent SDK retries
        } else if (status === 429 || lowerMessage.includes("rate limit") || lowerMessage.includes("too many requests")) {
          errorType = "rate_limit_error"
          status = 429
        } else if (status === 402 || lowerMessage.includes("insufficient units") || lowerMessage.includes("insufficient balance") || lowerMessage.includes("quota")) {
          errorType = "over_quota_error"
          status = 402
        } else if (status === 400) {
          errorType = "invalid_request_error"
        }

        res.writeHead(status, { "content-type": "application/json" })
        res.end(JSON.stringify({
          error: {
            type: errorType,
            message: errorMessage,
          },
        }))
      }
    })


    await new Promise<void>((resolve, reject) => {
      this.server?.once("error", reject)
      this.server?.listen(0, "127.0.0.1", () => resolve())
    })

    const address = this.server.address()
    if (!address || typeof address === "string") {
      throw new Error("Vision proxy did not expose a TCP port")
    }

    this.port = address.port
    return this.baseUrl()
  }

  baseUrl() {
    if (!this.port) {
      throw new Error("Vision proxy is not running")
    }
    return `http://127.0.0.1:${this.port}`
  }

  async stop() {
    if (!this.server) return
    const server = this.server
    this.server = null
    this.port = null
    await new Promise<void>((resolve, reject) => {
      server.close((error) => {
        if (error) reject(error)
        else resolve()
      })
    })
  }
}
