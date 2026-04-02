import { describe, expect, test } from "bun:test"
import { fallbackTitleFromMessage, generateTitleForChat, generateTitleForChatDetailed } from "./generate-title"
import { QuickResponseAdapter } from "./quick-response"

describe("QuickResponseAdapter", () => {
  test("returns the structured result when it validates", async () => {
    const adapter = new QuickResponseAdapter({
      runStructured: async () => ({ title: "Vision title" }),
    })

    const result = await adapter.generateStructured({
      cwd: "/tmp/project",
      task: "title generation",
      prompt: "Generate a title",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
      parse: (value) => {
        const output = value && typeof value === "object" ? value as { title?: unknown } : {}
        return typeof output.title === "string" ? output.title : null
      },
    })

    expect(result).toBe("Vision title")
  })

  test("returns null when the structured result fails validation", async () => {
    const adapter = new QuickResponseAdapter({
      runStructured: async () => ({ bad: true }),
    })

    const result = await adapter.generateStructured({
      cwd: "/tmp/project",
      task: "title generation",
      prompt: "Generate a title",
      schema: {
        type: "object",
        properties: {
          title: { type: "string" },
        },
        required: ["title"],
        additionalProperties: false,
      },
      parse: (value) => {
        const output = value && typeof value === "object" ? value as { title?: unknown } : {}
        return typeof output.title === "string" ? output.title : null
      },
    })

    expect(result).toBeNull()
  })
})

describe("generateTitleForChat", () => {
  test("sanitizes generated titles from the native Vision response", async () => {
    const title = await generateTitleForChat(
      "hello",
      "/tmp/project",
      {
        apiKey: "vl_test",
        fetchImpl: async () =>
          new Response(JSON.stringify({
            data: {
              type: "text",
              content: "   Example\nTitle   ",
            },
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      }
    )

    expect(title).toBe("Example Title")
  })

  test("falls back to the first message when the title is invalid", async () => {
    const title = await generateTitleForChat(
      "hello",
      "/tmp/project",
      {
        apiKey: "vl_test",
        fetchImpl: async () =>
          new Response(JSON.stringify({
            data: {
              type: "text",
              content: "   ",
            },
          }), {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }),
      }
    )

    expect(title).toBe("hello")
  })

  test("falls back to the first 35 characters of the message with ellipsis when the native title request fails", async () => {
    const title = await generateTitleForChat(
      "This message is definitely longer than thirty five characters",
      "/tmp/project",
      {
        apiKey: "vl_test",
        fetchImpl: async () => {
          throw new Error("network issue")
        },
      }
    )

    expect(title).toBe("This message is definitely longer t...")
  })

  test("falls back immediately when no API key is available", async () => {
    const title = await generateTitleForChat("hello there", "/tmp/project")
    expect(title).toBe("hello there")
  })

  test("returns fallback metadata when the Vision title request fails", async () => {
    const result = await generateTitleForChatDetailed(
      "hello there",
      "/tmp/project",
      {
        apiKey: "vl_test",
        fetchImpl: async () => {
          throw new Error("network issue")
        },
      }
    )

    expect(result).toEqual({
      title: "hello there",
      usedFallback: true,
      failureMessage: "network issue",
    })
  })
})

describe("fallbackTitleFromMessage", () => {
  test("normalizes whitespace", () => {
    expect(fallbackTitleFromMessage("  hello\n   world  ")).toBe("hello world")
  })

  test("returns null for blank input", () => {
    expect(fallbackTitleFromMessage("   \n  ")).toBeNull()
  })
})
