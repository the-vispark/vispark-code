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

function fallbackTitleFromMessage(messageContent: string): string | null {
  const normalized = messageContent
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'`]+|["'`]+$/g, "")

  if (!normalized) return null

  const snippet = normalized.slice(0, 48).trim()
  if (!snippet || snippet === "New Chat") return null

  return snippet
}

export async function generateTitleForChat(
  messageContent: string,
  cwd: string,
  options: {
    apiKey?: string
    fetchImpl?: FetchLike
  } = {}
): Promise<string | null> {
  void cwd
  const apiKey = options.apiKey?.trim()
  if (!apiKey) {
    return fallbackTitleFromMessage(messageContent)
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
      return fallbackTitleFromMessage(messageContent)
    }

    const payload = await response.json() as VisionTitleResponse
    return normalizeGeneratedTitle(payload.data?.content) ?? fallbackTitleFromMessage(messageContent)
  } catch {
    return fallbackTitleFromMessage(messageContent)
  }
}
