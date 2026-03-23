import { useEffect, useMemo, useState, type KeyboardEvent, type ReactNode } from "react"
import {
  BookText,
  ChevronRight,
  Command,
  Info,
  Loader2,
  Monitor,
  Moon,
  MessageSquareQuote,
  Settings2,
  Sun,
} from "lucide-react"
import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { useNavigate, useOutletContext, useParams } from "react-router-dom"
import { getKeybindingsFilePathDisplay } from "../../shared/branding"
import {
  type AppSettingsSnapshot,
  DEFAULT_KEYBINDINGS,
  type KeybindingAction,
  type UpdateSnapshot,
} from "../../shared/types"
import { markdownComponents } from "../components/messages/shared"
import { buttonVariants, Button } from "../components/ui/button"
import type { EditorPreset } from "../../shared/protocol"
import { SegmentedControl } from "../components/ui/segmented-control"
import { useAppDialog } from "../components/ui/app-dialog"
import { useTheme, type ThemePreference } from "../hooks/useTheme"
import { KEYBINDING_ACTION_LABELS, formatKeybindingInput, getResolvedKeybindings, parseKeybindingInput } from "../lib/keybindings"
import { cn } from "../lib/utils"
import {
  DEFAULT_TERMINAL_MIN_COLUMN_WIDTH,
  DEFAULT_TERMINAL_SCROLLBACK,
  MAX_TERMINAL_MIN_COLUMN_WIDTH,
  MAX_TERMINAL_SCROLLBACK,
  MIN_TERMINAL_MIN_COLUMN_WIDTH,
  MIN_TERMINAL_SCROLLBACK,
  useTerminalPreferencesStore,
} from "../stores/terminalPreferencesStore"
import { useChatPreferencesStore } from "../stores/chatPreferencesStore"
import type { VisparkCodeState } from "./useVisparkCodeState"

const sidebarItems = [
  {
    id: "general",
    label: "General",
    icon: Settings2,
    subtitle: "Manage appearance, editor behavior, and embedded terminal defaults.",
  },
  {
    id: "providers",
    label: "Providers",
    icon: MessageSquareQuote,
    subtitle: "Manage Vision model defaults, continual learning, and plan mode.",
  },
  {
    id: "keybindings",
    label: "Keybindings",
    icon: Command,
    subtitle: "Edit global app shortcuts stored in the active keybindings file.",
  },
  // always last
  {
    id: "changelog",
    label: "Changelog",
    icon: BookText,
    subtitle: "Release notes pulled from the public GitHub releases feed.",
  },
] as const
type SidebarItem = (typeof sidebarItems)[number]
type SidebarPageId = SidebarItem["id"]

export function resolveSettingsSectionId(sectionId: string | undefined): SidebarPageId | null {
  if (!sectionId) return null
  return sidebarItems.some((item) => item.id === sectionId) ? (sectionId as SidebarPageId) : null
}

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

const CLIENT_RESET_STORAGE_KEYS = [
  "terminal-preferences",
  "terminal-layouts",
  "right-sidebar-layouts",
  "vispark-chat-preferences",
  "chat-input-drafts",
  "project-group-order",
  "lever-theme",
] as const

const continualLearningOptions = [
  { value: "on" as const, label: "On" },
  { value: "off" as const, label: "Off" },
]

const FALLBACK_VISION_WEIGHTS_PATH = "~/.vispark-code/data/vision-continual-learning-weights.txt"

const GITHUB_RELEASES_URL = "https://api.github.com/repos/the-vispark/vispark-code/releases"
const CHANGELOG_CACHE_TTL_MS = 5 * 60 * 1000

type GithubRelease = {
  id: number
  name: string | null
  tag_name: string
  html_url: string
  published_at: string | null
  body: string | null
  prerelease: boolean
  draft: boolean
}

type ChangelogStatus = "idle" | "loading" | "success" | "error"

type ChangelogCache = {
  expiresAt: number
  releases: GithubRelease[]
}

type FetchReleases = (input: string, init?: RequestInit) => Promise<Response>

let changelogCache: ChangelogCache | null = null
const KEYBINDING_ACTIONS = Object.keys(KEYBINDING_ACTION_LABELS) as KeybindingAction[]

export function getKeybindingsSubtitle(filePathDisplay: string) {
  return `Edit global app shortcuts stored in ${filePathDisplay}.`
}

export function getGeneralHeaderAction(updateSnapshot: UpdateSnapshot | null) {
  const isChecking = updateSnapshot?.status === "checking"
  const isUpdating = updateSnapshot?.status === "updating" || updateSnapshot?.status === "restart_pending"

  if (updateSnapshot?.updateAvailable) {
    return {
      disabled: isUpdating,
      kind: "update" as const,
      label: "Update",
      variant: "default" as const,
    }
  }

  return {
    disabled: isChecking || isUpdating,
    kind: "check" as const,
    label: "Check for updates",
    spinning: isChecking,
    variant: "outline" as const,
  }
}

export function resetSettingsPageChangelogCache() {
  changelogCache = null
}

export async function fetchGithubReleases(fetchImpl: FetchReleases = fetch): Promise<GithubRelease[]> {
  const response = await fetchImpl(GITHUB_RELEASES_URL, {
    headers: {
      Accept: "application/vnd.github+json",
    },
  })
  if (!response.ok) {
    throw new Error(`GitHub releases request failed with status ${response.status}`)
  }

  const payload = await response.json() as GithubRelease[]
  return payload.filter((release) => !release.draft)
}

export function getCachedChangelog() {
  if (!changelogCache) return null
  if (Date.now() >= changelogCache.expiresAt) {
    changelogCache = null
    return null
  }
  return changelogCache.releases
}

export function setCachedChangelog(releases: GithubRelease[]) {
  changelogCache = {
    releases,
    expiresAt: Date.now() + CHANGELOG_CACHE_TTL_MS,
  }
}

export async function loadChangelog(options?: { force?: boolean; fetchImpl?: FetchReleases }) {
  const cached = options?.force ? null : getCachedChangelog()
  if (cached) {
    return cached
  }

  const releases = await fetchGithubReleases(options?.fetchImpl)
  setCachedChangelog(releases)
  return releases
}

export function formatPublishedDate(value: string | null) {
  if (!value) return "Unpublished"

  const parsed = new Date(value)
  if (Number.isNaN(parsed.getTime())) return "Unknown date"

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(parsed)
}

export function ChangelogSection({
  status,
  releases,
  error,
  onRetry,
}: {
  status: ChangelogStatus
  releases: GithubRelease[]
  error: string | null
  onRetry: () => void
}) {
  return (
    <div className="space-y-4">
      {status === "loading" || status === "idle" ? (
        <div className="flex min-h-[180px] items-center justify-center rounded-2xl border border-border bg-card/40 px-6 py-8 text-sm text-muted-foreground">
          <div className="flex items-center gap-3">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading release notes…</span>
          </div>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="rounded-2xl border border-destructive/20 bg-destructive/5 px-6 py-5">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-sm font-medium text-foreground">Could not load changelog</div>
              <div className="mt-1 text-sm text-muted-foreground">
                {error ?? "Unable to load changelog."}
              </div>
            </div>
            <button
              type="button"
              onClick={onRetry}
              className="rounded-lg border border-border bg-background px-3 py-2 text-sm text-foreground transition-colors hover:bg-muted"
            >
              Retry
            </button>
          </div>
        </div>
      ) : null}

      {status === "success" && releases.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card/30 px-6 py-8">
          <div className="text-sm font-medium text-foreground">No releases yet</div>
          <div className="mt-2 text-sm text-muted-foreground">
            GitHub did not return any published releases for this repository.
          </div>
        </div>
      ) : null}

      {status === "success" && releases.length > 0 ? (
        releases.map((release) => (
          <article
            key={release.id}
            className="rounded-xl border border-border bg-card/30 pl-6 pr-4 py-4"
          >

            <div className="flex flex-row items-center min-w-0 flex-1 gap-3 ">
              <div className="flex flex-row items-center min-w-0 flex-1 gap-3 ">
                <div className="text-lg font-semibold tracking-[-0.2px] text-foreground">
                  {release.name?.trim() || release.tag_name}
                </div>
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  <span>{formatPublishedDate(release.published_at)}</span>
                  {release.prerelease ? (
                    <span className="rounded-full border border-border px-2.5 py-1 uppercase tracking-wide">
                      Prerelease
                    </span>
                  ) : null}
                  
                </div>
              </div>


              <div className="flex flex-row items-center justify-end min-w-0 flex-1 gap-3 ">
                <div className="flex min-w-0 flex-wrap items-center gap-2 text-xs text-muted-foreground">
                  
                  <span className="rounded-full bg-muted px-2.5 py-1 font-mono text-foreground/80">
                    {release.tag_name}
                  </span>
                </div>

                <a
                  href={release.html_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="View release on GitHub"
                  className={cn(
                    buttonVariants({ variant: "ghost", size: "icon-sm" }),
                    "h-8 w-8 shrink-0 rounded-md"
                  )}
                >
                  <GitHubIcon className="h-4 w-4" />
                </a>

              </div>
            
             
            </div>


            {release.body?.trim() ? (
              <div className="prose prose-sm mt-5 max-w-none text-foreground dark:prose-invert">
                <Markdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                  {release.body}
                </Markdown>
              </div>
            ) : (
              <div className="mt-5 text-sm text-muted-foreground">No release notes were provided.</div>
            )}
          </article>
        ))
      ) : null}
    </div>
  )
}

function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
      className={className}
    >
      <path d="M12 .5C5.649.5.5 5.649.5 12A11.5 11.5 0 0 0 8.36 22.04c.575.106.785-.25.785-.556 0-.274-.01-1-.015-1.962-3.181.691-3.853-1.532-3.853-1.532-.52-1.322-1.27-1.674-1.27-1.674-1.038-.71.08-.695.08-.695 1.148.08 1.752 1.178 1.752 1.178 1.02 1.748 2.676 1.243 3.328.95.103-.738.399-1.243.725-1.53-2.54-.289-5.211-1.27-5.211-5.65 0-1.248.446-2.27 1.177-3.07-.118-.288-.51-1.45.112-3.024 0 0 .96-.307 3.145 1.173A10.91 10.91 0 0 1 12 6.03c.973.004 1.954.132 2.87.387 2.182-1.48 3.14-1.173 3.14-1.173.625 1.573.233 2.736.115 3.024.734.8 1.175 1.822 1.175 3.07 0 4.39-2.676 5.358-5.224 5.642.41.353.776 1.05.776 2.117 0 1.528-.014 2.761-.014 3.136 0 .309.207.668.79.555A11.502 11.502 0 0 0 23.5 12C23.5 5.649 18.351.5 12 .5Z" />
    </svg>
  )
}

function SettingsSection({
  title,
  children,
  defaultExpanded = false,
}: {
  title: string
  children: ReactNode
  defaultExpanded?: boolean
}) {
  const [expanded, setExpanded] = useState(defaultExpanded)

  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card/30">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between gap-4 px-5 py-4 text-left transition-colors hover:bg-muted/30"
        aria-expanded={expanded}
      >
        <span className="text-sm font-semibold uppercase tracking-wider text-muted-foreground/80">
          {title}
        </span>
        <ChevronRight
          className={cn(
            "h-4 w-4 text-muted-foreground transition-transform duration-200",
            expanded && "rotate-90"
          )}
        />
      </button>
      {expanded ? <div className="border-t border-border px-5 pb-1">{children}</div> : null}
    </section>
  )
}

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
      <div className={`flex justify-between gap-8 py-5 ${alignStart ? "items-start" : "items-center"}`}>
        <div className="min-w-0 max-w-xl">
          <div className="text-sm font-medium text-foreground">{title}</div>
          <div className="mt-1 text-[13px] text-muted-foreground">{description}</div>
        </div>
        <div className="flex shrink-0 items-center justify-end">{children}</div>
      </div>
    </div>
  )
}

export function SettingsPage() {
  const navigate = useNavigate()
  const { sectionId } = useParams<{ sectionId: string }>()
  const state = useOutletContext<VisparkCodeState>()
  const dialog = useAppDialog()
  const { theme, setTheme } = useTheme()
  const [changelogStatus, setChangelogStatus] = useState<ChangelogStatus>("idle")
  const [releases, setReleases] = useState<GithubRelease[]>([])
  const [changelogError, setChangelogError] = useState<string | null>(null)
  const selectedPage = resolveSettingsSectionId(sectionId) ?? "general"
  const isConnecting = state.connectionStatus === "connecting" || !state.localProjectsReady
  const scrollbackLines = useTerminalPreferencesStore((store) => store.scrollbackLines)
  const minColumnWidth = useTerminalPreferencesStore((store) => store.minColumnWidth)
  const editorPreset = useTerminalPreferencesStore((store) => store.editorPreset)
  const editorCommandTemplate = useTerminalPreferencesStore((store) => store.editorCommandTemplate)
  const setScrollbackLines = useTerminalPreferencesStore((store) => store.setScrollbackLines)
  const setMinColumnWidth = useTerminalPreferencesStore((store) => store.setMinColumnWidth)
  const setEditorPreset = useTerminalPreferencesStore((store) => store.setEditorPreset)
  const setEditorCommandTemplate = useTerminalPreferencesStore((store) => store.setEditorCommandTemplate)
  const keybindings = state.keybindings
  const visionContinualLearning = useChatPreferencesStore((store) => store.providerDefaults.vision.modelOptions.continualLearning)
  const setProviderDefaultModelOptions = useChatPreferencesStore((store) => store.setProviderDefaultModelOptions)
  const resolvedKeybindings = useMemo(() => getResolvedKeybindings(keybindings), [keybindings])
  const keybindingsFilePathDisplay = resolvedKeybindings.filePathDisplay || getKeybindingsFilePathDisplay()
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
  const [keybindingDrafts, setKeybindingDrafts] = useState<Record<string, string>>({})
  const [keybindingsError, setKeybindingsError] = useState<string | null>(null)

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
    setKeybindingDrafts(Object.fromEntries(
      KEYBINDING_ACTIONS.map((action) => [
        action,
        formatKeybindingInput(resolvedKeybindings.bindings[action]),
      ])
    ))
  }, [resolvedKeybindings])

  useEffect(() => {
    if (!sectionId) return
    if (resolveSettingsSectionId(sectionId)) return
    navigate("/settings/general", { replace: true })
  }, [navigate, sectionId])

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

  useEffect(() => {
    if (selectedPage !== "changelog" || isConnecting) return

    let cancelled = false
    setChangelogStatus("loading")
    setChangelogError(null)

    void loadChangelog()
      .then((nextReleases) => {
        if (cancelled) return
        setReleases(nextReleases)
        setChangelogStatus("success")
      })
      .catch((error: unknown) => {
        if (cancelled) return
        setChangelogError(error instanceof Error ? error.message : "Unable to load changelog.")
        setChangelogStatus("error")
      })

    return () => {
      cancelled = true
    }
  }, [isConnecting, selectedPage])

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

  async function commitKeybindings() {
    try {
      setKeybindingsError(null)
      await state.socket.command({
        type: "settings.writeKeybindings",
        bindings: buildKeybindingPayload(keybindingDrafts),
      })
    } catch (error) {
      setKeybindingsError(error instanceof Error ? error.message : "Unable to save keybindings.")
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

  async function restoreDefaultKeybinding(action: keyof typeof KEYBINDING_ACTION_LABELS) {
    const nextDrafts = {
      ...keybindingDrafts,
      [action]: formatKeybindingInput(DEFAULT_KEYBINDINGS[action]),
    }
    setKeybindingDrafts(nextDrafts)

    try {
      setKeybindingsError(null)
      await state.socket.command({
        type: "settings.writeKeybindings",
        bindings: buildKeybindingPayload(nextDrafts),
      })
    } catch (error) {
      setKeybindingsError(error instanceof Error ? error.message : "Unable to save keybindings.")
    }
  }

  function retryChangelog() {
    changelogCache = null
    setChangelogStatus("loading")
    setChangelogError(null)

    void loadChangelog({ force: true })
      .then((nextReleases) => {
        setReleases(nextReleases)
        setChangelogStatus("success")
      })
      .catch((error: unknown) => {
        setChangelogError(error instanceof Error ? error.message : "Unable to load changelog.")
        setChangelogStatus("error")
      })
  }

  const customEditorPreview = editorCommandDraft
    .replaceAll("{path}", "/Users/vispark/Code/vispark-code/src/client/app/App.tsx")
    .replaceAll("{line}", "12")
    .replaceAll("{column}", "1")
  const effectiveVisionWeightsPath = visionWeightsPath || FALLBACK_VISION_WEIGHTS_PATH

  return (
    <div className="relative flex h-full flex-1 min-w-0 overflow-y-auto bg-background">
      <div className="w-full px-4 pb-10 pt-8 sm:px-6 sm:pt-16">
        {isConnecting ? (
          <div className="mx-auto max-w-4xl">
            <div className="flex min-h-[240px] items-center justify-center rounded-2xl border border-border bg-card/40 px-4 py-6 text-sm text-muted-foreground">
              <div className="flex items-center gap-3">
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Loading machine settings…</span>
              </div>
            </div>
          </div>
        ) : selectedPage === "changelog" ? (
          <div className="mx-auto max-w-4xl">
            <div className="pb-8">
              <div className="text-3xl font-bold tracking-tight text-foreground">
                Changelog
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                Release notes pulled from the public GitHub releases feed.
              </div>
            </div>
            <ChangelogSection
              status={changelogStatus}
              releases={releases}
              error={changelogError}
              onRetry={retryChangelog}
            />
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

            <div className="space-y-4">
              <SettingsSection title="Vision & CL" defaultExpanded>
                <SettingsRow
                  title="Vispark Lab API Key"
                  description={(
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
                  )}
                  bordered={false}
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
                          {isEditingVisionApiKey && visionApiKeyDraft ? (
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
                          ) : null}
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
                  description="Let Vision learn your coding style and preferences over time."
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
                          setProviderDefaultModelOptions("vision", { continualLearning: value === "on" })
                        }}
                        options={continualLearningOptions}
                        size="sm"
                      />
                    </div>
                  </div>
                </SettingsRow>
              </SettingsSection>

              <SettingsSection title="Theme & Editor">
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
                    <div className="flex flex-col gap-4 py-5 sm:flex-row sm:justify-between sm:gap-8">
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
              </SettingsSection>

              <SettingsSection title="Keybindings">
                <SettingsRow
                  title="Keybindings"
                  description={getKeybindingsSubtitle(keybindingsFilePathDisplay)}
                  bordered={false}
                  alignStart
                >
                  <div className="flex min-w-0 w-full flex-col items-stretch gap-2 sm:max-w-[420px] sm:flex-1">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="justify-center"
                      onClick={() => {
                        void state.handleOpenExternalPath("open_editor", keybindingsFilePathDisplay)
                      }}
                    >
                      Open in {state.editorLabel}
                    </Button>
                    {keybindingsError ? (
                      <div className="text-xs text-destructive">{keybindingsError}</div>
                    ) : null}
                    {resolvedKeybindings.warning ? (
                      <div className="text-xs text-muted-foreground">{resolvedKeybindings.warning}</div>
                    ) : null}
                  </div>
                </SettingsRow>

                {KEYBINDING_ACTIONS.map((action) => {
                  const defaultValue = formatKeybindingInput(DEFAULT_KEYBINDINGS[action])
                  const currentValue = keybindingDrafts[action] ?? ""
                  const showRestore = currentValue !== defaultValue

                  return (
                    <SettingsRow
                      key={action}
                      title={KEYBINDING_ACTION_LABELS[action]}
                      description={(
                        <>
                          <span>Comma-separated shortcuts.</span>
                          {showRestore ? (
                            <>
                              <span> </span>
                              <button
                                type="button"
                                onClick={() => {
                                  void restoreDefaultKeybinding(action)
                                }}
                                className="inline rounded text-foreground hover:text-foreground/80"
                              >
                                Restore: {defaultValue}
                              </button>
                            </>
                          ) : null}
                        </>
                      )}
                    >
                      <div className="flex min-w-0 w-full flex-col items-stretch gap-2 sm:max-w-[420px] sm:flex-1">
                        <input
                          type="text"
                          value={currentValue}
                          onChange={(event) => {
                            const nextValue = event.target.value
                            setKeybindingDrafts((current) => ({ ...current, [action]: nextValue }))
                          }}
                          onBlur={() => {
                            void commitKeybindings()
                          }}
                          onKeyDown={(event) => handleTextInputKeyDown(event, () => {
                            void commitKeybindings()
                          })}
                          className="w-full rounded-lg border border-border bg-background px-3 py-2 font-mono text-sm text-foreground outline-none"
                        />
                      </div>
                    </SettingsRow>
                  )
                })}
              </SettingsSection>

              <SettingsSection title="Reset">
                <SettingsRow
                  title="Reset Vispark Code"
                  description="Return the app to a fresh-install state. This removes local chats, saved settings, cached mirrors, and browser UI preferences, but does not touch your code projects."
                  bordered={false}
                  alignStart
                >
                  <div className="flex min-w-0 w-full flex-col items-stretch gap-2 sm:max-w-[420px] sm:flex-1">
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
              </SettingsSection>
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

function buildKeybindingPayload(source: Record<string, string>): Record<KeybindingAction, string[]> {
  return {
    toggleEmbeddedTerminal: parseKeybindingInput(source.toggleEmbeddedTerminal ?? ""),
    toggleRightSidebar: parseKeybindingInput(source.toggleRightSidebar ?? ""),
    openInFinder: parseKeybindingInput(source.openInFinder ?? ""),
    openInEditor: parseKeybindingInput(source.openInEditor ?? ""),
    addSplitTerminal: parseKeybindingInput(source.addSplitTerminal ?? ""),
  }
}
