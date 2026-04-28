import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import type {
  AppSettingsPatch,
  AppSettingsSnapshot,
  ChatSoundId,
  ChatSoundPreference,
  EditorPreset,
} from "../shared/types"
import { getDataDir } from "../shared/branding"
import { ensureDataDirMigrated } from "./data-dir"

interface StoredSettings {
  visionApiKey?: unknown
  browserSettingsMigrated?: unknown
  theme?: unknown
  chatSoundPreference?: unknown
  chatSoundId?: unknown
  terminal?: {
    scrollbackLines?: unknown
    minColumnWidth?: unknown
  }
  editor?: {
    preset?: unknown
    commandTemplate?: unknown
  }
}

const DEFAULT_TERMINAL_SCROLLBACK = 1_000
const MIN_TERMINAL_SCROLLBACK = 500
const MAX_TERMINAL_SCROLLBACK = 5_000
const DEFAULT_TERMINAL_MIN_COLUMN_WIDTH = 450
const MIN_TERMINAL_MIN_COLUMN_WIDTH = 250
const MAX_TERMINAL_MIN_COLUMN_WIDTH = 900
const DEFAULT_EDITOR_PRESET: EditorPreset = "cursor"
const DEFAULT_CHAT_SOUND_PREFERENCE: ChatSoundPreference = "always"
const DEFAULT_CHAT_SOUND_ID: ChatSoundId = "funk"

function settingsFilePath(homeDir = homedir()) {
  return path.join(getDataDir(homeDir), "settings.json")
}

function formatDisplayPath(filePath: string, homeDir = homedir()) {
  if (filePath === homeDir) return "~"
  if (filePath.startsWith(`${homeDir}${path.sep}`)) {
    return `~${filePath.slice(homeDir.length)}`
  }
  return filePath
}

function visionContinualLearningWeightsPath(homeDir = homedir()) {
  return path.join(getDataDir(homeDir), "vision-continual-learning-weights.txt")
}

function getDefaultEditorCommandTemplate(preset: EditorPreset) {
  switch (preset) {
    case "vscode":
      return "code {path}"
    case "xcode":
      return "xed {path}"
    case "windsurf":
      return "windsurf {path}"
    case "custom":
    case "cursor":
    default:
      return "cursor {path}"
  }
}

function clampNumber(value: unknown, fallback: number, min: number, max: number) {
  const parsed = typeof value === "number" ? value : Number(value)
  if (!Number.isFinite(parsed)) return fallback
  return Math.min(max, Math.max(min, Math.round(parsed)))
}

function normalizeTheme(value: unknown): AppSettingsSnapshot["theme"] {
  return value === "light" || value === "dark" || value === "system" ? value : "system"
}

function normalizeChatSoundPreference(value: unknown): ChatSoundPreference {
  return value === "never" || value === "unfocused" || value === "always"
    ? value
    : DEFAULT_CHAT_SOUND_PREFERENCE
}

function normalizeChatSoundId(value: unknown): ChatSoundId {
  switch (value) {
    case "blow":
    case "bottle":
    case "frog":
    case "funk":
    case "glass":
    case "ping":
    case "pop":
    case "purr":
    case "tink":
      return value
    default:
      return DEFAULT_CHAT_SOUND_ID
  }
}

function normalizeEditorPreset(value: unknown): EditorPreset {
  switch (value) {
    case "vscode":
    case "xcode":
    case "windsurf":
    case "custom":
    case "cursor":
      return value
    default:
      return DEFAULT_EDITOR_PRESET
  }
}

function normalizeEditorCommandTemplate(value: unknown, preset: EditorPreset) {
  const trimmed = typeof value === "string" ? value.trim() : ""
  return trimmed || getDefaultEditorCommandTemplate(preset)
}

function createDefaultSettingsSnapshot(homeDir = homedir()): AppSettingsSnapshot {
  return {
    visionApiKey: "",
    visionContinualLearningWeightsPath: visionContinualLearningWeightsPath(homeDir),
    browserSettingsMigrated: false,
    theme: "system",
    chatSoundPreference: DEFAULT_CHAT_SOUND_PREFERENCE,
    chatSoundId: DEFAULT_CHAT_SOUND_ID,
    terminal: {
      scrollbackLines: DEFAULT_TERMINAL_SCROLLBACK,
      minColumnWidth: DEFAULT_TERMINAL_MIN_COLUMN_WIDTH,
    },
    editor: {
      preset: DEFAULT_EDITOR_PRESET,
      commandTemplate: getDefaultEditorCommandTemplate(DEFAULT_EDITOR_PRESET),
    },
    warning: null,
    filePathDisplay: formatDisplayPath(settingsFilePath(homeDir), homeDir),
  }
}

function normalizeSettings(value: unknown, homeDir = homedir()): AppSettingsSnapshot {
  const record = value && typeof value === "object" ? value as StoredSettings : {}
  const editorPreset = normalizeEditorPreset(record.editor?.preset)

  return {
    ...createDefaultSettingsSnapshot(homeDir),
    visionApiKey: typeof record.visionApiKey === "string" ? record.visionApiKey.trim() : "",
    browserSettingsMigrated: record.browserSettingsMigrated === true,
    theme: normalizeTheme(record.theme),
    chatSoundPreference: normalizeChatSoundPreference(record.chatSoundPreference),
    chatSoundId: normalizeChatSoundId(record.chatSoundId),
    terminal: {
      scrollbackLines: clampNumber(record.terminal?.scrollbackLines, DEFAULT_TERMINAL_SCROLLBACK, MIN_TERMINAL_SCROLLBACK, MAX_TERMINAL_SCROLLBACK),
      minColumnWidth: clampNumber(record.terminal?.minColumnWidth, DEFAULT_TERMINAL_MIN_COLUMN_WIDTH, MIN_TERMINAL_MIN_COLUMN_WIDTH, MAX_TERMINAL_MIN_COLUMN_WIDTH),
    },
    editor: {
      preset: editorPreset,
      commandTemplate: normalizeEditorCommandTemplate(record.editor?.commandTemplate, editorPreset),
    },
  }
}

function toStoredSettings(settings: AppSettingsSnapshot): StoredSettings {
  return {
    visionApiKey: settings.visionApiKey,
    browserSettingsMigrated: settings.browserSettingsMigrated,
    theme: settings.theme,
    chatSoundPreference: settings.chatSoundPreference,
    chatSoundId: settings.chatSoundId,
    terminal: settings.terminal,
    editor: settings.editor,
  }
}

export class AppSettingsStore {
  private homeDir = homedir()
  private settings: AppSettingsSnapshot = createDefaultSettingsSnapshot(this.homeDir)
  private readonly listeners = new Set<() => void>()

  private emitChange() {
    for (const listener of this.listeners) {
      listener()
    }
  }

  private ensureWeightsFile(homeDir = this.homeDir) {
    ensureDataDirMigrated(homeDir)
    const filePath = visionContinualLearningWeightsPath(homeDir)
    mkdirSync(path.dirname(filePath), { recursive: true })
    if (!existsSync(filePath)) {
      writeFileSync(filePath, "", "utf8")
    }
    return filePath
  }

  private persistSettings(homeDir = this.homeDir) {
    ensureDataDirMigrated(homeDir)
    const filePath = settingsFilePath(homeDir)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify(toStoredSettings(this.settings), null, 2))
  }

  initialize(homeDir = this.homeDir) {
    this.homeDir = homeDir
    ensureDataDirMigrated(homeDir)
    const filePath = settingsFilePath(homeDir)
    mkdirSync(path.dirname(filePath), { recursive: true })
    this.ensureWeightsFile(homeDir)

    try {
      this.settings = normalizeSettings(JSON.parse(readFileSync(filePath, "utf8")), homeDir)
    } catch {
      this.settings = createDefaultSettingsSnapshot(homeDir)
    }
  }

  getSnapshot(): AppSettingsSnapshot {
    this.ensureWeightsFile(this.homeDir)
    return {
      ...this.settings,
      terminal: { ...this.settings.terminal },
      editor: { ...this.settings.editor },
      visionContinualLearningWeightsPath: visionContinualLearningWeightsPath(this.homeDir),
      filePathDisplay: formatDisplayPath(settingsFilePath(this.homeDir), this.homeDir),
      warning: null,
    }
  }

  onChange(listener: () => void) {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  updateVisionApiKey(visionApiKey: string, homeDir = this.homeDir) {
    this.homeDir = homeDir
    this.settings = normalizeSettings({
      ...toStoredSettings(this.getSnapshot()),
      visionApiKey,
    }, this.homeDir)
    this.persistSettings(homeDir)
    this.emitChange()
  }

  writePatch(patch: AppSettingsPatch, homeDir = this.homeDir) {
    this.homeDir = homeDir
    this.settings = normalizeSettings({
      ...toStoredSettings(this.getSnapshot()),
      ...patch,
      terminal: {
        ...this.settings.terminal,
        ...patch.terminal,
      },
      editor: {
        ...this.settings.editor,
        ...patch.editor,
      },
    }, this.homeDir)
    this.persistSettings(homeDir)
    this.emitChange()
    return this.getSnapshot()
  }

  readVisionContinualLearningWeights(homeDir = this.homeDir) {
    this.homeDir = homeDir
    const filePath = this.ensureWeightsFile(homeDir)
    try {
      return readFileSync(filePath, "utf8")
    } catch {
      return ""
    }
  }

  updateVisionContinualLearningWeights(weights: string, homeDir = this.homeDir) {
    this.homeDir = homeDir
    const filePath = this.ensureWeightsFile(homeDir)
    writeFileSync(filePath, weights, "utf8")
  }

  reset(homeDir = this.homeDir) {
    this.homeDir = homeDir
    this.settings = createDefaultSettingsSnapshot(homeDir)
    ensureDataDirMigrated(homeDir)
    rmSync(settingsFilePath(homeDir), { force: true })
    rmSync(visionContinualLearningWeightsPath(homeDir), { force: true })
    this.emitChange()
  }
}
