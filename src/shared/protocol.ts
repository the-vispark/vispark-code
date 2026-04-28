import type {
  AgentProvider,
  AppSettingsPatch,
  AppSettingsSnapshot,
  ChatAttachment,
  ChatHistoryPage,
  ChatSnapshot,
  FileTreeDirectoryPage,
  FileTreeSnapshot,
  DiffCommitMode,
  EditorPreset,
  KeybindingsSnapshot,
  LocalProjectsSnapshot,
  ModelOptions,
  SidebarData,
  UpdateSnapshot,
} from "./types"

export type { EditorPreset } from "./types"

export interface EditorOpenSettings {
  preset: EditorPreset
  commandTemplate: string
}

export type SubscriptionTopic =
  | { type: "sidebar" }
  | { type: "local-projects" }
  | { type: "settings" }
  | { type: "app-settings" }
  | { type: "file-tree"; projectId: string }
  | { type: "update" }
  | { type: "keybindings" }
  | { type: "chat"; chatId: string; recentLimit?: number }
  | { type: "terminal"; terminalId: string }

export interface TerminalSnapshot {
  terminalId: string
  title: string
  cwd: string
  shell: string
  cols: number
  rows: number
  scrollback: number
  serializedState: string
  status: "running" | "exited"
  exitCode: number | null
  signal?: number
}

export type TerminalEvent =
  | { type: "terminal.output"; terminalId: string; data: string }
  | { type: "terminal.exit"; terminalId: string; exitCode: number; signal?: number }

export type FileTreeEvent = {
  type: "file-tree.invalidate"
  projectId: string
  directoryPaths: string[]
}

export type ClientCommand =
  | { type: "project.open"; localPath: string }
  | { type: "project.create"; localPath: string; title: string }
  | { type: "project.remove"; projectId: string }
  | { type: "sidebar.reorderProjectGroups"; projectIds: string[] }
  | { type: "system.ping" }
  | { type: "settings.get" }
  | { type: "settings.updateVision"; visionApiKey: string }
  | { type: "settings.readAppSettings" }
  | { type: "settings.writeAppSettingsPatch"; patch: AppSettingsPatch }
  | { type: "settings.resetAll" }
  | { type: "update.check"; force?: boolean }
  | { type: "update.install" }
  | { type: "settings.readKeybindings" }
  | { type: "settings.writeKeybindings"; bindings: KeybindingsSnapshot["bindings"] }
  | { type: "system.pickDirectory"; title?: string }
  | {
      type: "system.openExternal"
      localPath: string
      action: "open_finder" | "open_terminal" | "open_editor" | "open_preview" | "open_default"
      line?: number
      column?: number
      editor?: EditorOpenSettings
    }
  | { type: "chat.create"; projectId: string }
  | { type: "chat.fork"; chatId: string }
  | { type: "chat.rename"; chatId: string; title: string }
  | { type: "chat.archive"; chatId: string }
  | { type: "chat.unarchive"; chatId: string }
  | { type: "chat.delete"; chatId: string }
  | { type: "chat.setDraftProtection"; chatIds: string[] }
  | { type: "chat.markRead"; chatId: string }
  | {
      type: "chat.send"
      chatId?: string
      projectId?: string
      clientTraceId?: string
      provider?: AgentProvider
      content: string
      attachments?: ChatAttachment[]
      model?: string
      modelOptions?: ModelOptions
      effort?: string
      planMode?: boolean
    }
  | { type: "chat.refreshDiffs"; chatId: string }
  | { type: "chat.initGit"; chatId: string }
  | { type: "chat.getGitHubPublishInfo"; chatId: string }
  | { type: "chat.checkGitHubRepoAvailability"; chatId: string; owner: string; name: string }
  | {
      type: "chat.publishToGitHub"
      chatId: string
      owner: string
      name: string
      visibility: "public" | "private"
      description?: string
    }
  | { type: "chat.listBranches"; chatId: string }
  | { type: "chat.syncBranch"; chatId: string; action: "fetch" | "pull" | "push" | "publish" }
  | {
      type: "chat.checkoutBranch"
      chatId: string
      branch:
      | { kind: "local"; name: string }
      | { kind: "remote"; name: string; remoteRef: string }
      | {
          kind: "pull_request"
          name: string
          prNumber: number
          headRefName: string
          headRepoCloneUrl?: string
          isCrossRepository?: boolean
          remoteRef?: string
        }
      bringChanges?: boolean
    }
  | { type: "chat.createBranch"; chatId: string; name: string; baseBranchName?: string }
  | { type: "chat.generateCommitMessage"; chatId: string; paths: string[] }
  | { type: "chat.commitDiffs"; chatId: string; paths: string[]; summary: string; description?: string; mode: DiffCommitMode }
  | { type: "chat.discardDiffFile"; chatId: string; path: string }
  | { type: "chat.ignoreDiffFile"; chatId: string; path: string }
  | { type: "chat.cancel"; chatId: string }
  | { type: "chat.stopDraining"; chatId: string }
  | { type: "chat.loadHistory"; chatId: string; beforeCursor: string; limit: number }
  | { type: "chat.respondTool"; chatId: string; toolUseId: string; result: unknown }
  | {
      type: "message.enqueue"
      chatId: string
      content: string
      attachments?: ChatAttachment[]
      provider?: AgentProvider
      model?: string
      modelOptions?: ModelOptions
      planMode?: boolean
    }
  | {
      type: "message.steer"
      chatId: string
      queuedMessageId: string
    }
  | {
      type: "message.dequeue"
      chatId: string
      queuedMessageId: string
    }
  | { type: "terminal.create"; projectId: string; terminalId: string; cols: number; rows: number; scrollback: number }
  | { type: "terminal.input"; terminalId: string; data: string }
  | { type: "terminal.resize"; terminalId: string; cols: number; rows: number }
  | { type: "terminal.close"; terminalId: string }
  | {
      type: "file-tree.readDirectory"
      projectId: string
      directoryPath: string
      cursor?: string
      limit?: number
    }

export type ClientEnvelope =
  | { v: 1; type: "subscribe"; id: string; topic: SubscriptionTopic }
  | { v: 1; type: "unsubscribe"; id: string }
  | { v: 1; type: "command"; id: string; command: ClientCommand }

export type ServerSnapshot =
  | { type: "sidebar"; data: SidebarData }
  | { type: "local-projects"; data: LocalProjectsSnapshot }
  | { type: "settings"; data: AppSettingsSnapshot }
  | { type: "app-settings"; data: AppSettingsSnapshot }
  | { type: "file-tree"; data: FileTreeSnapshot | null }
  | { type: "update"; data: UpdateSnapshot }
  | { type: "keybindings"; data: KeybindingsSnapshot }
  | { type: "chat"; data: ChatSnapshot | null }
  | { type: "terminal"; data: TerminalSnapshot | null }

export type ServerEnvelope =
  | { v: 1; type: "snapshot"; id: string; snapshot: ServerSnapshot }
  | { v: 1; type: "event"; id: string; event: TerminalEvent | FileTreeEvent }
  | { v: 1; type: "ack"; id: string; result?: unknown | ChatHistoryPage }
  | { v: 1; type: "error"; id?: string; message: string }

export type FileTreeReadDirectoryResult = FileTreeDirectoryPage
export type OpenExternalAction = Extract<ClientCommand, { type: "system.openExternal" }>["action"]

export function isClientEnvelope(value: unknown): value is ClientEnvelope {
  if (!value || typeof value !== "object") return false
  const candidate = value as Partial<ClientEnvelope>
  return candidate.v === 1 && typeof candidate.type === "string"
}
