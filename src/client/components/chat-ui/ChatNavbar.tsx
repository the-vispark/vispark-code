import { type MouseEvent as ReactMouseEvent } from "react"
import { GitBranch, Menu, MoreHorizontal, PanelLeft, PanelRight, SquarePen, Terminal } from "lucide-react"
import type { EditorOpenSettings, EditorPreset, OpenExternalAction } from "../../../shared/protocol"
import { Button } from "../ui/button"
import { CardHeader } from "../ui/card"
import { HotkeyTooltip, HotkeyTooltipContent, HotkeyTooltipTrigger } from "../ui/tooltip"
import { cn } from "../../lib/utils"
import { OpenExternalSelect } from "../open-external-menu"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from "../ui/context-menu"

function openContextMenuFromButton(event: ReactMouseEvent<HTMLButtonElement>) {
  event.preventDefault()
  event.stopPropagation()
  const rect = event.currentTarget.getBoundingClientRect()
  event.currentTarget.dispatchEvent(new MouseEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    clientX: rect.left + rect.width / 2,
    clientY: rect.bottom,
    view: window,
  }))
}

function NavbarOverflowMenu({
  showOnDesktop,
  onToggleEmbeddedTerminal,
}: {
  showOnDesktop: boolean
  onToggleEmbeddedTerminal?: () => void
}) {
  if (!onToggleEmbeddedTerminal) return null

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <Button
          variant="ghost"
          size="none"
          onClick={openContextMenuFromButton}
          title="More actions"
          className={cn(
            "border border-border/0 hover:!border-border/0 px-1.5 h-9 hover:!bg-transparent",
            showOnDesktop ? "flex" : "flex md:hidden"
          )}
        >
          <MoreHorizontal strokeWidth={2} className="h-4.5" />
        </Button>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {onToggleEmbeddedTerminal ? (
          <ContextMenuItem
            onSelect={(event) => {
              event.preventDefault()
              onToggleEmbeddedTerminal()
            }}
          >
            <Terminal strokeWidth={2} className="h-3.5 w-3.5" />
            <span className="text-xs font-medium">Toggle Terminal</span>
          </ContextMenuItem>
        ) : null}
      </ContextMenuContent>
    </ContextMenu>
  )
}

function BrandMark({ className }: { className?: string }) {
  return <img src="/favicon.png" alt="" className={className} />
}

interface Props {
  sidebarCollapsed: boolean
  onOpenSidebar: () => void
  onExpandSidebar: () => void
  onNewChat: () => void
  localPath?: string
  embeddedTerminalVisible?: boolean
  onToggleEmbeddedTerminal?: () => void
  rightSidebarVisible?: boolean
  onToggleRightSidebar?: () => void
  onOpenExternal?: (action: OpenExternalAction, editor?: EditorOpenSettings) => void
  editorPreset?: EditorPreset
  editorCommandTemplate?: string
  platform?: NodeJS.Platform
  finderShortcut?: string[]
  editorShortcut?: string[]
  terminalShortcut?: string[]
  rightSidebarShortcut?: string[]
  branchName?: string
  hasGitRepo?: boolean
  gitStatus?: "unknown" | "ready" | "no_repo"
}

export function ChatNavbar({
  sidebarCollapsed,
  onOpenSidebar,
  onExpandSidebar,
  onNewChat,
  localPath,
  embeddedTerminalVisible = false,
  onToggleEmbeddedTerminal,
  rightSidebarVisible = false,
  onToggleRightSidebar,
  onOpenExternal,
  editorPreset = "cursor",
  editorCommandTemplate,
  platform = "darwin",
  finderShortcut,
  editorShortcut,
  terminalShortcut,
  rightSidebarShortcut,
  branchName,
  hasGitRepo = true,
  gitStatus = "unknown",
}: Props) {
  const branchLabel = !hasGitRepo
    ? "Setup Git"
    : gitStatus === "unknown"
      ? null
      : (branchName ?? "Detached HEAD")
  const isMac = platform === "darwin"

  return (
    <CardHeader
      className={cn(
        "absolute top-0 md:top-2 left-0 right-0 z-10 px-2.5 border-border/0 md:pb-0 flex items-center justify-center",
        sidebarCollapsed ? "md:px-2.5 md:pr-4" : "md:px-4 md:pr-4",
        " bg-gradient-to-b from-background"
      )}
    >
      <div className="relative flex items-center gap-2 w-full">
        <div className={`flex items-center gap-1 flex-shrink-0 border border-border/0 rounded-2xl ${sidebarCollapsed ? 'px-1.5  border-border' : ''} p-1 backdrop-blur-lg`}>
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={onOpenSidebar}
          >
            <Menu className="size-4.5" />
          </Button>
          {sidebarCollapsed && (
            <>
              <div className="hidden md:flex items-center justify-center w-[44px] h-[44px]">
                <BrandMark className="h-6 w-6 rounded-lg" />
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="hidden md:flex"
                onClick={onExpandSidebar}
                title="Expand sidebar"
              >
                <PanelLeft className="size-4.5" />
              </Button>
            </>
          )}
          <Button
            variant="ghost"
            size="icon"
            className="hover:!border-border/0 hover:!bg-transparent"
            onClick={onNewChat}
            title="Compose"
          >
            <SquarePen className="size-4.5" />
          </Button>
        </div>

        <div className="flex-1 min-w-0" />

        {localPath && (onOpenExternal || onToggleEmbeddedTerminal || onToggleRightSidebar) ? (
          <div className="flex items-center gap-2 flex-shrink-0">
            {onOpenExternal ? (
              <div className="hidden py-0.5 md:block border border-border rounded-2xl backdrop-blur-lg">
                <OpenExternalSelect
                  isMac={isMac}
                  editorPreset={editorPreset}
                  editorCommandTemplate={editorCommandTemplate}
                  finderShortcut={finderShortcut}
                  editorShortcut={editorShortcut}
                  onOpenExternal={onOpenExternal}
                />
              </div>
            ) : null}
            {(onToggleEmbeddedTerminal || onToggleRightSidebar) ? (
              <div className="flex items-center border border-border rounded-2xl px-2 py-0.5 backdrop-blur-lg">
                <NavbarOverflowMenu
                  showOnDesktop={rightSidebarVisible}
                  onToggleEmbeddedTerminal={onToggleEmbeddedTerminal}
                />
                {onToggleEmbeddedTerminal ? (
                <HotkeyTooltip>
                  <HotkeyTooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="none"
                      onClick={onToggleEmbeddedTerminal}
                      className={cn(
                        rightSidebarVisible ? "hidden" : "hidden md:flex",
                        "border border-border/0 hover:!border-border/0 px-1.5 h-9 hover:!bg-transparent",
                        embeddedTerminalVisible && "text-foreground"
                      )}
                    >
                      <Terminal strokeWidth={2} className="h-4.5" />
                    </Button>
                  </HotkeyTooltipTrigger>
                    <HotkeyTooltipContent side="bottom" shortcut={terminalShortcut} />
                </HotkeyTooltip>
              ) : null}
                {onToggleRightSidebar ? (
                  <HotkeyTooltip>
                    <HotkeyTooltipTrigger asChild>
                      <Button
                        variant="ghost"
                        onClick={onToggleRightSidebar}
                        className={cn(
                          "border flex flex-row items-center gap-1.5 h-9 border-border/0 pl-1.5 pr-2 hover:!border-border/0 hover:!bg-transparent",
                          rightSidebarVisible && "text-foreground"
                        )}
                      >
                        {rightSidebarVisible ? <PanelRight strokeWidth={2.25} className="h-4" /> : <GitBranch strokeWidth={2.25} className="h-4" />}
                        {branchLabel && !rightSidebarVisible ? <div className="font-[13px] max-w-[140px] truncate hidden md:block">{branchLabel}</div> : null}
                      </Button>
                    </HotkeyTooltipTrigger>
                    <HotkeyTooltipContent side="bottom" shortcut={rightSidebarShortcut} />
                  </HotkeyTooltip>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </CardHeader>
  )
}
