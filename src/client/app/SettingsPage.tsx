import { useEffect, useState, type KeyboardEvent, type ReactNode } from "react"
import {
  Info,
  Loader2,
  Monitor,
  Moon,
  Sun,
} from "lucide-react"
import { useOutletContext } from "react-router-dom"
import type { EditorPreset } from "../../shared/protocol"
import type { AppSettingsSnapshot } from "../../shared/types"
import { SegmentedControl } from "../components/ui/segmented-control"
import { useTheme, type ThemePreference } from "../hooks/useTheme"
import {
  DEFAULT_TERMINAL_MIN_COLUMN_WIDTH,
  DEFAULT_TERMINAL_SCROLLBACK,
  MAX_TERMINAL_MIN_COLUMN_WIDTH,
  MAX_TERMINAL_SCROLLBACK,
  MIN_TERMINAL_MIN_COLUMN_WIDTH,
  MIN_TERMINAL_SCROLLBACK,
  useTerminalPreferencesStore,
} from "../stores/terminalPreferencesStore"
import { Button } from "../components/ui/button"
import { useAppDialog } from "../components/ui/app-dialog"
import { useChatPreferencesStore } from "../stores/chatPreferencesStore"
import type { VisparkCodeState } from "./useVisparkCodeState"

const CLIENT_RESET_STORAGE_KEYS = [
  "terminal-preferences",
  "terminal-layouts",
  "right-sidebar-layouts",
  "chat-preferences",
  "chat-input-drafts",
  "project-group-order",
  "lever-theme",
] as const

const themeOptions = [
  { value: "light" as ThemePreference, label: "Light", icon: Sun },
  { value: "dark" as ThemePreference, label: "Dark", icon: Moon },
  { value: "system" as ThemePreference, label: "System", icon: Monitor },
]

const editorOptions: { value: EditorPreset; label: string }[] = [
  { value: "cursor", label: "Cursor" },
  { value: "vscode", label: "VS Code" },
  { value: "windsurf", label: "Windsurf" },
  { value: "custom", label: "Custom" },
]

const continualLearningOptions = [
  { value: "on" as const, label: "On" },
  { value: "off" as const, label: "Off" },
]

const FALLBACK_VISION_WEIGHTS_PATH = "~/.vispark-code/data/vision-continual-learning-weights.txt"

function SettingsRow({
  title,
  description,
  children,
  bordered = true,
  alignStart = false,
}: {
  title: string
  description: ReactNode
  children: ReactNode
  bordered?: boolean
  alignStart?: boolean
}) {
  return (
    <div className={bordered ? "border-t border-border" : undefined}>
      <div className={`flex flex-col gap-4 py-5 sm:flex-row sm:justify-between sm:gap-8 ${alignStart ? "sm:items-start" : "sm:items-center"}`}>
        <div className="min-w-0 max-w-xl">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="mt-1 text-[13px] text-muted-foreground">{description}</div>
        </div>
        <div className="flex shrink-0 items-center sm:justify-end">{children}</div>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const state = useOutletContext<VisparkCodeState>()
  const dialog = useAppDialog()
  const { theme, setTheme } = useTheme()
  const isConnecting = state.connectionStatus === "connecting" || !state.localProjectsReady
  const scrollbackLines = useTerminalPreferencesStore((store) => store.scrollbackLines)
  const minColumnWidth = useTerminalPreferencesStore((store) => store.minColumnWidth)
  const editorPreset = useTerminalPreferencesStore((store) => store.editorPreset)
  const editorCommandTemplate = useTerminalPreferencesStore((store) => store.editorCommandTemplate)
  const setScrollbackLines = useTerminalPreferencesStore((store) => store.setScrollbackLines)
  const setMinColumnWidth = useTerminalPreferencesStore((store) => store.setMinColumnWidth)
  const setEditorPreset = useTerminalPreferencesStore((store) => store.setEditorPreset)
  const setEditorCommandTemplate = useTerminalPreferencesStore((store) => store.setEditorCommandTemplate)
  const visionContinualLearning = useChatPreferencesStore((store) => store.preferences.vision.modelOptions.continualLearning)
  const setChatModelOptions = useChatPreferencesStore((store) => store.setModelOptions)
  const [scrollbackDraft, setScrollbackDraft] = useState(String(scrollbackLines))
  const [minColumnWidthDraft, setMinColumnWidthDraft] = useState(String(minColumnWidth))
  const [editorCommandDraft, setEditorCommandDraft] = useState(editorCommandTemplate)
  const [visionApiKeyDraft, setVisionApiKeyDraft] = useState("")
  const [visionWeightsPath, setVisionWeightsPath] = useState("")
  const [isEditingVisionApiKey, setIsEditingVisionApiKey] = useState(false)
  const [visionApiKeyStatus, setVisionApiKeyStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [visionApiKeyMessage, setVisionApiKeyMessage] = useState<string | null>(null)
  const [resetStatus, setResetStatus] = useState<"idle" | "resetting" | "error">("idle")
  const [resetMessage, setResetMessage] = useState<string | null>(null)

  useEffect(() => {
    setScrollbackDraft(String(scrollbackLines))
  }, [scrollbackLines])

  useEffect(() => {
    setMinColumnWidthDraft(String(minColumnWidth))
  }, [minColumnWidth])

  useEffect(() => {
    setEditorCommandDraft(editorCommandTemplate)
  }, [editorCommandTemplate])

  useEffect(() => {
    if (isConnecting) return

    let cancelled = false

    void state.socket.command<AppSettingsSnapshot>({ type: "settings.get" })
      .then((snapshot) => {
        if (cancelled) return
        setVisionApiKeyDraft(snapshot.visionApiKey)
        setVisionWeightsPath(snapshot.visionContinualLearningWeightsPath)
        setVisionApiKeyStatus("idle")
        setVisionApiKeyMessage(null)
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setVisionApiKeyStatus("error")
        setVisionApiKeyMessage(error instanceof Error ? error.message : "Unable to load Vision settings.")
      })

    return () => {
      cancelled = true
    }
  }, [isConnecting, state.socket])

  function commitScrollback() {
    const nextValue = Number(scrollbackDraft)
    if (!Number.isFinite(nextValue)) {
      setScrollbackDraft(String(scrollbackLines))
      return
    }
    setScrollbackLines(nextValue)
  }

  function commitMinColumnWidth() {
    const nextValue = Number(minColumnWidthDraft)
    if (!Number.isFinite(nextValue)) {
      setMinColumnWidthDraft(String(minColumnWidth))
      return
    }
    setMinColumnWidth(nextValue)
  }

  function handleNumberInputKeyDown(event: KeyboardEvent<HTMLInputElement>, commit: () => void) {
    if (event.key !== "Enter") return
    commit()
    event.currentTarget.blur()
  }

  function handleTextInputKeyDown(event: KeyboardEvent<HTMLInputElement>, commit: () => void) {
    if (event.key !== "Enter") return
    commit()
    event.currentTarget.blur()
  }

  function commitEditorCommand() {
    setEditorCommandTemplate(editorCommandDraft)
  }

  async function saveVisionApiKey() {
    try {
      setVisionApiKeyStatus("saving")
      setVisionApiKeyMessage(null)
      const snapshot = await state.socket.command<AppSettingsSnapshot>({
        type: "settings.updateVision",
        visionApiKey: visionApiKeyDraft,
      })
      setVisionApiKeyDraft(snapshot.visionApiKey)
      setVisionWeightsPath(snapshot.visionContinualLearningWeightsPath)
      setIsEditingVisionApiKey(false)
      setVisionApiKeyStatus("saved")
      setVisionApiKeyMessage("Saved locally for the Vision proxy.")
    } catch (error) {
      setVisionApiKeyStatus("error")
      setVisionApiKeyMessage(error instanceof Error ? error.message : "Unable to save Vision API key.")
    }
  }

  async function resetVisparkCode() {
    const confirmed = await dialog.confirm({
      title: "Reset Vispark Code",
      description: "This clears local chats, settings, cached source mirrors, and browser preferences. Your actual project files stay untouched.",
      confirmLabel: "Reset Everything",
      confirmVariant: "destructive",
    })
    if (!confirmed) return

    try {
      setResetStatus("resetting")
      setResetMessage(null)
      await state.socket.command({ type: "settings.resetAll" })
      for (const key of CLIENT_RESET_STORAGE_KEYS) {
        window.localStorage.removeItem(key)
      }
      window.location.replace("/")
    } catch (error) {
      setResetStatus("error")
      setResetMessage(error instanceof Error ? error.message : "Unable to reset Vispark Code.")
    }
  }

  const customEditorPreview = editorCommandDraft
    .replaceAll("{path}", "/Users/jake/Projects/vispark-code/src/client/app/App.tsx")
    .replaceAll("{line}", "12")
    .replaceAll("{column}", "1")
  const effectiveVisionWeightsPath = visionWeightsPath || FALLBACK_VISION_WEIGHTS_PATH

  return (
    <div className="relative flex h-full flex-1 min-w-0 bg-background overflow-y-auto">
      <div className="w-full px-4 pt-8 pb-10 sm:px-6 sm:pt-16">
        {isConnecting ? (
          <div className="mx-auto max-w-4xl">
            <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading machine settings…</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="mx-auto max-w-4xl">
            <div className="pb-8">
              <div className="text-3xl font-bold tracking-tight text-foreground">
                Settings
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Manage appearance, editor behavior, and embedded terminal defaults.
              </div>
            </div>

            <div className="border-b border-border">
              <SettingsRow
                title="Theme"
                description="Choose between light, dark, or system appearance"
                bordered={false}
              >
                <SegmentedControl
                  value={theme}
                  onValueChange={setTheme}
                  options={themeOptions}
                  size="sm"
                />
              </SettingsRow>

                  <SettingsRow
                    title="Vispark Lab API Key"
                    description={
                      <>
                        Get your Vispark Lab key from:{" "}
                        <a
                          href="https://lab.vispark.in/profile#api"
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary hover:underline"
                        >
                          https://lab.vispark.in/profile#api
                        </a>
                      </>
                    }
                    alignStart
                  >
                    <div className="flex min-w-0 w-full flex-col items-stretch gap-2 sm:max-w-[420px] sm:flex-1">
                      <div className="flex items-center gap-2">
                        {isEditingVisionApiKey || !visionApiKeyDraft ? (
                          <>
                            <input
                              type="password"
                              value={visionApiKeyDraft}
                              placeholder="vl_your_api_key"
                              autoComplete="off"
                              spellCheck={false}
                              autoFocus={isEditingVisionApiKey}
                              onChange={(event) => {
                                setVisionApiKeyDraft(event.target.value)
                                setVisionApiKeyStatus("idle")
                                setVisionApiKeyMessage(null)
                              }}
                              onKeyDown={(event) =>
                                handleTextInputKeyDown(event, () => {
                                  void saveVisionApiKey()
                                })
                              }
                              className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none"
                            />
                            <button
                              type="button"
                              onClick={() => void saveVisionApiKey()}
                              disabled={visionApiKeyStatus === "saving"}
                              className="shrink-0 rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted disabled:opacity-60"
                            >
                              {visionApiKeyStatus === "saving" ? "Saving..." : "Save"}
                            </button>
                            {isEditingVisionApiKey && visionApiKeyDraft && (
                              <button
                                type="button"
                                onClick={() => {
                                  setIsEditingVisionApiKey(false)
                                  setVisionApiKeyStatus("idle")
                                  setVisionApiKeyMessage(null)
                                }}
                                className="shrink-0 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
                              >
                                Cancel
                              </button>
                            )}
                          </>
                        ) : (
                          <div className="flex w-full items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2">
                            <span className="font-mono text-sm text-foreground">
                              vl_****{visionApiKeyDraft.slice(-4)}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setIsEditingVisionApiKey(true)
                                setVisionApiKeyDraft("")
                              }}
                              className="text-sm font-medium text-primary hover:underline"
                            >
                              Edit
                            </button>
                          </div>
                        )}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {visionApiKeyMessage ??
                          "Add your Vispark key once, then every Vision chat uses it automatically."}
                      </div>
                    </div>
                  </SettingsRow>

                  <SettingsRow
                    title="Continual Learning"
                    description={
                      <>
                        Let Vision learn your coding style and preferences over time.
                      </>
                    }
                    alignStart
                  >
                    <div className="flex min-w-0 w-full flex-col items-stretch gap-2 sm:max-w-[420px] sm:flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            void state.handleOpenLocalLink({
                              path: effectiveVisionWeightsPath,
                              line: 1,
                              column: 1,
                            })
                          }}
                        >
                          Open weights file
                        </Button>
                        <SegmentedControl
                          value={visionContinualLearning ? "on" : "off"}
                          onValueChange={(value) => {
                            setChatModelOptions("vision", { continualLearning: value === "on" })
                          }}
                          options={continualLearningOptions}
                          size="sm"
                        />
                      </div>
                    </div>
                  </SettingsRow>

                  <SettingsRow
                    title="Default Editor"
                    description="Used by the navbar code button and local file links in chat"
                    alignStart
                  >
                    <select
                      value={editorPreset}
                      onChange={(event) => setEditorPreset(event.target.value as EditorPreset)}
                      className="min-w-[180px] rounded-lg border border-border bg-background px-3 py-2 pr-12 text-sm text-foreground outline-none"
                    >
                      {editorOptions.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </SettingsRow>

                  {editorPreset === "custom" ? (
                    <div className="border-t border-border">
                      <div className="flex flex-col gap-4 py-5 sm:flex-row sm:justify-between sm:gap-8 sm:pl-6">
                        <div className="min-w-0 max-w-xl">
                          <div className="text-sm font-medium text-foreground">Command Template</div>
                          <div className="mt-1 text-[13px] text-muted-foreground">
                            Include {"{path}"} and optionally {"{line}"} and {"{column}"} in your command.
                          </div>
                        </div>
                        <div className="flex min-w-0 w-full flex-col items-stretch gap-2 sm:max-w-[420px] sm:flex-1">
                          <input
                            type="text"
                            value={editorCommandDraft}
                            onChange={(event) => setEditorCommandDraft(event.target.value)}
                            onBlur={commitEditorCommand}
                            onKeyDown={(event) => handleTextInputKeyDown(event, commitEditorCommand)}
                            className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none"
                          />
                          <div className="text-xs text-muted-foreground">
                            Preview: <span className="font-mono">{customEditorPreview}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  <SettingsRow
                    title="Terminal Scrollback"
                    description="Lines retained for embedded terminal history"
                  >
                    <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
                      <input
                        type="number"
                        min={MIN_TERMINAL_SCROLLBACK}
                        max={MAX_TERMINAL_SCROLLBACK}
                        step={100}
                        value={scrollbackDraft}
                        onChange={(event) => setScrollbackDraft(event.target.value)}
                        onBlur={commitScrollback}
                        onKeyDown={(event) => handleNumberInputKeyDown(event, commitScrollback)}
                        className="hide-number-steppers w-28 rounded-lg border border-border bg-background px-3 py-2 text-right font-mono text-sm text-foreground outline-none"
                      />
                      <div className="text-left text-xs text-muted-foreground sm:text-right">
                        {MIN_TERMINAL_SCROLLBACK}-{MAX_TERMINAL_SCROLLBACK} lines
                        {scrollbackLines === DEFAULT_TERMINAL_SCROLLBACK ? " (default)" : ""}
                      </div>
                    </div>
                  </SettingsRow>

                  <SettingsRow
                    title="Terminal Min Column Width"
                    description="Minimum width for each terminal pane"
                  >
                    <div className="flex min-w-0 flex-col items-start gap-2 sm:items-end">
                      <input
                        type="number"
                        min={MIN_TERMINAL_MIN_COLUMN_WIDTH}
                        max={MAX_TERMINAL_MIN_COLUMN_WIDTH}
                        step={10}
                        value={minColumnWidthDraft}
                        onChange={(event) => setMinColumnWidthDraft(event.target.value)}
                        onBlur={commitMinColumnWidth}
                        onKeyDown={(event) => handleNumberInputKeyDown(event, commitMinColumnWidth)}
                        className="hide-number-steppers w-28 rounded-lg border border-border bg-background px-3 py-2 text-right font-mono text-sm text-foreground outline-none"
                      />
                      <div className="text-left text-xs text-muted-foreground sm:text-right">
                        {MIN_TERMINAL_MIN_COLUMN_WIDTH}-{MAX_TERMINAL_MIN_COLUMN_WIDTH} px
                        {minColumnWidth === DEFAULT_TERMINAL_MIN_COLUMN_WIDTH ? " (default)" : ""}
                      </div>
                    </div>
                  </SettingsRow>

                  <SettingsRow
                    title="Reset Vispark Code"
                    description="Return the app to a fresh-install state. This removes local chats, saved settings, cached mirrors, and browser UI preferences, but does not touch your code projects."
                    alignStart
                  >
                    <div className="flex min-w-0 w-full sm:max-w-[420px] sm:flex-1 flex-col items-stretch gap-2">
                      <Button
                        type="button"
                        variant="destructive"
                        className="justify-center"
                        disabled={resetStatus === "resetting"}
                        onClick={() => void resetVisparkCode()}
                      >
                        {resetStatus === "resetting" ? "Resetting..." : "Reset Everything"}
                      </Button>
                      <div className="text-xs text-muted-foreground">
                        {resetMessage ?? "Use this if you want Vispark Code to start over from scratch on this machine."}
                      </div>
                    </div>
                  </SettingsRow>
                </div>
              </div>
            )}

            {state.commandError ? (
              <div className="mx-auto mt-4 flex max-w-4xl items-start gap-3 rounded-2xl border border-destructive/20 bg-destructive/5 px-4 py-3 text-sm text-destructive">
                <Info className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{state.commandError}</span>
              </div>
            ) : null}
      </div>
    </div>
  )
}
