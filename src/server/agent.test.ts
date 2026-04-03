import { describe, expect, test } from "bun:test"
import type { ChatAttachment, TranscriptEntry } from "../shared/types"
import { AgentCoordinator, buildAttachmentHintText, buildPromptText, normalizeHarnessStreamMessage } from "./agent"
import type { HarnessTurn } from "./harness-types"

function timestamped<T extends Omit<TranscriptEntry, "_id" | "createdAt">>(entry: T): TranscriptEntry {
  return {
    _id: crypto.randomUUID(),
    createdAt: Date.now(),
    ...entry,
  } as TranscriptEntry
}

async function waitFor(condition: () => boolean, timeoutMs = 2_000) {
  const start = Date.now()
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}

function createCoordinatorStore() {
  const chat = {
    id: "chat-1",
    projectId: "project-1",
    title: "New Chat",
    provider: "vision" as const,
    planMode: false,
    sessionToken: null as string | null,
  }

  return {
    chat,
    messages: [] as TranscriptEntry[],
    turnFinishedCount: 0,
    turnCancelledCount: 0,
    turnFailedCount: 0,
    getChat(chatId: string) {
      return chatId === chat.id ? chat : null
    },
    requireChat() {
      return chat
    },
    getMessages() {
      return this.messages
    },
    async appendMessage(_chatId: string, entry: TranscriptEntry) {
      this.messages.push(entry)
    },
    async recordTurnFinished() {
      this.turnFinishedCount += 1
    },
    async recordTurnCancelled() {
      this.turnCancelledCount += 1
    },
    async recordTurnFailed() {
      this.turnFailedCount += 1
    },
    async setSessionToken(_chatId: string, sessionToken: string | null) {
      chat.sessionToken = sessionToken
    },
  }
}

describe("normalizeHarnessStreamMessage", () => {
  test("normalizes assistant tool calls", () => {
    const entries = normalizeHarnessStreamMessage({
      type: "assistant",
      uuid: "msg-1",
      message: {
        content: [
          {
            type: "tool_use",
            id: "tool-1",
            name: "Bash",
            input: {
              command: "pwd",
              timeout: 1000,
            },
          },
        ],
      },
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.kind).toBe("tool_call")
    if (entries[0]?.kind !== "tool_call") throw new Error("unexpected entry")
    expect(entries[0].tool.toolKind).toBe("bash")
  })

  test("normalizes result messages", () => {
    const entries = normalizeHarnessStreamMessage({
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 3210,
      result: "done",
    })

    expect(entries).toHaveLength(1)
    expect(entries[0]?.kind).toBe("result")
    if (entries[0]?.kind !== "result") throw new Error("unexpected entry")
    expect(entries[0].durationMs).toBe(3210)
  })
})

describe("attachment prompt helpers", () => {
  test("appends a structured attachment hint block for all attachment kinds", () => {
    const attachments: ChatAttachment[] = [
      {
        id: "image-1",
        kind: "image",
        displayName: "shot.png",
        absolutePath: "/tmp/project/.vispark-code/uploads/shot.png",
        relativePath: "./.vispark-code/uploads/shot.png",
        contentUrl: "/api/projects/project-1/uploads/shot.png/content",
        mimeType: "image/png",
        size: 512,
      },
      {
        id: "file-1",
        kind: "file",
        displayName: "spec.pdf",
        absolutePath: "/tmp/project/.vispark-code/uploads/spec.pdf",
        relativePath: "./.vispark-code/uploads/spec.pdf",
        contentUrl: "/api/projects/project-1/uploads/spec.pdf/content",
        mimeType: "application/pdf",
        size: 1234,
      },
    ]

    const prompt = buildPromptText("Review these", attachments)
    expect(prompt).toContain("<vispark-code-attachments>")
    expect(prompt).toContain('path="/tmp/project/.vispark-code/uploads/shot.png"')
    expect(prompt).toContain('project_path="./.vispark-code/uploads/spec.pdf"')
    expect(prompt).toContain('content_url="/api/projects/project-1/uploads/spec.pdf/content"')
  })

  test("supports attachment-only prompts", () => {
    const attachments: ChatAttachment[] = [{
      id: "file-1",
      kind: "file",
      displayName: "todo.txt",
      absolutePath: "/tmp/project/.vispark-code/uploads/todo.txt",
      relativePath: "./.vispark-code/uploads/todo.txt",
      contentUrl: "/api/projects/project-1/uploads/todo.txt/content",
      mimeType: "text/plain",
      size: 32,
    }]

    expect(buildPromptText("", attachments)).toContain("Please inspect the attached files.")
  })

  test("escapes xml attribute values for attachment hint markup", () => {
    const hint = buildAttachmentHintText([{
      id: "file-1",
      kind: "file",
      displayName: "\"report\" <draft>.txt",
      absolutePath: "/tmp/project/.vispark-code/uploads/report.txt",
      relativePath: "./.vispark-code/uploads/report.txt",
      contentUrl: "/api/projects/project-1/uploads/report.txt/content",
      mimeType: "text/plain",
      size: 64,
    }])

    expect(hint).toContain("&quot;report&quot; &lt;draft&gt;.txt")
  })
})

describe("background title generation", () => {
  test("renames chats when background title generation succeeds", async () => {
    const chat = { id: "chat-1", title: "first message" }
    const store = {
      requireChat: () => chat,
      renameChat: async (_chatId: string, title: string) => {
        chat.title = title
      },
    }
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      generateTitle: async () => ({
        title: "Better title",
        usedFallback: false,
        failureMessage: null,
      }),
    })

    await (coordinator as any).generateTitleInBackground("chat-1", "first message", "/tmp/project", "first message")

    expect(chat.title).toBe("Better title")
  })

  test("reports title-generation failures without overwriting the optimistic title", async () => {
    const chat = { id: "chat-1", title: "first message" }
    const store = {
      requireChat: () => chat,
      renameChat: async (_chatId: string, title: string) => {
        chat.title = title
      },
    }
    const errors: string[] = []
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
      generateTitle: async () => ({
        title: "first message",
        usedFallback: true,
        failureMessage: "network issue",
      }),
    })
    coordinator.setBackgroundErrorReporter((message) => {
      errors.push(message)
    })

    await (coordinator as any).generateTitleInBackground("chat-1", "first message", "/tmp/project", "first message")

    expect(chat.title).toBe("first message")
    expect(errors).toEqual([
      "[title-generation] chat chat-1 failed: network issue",
    ])
  })
})

describe("turn draining and cancellation", () => {
  test("marks finished turns as draining until the stream closes", async () => {
    let resolveStream!: () => void

    const turn: HarnessTurn = {
      provider: "vision",
      stream: (async function* () {
        yield {
          type: "transcript" as const,
          entry: timestamped({
            kind: "system_init",
            provider: "vision",
            model: "vispark/vision-medium",
            tools: [],
            agents: [],
            slashCommands: [],
            mcpServers: [],
          }),
        }
        yield {
          type: "transcript" as const,
          entry: timestamped({
            kind: "result",
            subtype: "success",
            isError: false,
            durationMs: 120_000,
            result: "done",
          }),
        }
        await new Promise<void>((resolve) => {
          resolveStream = resolve
        })
      })(),
      interrupt: async () => {},
      close: () => {
        resolveStream?.()
      },
    }

    const store = createCoordinatorStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
    })

    const active = {
      chatId: "chat-1",
      provider: "vision" as const,
      turn,
      model: "vispark/vision-medium",
      planMode: false,
      status: "starting" as const,
      pendingTool: null,
      hasFinalResult: false,
      cancelRequested: false,
      cancelRecorded: false,
    }

    coordinator.activeTurns.set("chat-1", active)
    void (coordinator as any).runTurn(active)

    await waitFor(() => store.messages.some((entry) => entry.kind === "result"))

    expect(coordinator.getActiveStatuses().has("chat-1")).toBe(false)
    expect(coordinator.getDrainingChatIds().has("chat-1")).toBe(true)
    expect(store.turnFinishedCount).toBe(1)

    resolveStream()
    await waitFor(() => !coordinator.getDrainingChatIds().has("chat-1"))
  })

  test("stopDraining closes the stream and removes the draining indicator state", async () => {
    let resolveStream!: () => void
    let streamClosed = false

    const turn: HarnessTurn = {
      provider: "vision",
      stream: (async function* () {
        yield {
          type: "transcript" as const,
          entry: timestamped({
            kind: "result",
            subtype: "success",
            isError: false,
            durationMs: 0,
            result: "done",
          }),
        }
        await new Promise<void>((resolve) => {
          resolveStream = resolve
        })
      })(),
      interrupt: async () => {},
      close: () => {
        streamClosed = true
        resolveStream?.()
      },
    }

    const store = createCoordinatorStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
    })

    const active = {
      chatId: "chat-1",
      provider: "vision" as const,
      turn,
      model: "vispark/vision-medium",
      planMode: false,
      status: "running" as const,
      pendingTool: null,
      hasFinalResult: false,
      cancelRequested: false,
      cancelRecorded: false,
    }

    coordinator.activeTurns.set("chat-1", active)
    void (coordinator as any).runTurn(active)

    await waitFor(() => coordinator.getDrainingChatIds().has("chat-1"))

    await coordinator.stopDraining("chat-1")

    expect(coordinator.getDrainingChatIds().has("chat-1")).toBe(false)
    expect(streamClosed).toBe(true)
  })

  test("cancel removes the active turn before interrupt completes", async () => {
    let resolveInterrupt!: () => void
    const interruptCalled = new Promise<void>((resolve) => {
      resolveInterrupt = resolve
    })
    let interruptDone = false

    const turn: HarnessTurn = {
      provider: "vision",
      stream: (async function* () {
        yield {
          type: "transcript" as const,
          entry: timestamped({
            kind: "system_init",
            provider: "vision",
            model: "vispark/vision-medium",
            tools: [],
            agents: [],
            slashCommands: [],
            mcpServers: [],
          }),
        }
        await new Promise(() => {})
      })(),
      interrupt: async () => {
        resolveInterrupt()
        await new Promise<void>((resolve) => {
          setTimeout(() => {
            interruptDone = true
            resolve()
          }, 100)
        })
      },
      close: () => {},
    }

    const store = createCoordinatorStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
    })

    const active = {
      chatId: "chat-1",
      provider: "vision" as const,
      turn,
      model: "vispark/vision-medium",
      planMode: false,
      status: "starting" as const,
      pendingTool: null,
      hasFinalResult: false,
      cancelRequested: false,
      cancelRecorded: false,
    }

    coordinator.activeTurns.set("chat-1", active)
    void (coordinator as any).runTurn(active)

    await waitFor(() => coordinator.getActiveStatuses().get("chat-1") === "running")

    const cancelPromise = coordinator.cancel("chat-1")
    await interruptCalled

    expect(coordinator.getActiveStatuses().has("chat-1")).toBe(false)
    expect(interruptDone).toBe(false)

    await cancelPromise
    expect(store.messages.filter((entry) => entry.kind === "interrupted")).toHaveLength(1)
  })

  test("concurrent cancel calls only record a single interruption", async () => {
    let releaseStream!: () => void

    const turn: HarnessTurn = {
      provider: "vision",
      stream: (async function* () {
        yield {
          type: "transcript" as const,
          entry: timestamped({
            kind: "system_init",
            provider: "vision",
            model: "vispark/vision-medium",
            tools: [],
            agents: [],
            slashCommands: [],
            mcpServers: [],
          }),
        }
        await new Promise<void>((resolve) => {
          releaseStream = resolve
        })
      })(),
      interrupt: async () => {
        releaseStream()
      },
      close: () => {},
    }

    const store = createCoordinatorStore()
    const coordinator = new AgentCoordinator({
      store: store as never,
      onStateChange: () => {},
    })

    const active = {
      chatId: "chat-1",
      provider: "vision" as const,
      turn,
      model: "vispark/vision-medium",
      planMode: false,
      status: "starting" as const,
      pendingTool: null,
      hasFinalResult: false,
      cancelRequested: false,
      cancelRecorded: false,
    }

    coordinator.activeTurns.set("chat-1", active)
    void (coordinator as any).runTurn(active)

    await waitFor(() => coordinator.getActiveStatuses().get("chat-1") === "running")

    await Promise.all([
      coordinator.cancel("chat-1"),
      coordinator.cancel("chat-1"),
      coordinator.cancel("chat-1"),
    ])

    expect(store.messages.filter((entry) => entry.kind === "interrupted")).toHaveLength(1)
  })
})
