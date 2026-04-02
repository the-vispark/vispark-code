const TITLE_ENDPOINT = "https://api.lab.vispark.in/model/text/vision"
type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>

type VisionTitleResponse = {
  data?: {
    type?: string
    content?: unknown
  }
}

function normalizeGeneratedTitle(value: unknown): string | null {
  if (typeof value !== "string") return null
  const normalized = value.replace(/\s+/g, " ").trim().slice(0, 80)
  if (!normalized || normalized === "New Chat") return null
  return normalized
}

export function fallbackTitleFromMessage(messageContent: string): string | null {
  const normalized = messageContent.replace(/\s+/g, " ").trim()

  if (!normalized) return null
  if (normalized.length <= 35) return normalized
  return `${normalized.slice(0, 35)}...`
}

export interface GenerateChatTitleResult {
  title: string | null
  usedFallback: boolean
  failureMessage: string | null
}

export async function generateTitleForChat(
  messageContent: string,
  cwd: string,
  options: {
    apiKey?: string
    fetchImpl?: FetchLike
  } = {}
): Promise<string | null> {
  const result = await generateTitleForChatDetailed(messageContent, cwd, options)
  return result.title
}

export async function generateTitleForChatDetailed(
  messageContent: string,
  cwd: string,
  options: {
    apiKey?: string
    fetchImpl?: FetchLike
  } = {}
): Promise<GenerateChatTitleResult> {
  void cwd
  const fallbackTitle = fallbackTitleFromMessage(messageContent)
  const apiKey = options.apiKey?.trim()
  if (!apiKey) {
    return {
      title: fallbackTitle,
      usedFallback: true,
      failureMessage: null,
    }
  }

  try {
    const response = await (options.fetchImpl ?? fetch)(TITLE_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": apiKey,
      },
      body: JSON.stringify({
        size: "small",
        content: [
          {
            type: "text",
            content: [
              "Generate a short conversation title under 30 characters.",
              "Return only the title text with no quotes or extra commentary.",
              `Message: ${messageContent}`,
            ].join("\n"),
          },
        ],
        system_message: "You generate concise chat titles for a coding assistant UI.",
        stream: false,
      }),
    })

    if (!response.ok) {
      return {
        title: fallbackTitle,
        usedFallback: true,
        failureMessage: `Vision title request failed with status ${response.status}`,
      }
    }

    const payload = await response.json() as VisionTitleResponse
    const title = normalizeGeneratedTitle(payload.data?.content)
    if (title) {
      return {
        title,
        usedFallback: false,
        failureMessage: null,
      }
    }

    return {
      title: fallbackTitle,
      usedFallback: true,
      failureMessage: "Vision title response was empty or invalid",
    }
  } catch (error) {
    return {
      title: fallbackTitle,
      usedFallback: true,
      failureMessage: error instanceof Error ? error.message : String(error),
    }
  }
}
