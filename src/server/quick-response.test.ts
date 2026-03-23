import { describe, expect, test } from "bun:test"
import { generateTitleForChat } from "./generate-title"
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

  test("falls back to a short snippet when the native title request fails", async () => {
    const title = await generateTitleForChat(
      "Build a realtime terminal UI for the project dashboard with tabs",
      "/tmp/project",
      {
        apiKey: "vl_test",
        fetchImpl: async () => {
          throw new Error("network issue")
        },
      }
    )

    expect(title).toBe("Build a realtime terminal UI for the project das")
  })

  test("falls back immediately when no API key is available", async () => {
    const title = await generateTitleForChat("hello there", "/tmp/project")
    expect(title).toBe("hello there")
  })
})
