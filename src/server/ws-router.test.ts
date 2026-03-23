import { describe, expect, test } from "bun:test"
import { PROTOCOL_VERSION } from "../shared/types"
import { createEmptyState } from "./events"
import { createWsRouter } from "./ws-router"

const TEST_SETTINGS_SNAPSHOT = {
  visionApiKey: "",
  visionContinualLearningWeightsPath: "/tmp/vision-continual-learning-weights.txt",
}

class FakeWebSocket {
  readonly sent: unknown[] = []
  readonly data = {
    subscriptions: new Map(),
  }

  send(message: string) {
    this.sent.push(JSON.parse(message))
  }
}

describe("ws-router", () => {
  test("acks system.ping without broadcasting snapshots", () => {
    const router = createWsRouter({
      store: { state: createEmptyState() } as never,
      settings: { getSnapshot: () => TEST_SETTINGS_SNAPSHOT } as never,
      agent: { getActiveStatuses: () => new Map() } as never,
      terminals: {
        getSnapshot: () => null,
        onEvent: () => () => {},
      } as never,
      fileTree: {
        getSnapshot: () => ({ projectId: "project-1", rootPath: "/tmp/project-1", pageSize: 200, supportsRealtime: true }),
        onInvalidate: () => () => {},
      } as never,
      refreshDiscovery: async () => [],
      getDiscoveredProjects: () => [],
      machineDisplayName: "Local Machine",
    })
    const ws = new FakeWebSocket()

    ws.data.subscriptions.set("sub-1", { type: "sidebar" })
    router.handleMessage(
      ws as never,
      JSON.stringify({
        v: 1,
        type: "command",
        id: "ping-1",
        command: { type: "system.ping" },
      })
    )

    expect(ws.sent).toEqual([
      {
        v: PROTOCOL_VERSION,
        type: "ack",
        id: "ping-1",
      },
    ])
  })

  test("acks terminal.input without rebroadcasting terminal snapshots", () => {
    const router = createWsRouter({
      store: { state: createEmptyState() } as never,
      settings: { getSnapshot: () => TEST_SETTINGS_SNAPSHOT } as never,
      agent: { getActiveStatuses: () => new Map() } as never,
      terminals: {
        getSnapshot: () => null,
        onEvent: () => () => {},
        write: () => {},
      } as never,
      fileTree: {
        getSnapshot: () => ({ projectId: "project-1", rootPath: "/tmp/project-1", pageSize: 200, supportsRealtime: true }),
        onInvalidate: () => () => {},
      } as never,
      refreshDiscovery: async () => [],
      getDiscoveredProjects: () => [],
      machineDisplayName: "Local Machine",
    })
    const ws = new FakeWebSocket()

    ws.data.subscriptions.set("sub-terminal", { type: "terminal", terminalId: "terminal-1" })
    router.handleMessage(
      ws as never,
      JSON.stringify({
        v: 1,
        type: "command",
        id: "terminal-input-1",
        command: {
          type: "terminal.input",
          terminalId: "terminal-1",
          data: "ls\r",
        },
      })
    )

    expect(ws.sent).toEqual([
      {
        v: PROTOCOL_VERSION,
        type: "ack",
        id: "terminal-input-1",
      },
    ])
  })

  test("subscribes and unsubscribes file-tree topics and acks directory reads", async () => {
    const fileTree = {
      subscribeCalls: [] as string[],
      unsubscribeCalls: [] as string[],
      subscribe(projectId: string) {
        this.subscribeCalls.push(projectId)
      },
      unsubscribe(projectId: string) {
        this.unsubscribeCalls.push(projectId)
      },
      getSnapshot: (projectId: string) => ({
        projectId,
        rootPath: "/tmp/project-1",
        pageSize: 200,
        supportsRealtime: true as const,
      }),
      readDirectory: async () => ({
        directoryPath: "",
        entries: [],
        nextCursor: null,
        hasMore: false,
      }),
      onInvalidate: () => () => {},
    }

    const router = createWsRouter({
      store: { state: createEmptyState() } as never,
      settings: { getSnapshot: () => TEST_SETTINGS_SNAPSHOT } as never,
      agent: { getActiveStatuses: () => new Map() } as never,
      terminals: {
        getSnapshot: () => null,
        onEvent: () => () => {},
      } as never,
      fileTree: fileTree as never,
      refreshDiscovery: async () => [],
      getDiscoveredProjects: () => [],
      machineDisplayName: "Local Machine",
    })
    const ws = new FakeWebSocket()

    router.handleMessage(
      ws as never,
      JSON.stringify({
        v: 1,
        type: "subscribe",
        id: "tree-sub-1",
        topic: { type: "file-tree", projectId: "project-1" },
      })
    )

    expect(fileTree.subscribeCalls).toEqual(["project-1"])
    expect(ws.sent[0]).toEqual({
      v: PROTOCOL_VERSION,
      type: "snapshot",
      id: "tree-sub-1",
      snapshot: {
        type: "file-tree",
        data: {
          projectId: "project-1",
          rootPath: "/tmp/project-1",
          pageSize: 200,
          supportsRealtime: true,
        },
      },
    })

    router.handleMessage(
      ws as never,
      JSON.stringify({
        v: 1,
        type: "command",
        id: "tree-read-1",
        command: {
          type: "file-tree.readDirectory",
          projectId: "project-1",
          directoryPath: "",
        },
      })
    )

    await Promise.resolve()
    expect(ws.sent[1]).toEqual({
      v: PROTOCOL_VERSION,
      type: "ack",
      id: "tree-read-1",
      result: {
        directoryPath: "",
        entries: [],
        nextCursor: null,
        hasMore: false,
      },
    })

    router.handleMessage(
      ws as never,
      JSON.stringify({
        v: 1,
        type: "unsubscribe",
        id: "tree-sub-1",
      })
    )

    expect(fileTree.unsubscribeCalls).toEqual(["project-1"])
    expect(ws.sent[2]).toEqual({
      v: PROTOCOL_VERSION,
      type: "ack",
      id: "tree-sub-1",
    })
  })

  test("returns a null file-tree snapshot when the project no longer exists", () => {
    const router = createWsRouter({
      store: { state: createEmptyState() } as never,
      settings: { getSnapshot: () => TEST_SETTINGS_SNAPSHOT } as never,
      agent: { getActiveStatuses: () => new Map() } as never,
      terminals: {
        getSnapshot: () => null,
        onEvent: () => () => {},
      } as never,
      fileTree: {
        subscribe: () => {},
        unsubscribe: () => {},
        getSnapshot: () => null,
        readDirectory: async () => ({
          directoryPath: "",
          entries: [],
          nextCursor: null,
          hasMore: false,
        }),
        onInvalidate: () => () => {},
      } as never,
      refreshDiscovery: async () => [],
      getDiscoveredProjects: () => [],
      machineDisplayName: "Local Machine",
    })
    const ws = new FakeWebSocket()

    router.handleMessage(
      ws as never,
      JSON.stringify({
        v: 1,
        type: "subscribe",
        id: "tree-sub-missing",
        topic: { type: "file-tree", projectId: "missing-project" },
      })
    )

    expect(ws.sent[0]).toEqual({
      v: PROTOCOL_VERSION,
      type: "snapshot",
      id: "tree-sub-missing",
      snapshot: {
        type: "file-tree",
        data: null,
      },
    })
  })

  test("resets local app data from settings", async () => {
    const calls = {
      cancelled: [] as string[],
      resetStore: 0,
      resetSettings: 0,
      closedTerminals: 0,
      disposedFileTree: 0,
      refreshedDiscovery: 0,
      clearedSourceData: 0,
    }
    const state = createEmptyState()
    state.chatsById.set("chat-1", {
      id: "chat-1",
      projectId: "project-1",
      title: "Chat",
      createdAt: 1,
      updatedAt: 1,
      provider: "vision",
      planMode: false,
      sessionToken: null,
      lastError: null,
      lastTurnOutcome: null,
    })

    const router = createWsRouter({
      store: {
        state,
        resetAll: async () => {
          calls.resetStore += 1
        },
      } as never,
      settings: {
        getSnapshot: () => TEST_SETTINGS_SNAPSHOT,
        reset: () => {
          calls.resetSettings += 1
        },
      } as never,
      agent: {
        getActiveStatuses: () => new Map(),
        cancel: async (chatId: string) => {
          calls.cancelled.push(chatId)
        },
      } as never,
      terminals: {
        getSnapshot: () => null,
        onEvent: () => () => {},
        closeAll: () => {
          calls.closedTerminals += 1
        },
      } as never,
      fileTree: {
        getSnapshot: () => null,
        onInvalidate: () => () => {},
        dispose: () => {
          calls.disposedFileTree += 1
        },
      } as never,
      refreshDiscovery: async () => {
        calls.refreshedDiscovery += 1
        return []
      },
      getDiscoveredProjects: () => [],
      machineDisplayName: "Local Machine",
      clearCachedSourceData: () => {
        calls.clearedSourceData += 1
      },
    })
    const ws = new FakeWebSocket()

    router.handleMessage(
      ws as never,
      JSON.stringify({
        v: 1,
        type: "command",
        id: "reset-1",
        command: { type: "settings.resetAll" },
      })
    )

    await waitFor(() => calls.resetSettings === 1 && ws.sent.length > 0)

    expect(calls.cancelled).toEqual(["chat-1"])
    expect(calls.closedTerminals).toBe(1)
    expect(calls.disposedFileTree).toBe(1)
    expect(calls.resetStore).toBe(1)
    expect(calls.resetSettings).toBe(1)
    expect(calls.refreshedDiscovery).toBe(1)
    expect(calls.clearedSourceData).toBe(1)
    expect(ws.sent[0]).toEqual({
      v: PROTOCOL_VERSION,
      type: "ack",
      id: "reset-1",
      result: { ok: true },
    })
  })
})

async function waitFor(predicate: () => boolean, timeoutMs = 1_000) {
  const startedAt = Date.now()
  while (!predicate()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new Error("Timed out waiting for condition")
    }
    await new Promise((resolve) => setTimeout(resolve, 10))
  }
}
