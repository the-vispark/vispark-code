import { Code, FolderOpen, GitCompare, Menu, PanelLeft, SquarePen, Terminal } from "lucide-react"
import { Button } from "../ui/button"
import { CardHeader } from "../ui/card"
import { HotkeyTooltip, HotkeyTooltipContent, HotkeyTooltipTrigger } from "../ui/tooltip"
import { cn } from "../../lib/utils"

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
  onOpenExternal?: (action: "open_finder" | "open_editor") => void
  editorLabel?: string
  finderShortcut?: string[]
  editorShortcut?: string[]
  terminalShortcut?: string[]
  rightSidebarShortcut?: string[]
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
  editorLabel = "Editor",
  finderShortcut,
  editorShortcut,
  terminalShortcut,
  rightSidebarShortcut,
}: Props) {
  return (
    <CardHeader
      className={cn(
        "absolute top-0 md:top-2 left-0 right-0 z-10 px-2.5 border-border/0 md:pb-0 flex items-center justify-center",
        sidebarCollapsed ? "md:px-2.5 md:pr-4" : "md:px-4 md:pr-4",
        " bg-gradient-to-b from-background"
      )}
    >
      <div className="relative flex items-center gap-2 w-full">
        <div className={`flex items-center gap-1 flex-shrink-0 border border-border rounded-full ${sidebarCollapsed ? 'px-1.5' : ''} p-1 backdrop-blur-lg`}>
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
            onClick={onNewChat}
            title="Compose"
          >
            <SquarePen className="size-4.5" />
          </Button>
        </div>

        <div className="flex-1 min-w-0" />

        <div className="flex items-center gap-1 flex-shrink-0 border border-border rounded-full px-1.5 py-1 backdrop-blur-lg">
          {localPath && (onOpenExternal || onToggleEmbeddedTerminal) && (
            <>
              {onOpenExternal ? (
                <HotkeyTooltip>
                  <HotkeyTooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onOpenExternal("open_finder")}
                      title="Open in Finder"
                      className="border border-border/0"
                    >
                      <FolderOpen className="h-4.5 w-4.5" />
                    </Button>
                  </HotkeyTooltipTrigger>
                  <HotkeyTooltipContent side="bottom" shortcut={finderShortcut} />
                </HotkeyTooltip>
              ) : null}
              {onToggleEmbeddedTerminal ? (
                <HotkeyTooltip>
                  <HotkeyTooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={onToggleEmbeddedTerminal}
                      className={cn(
                        "border border-border/0",
                        embeddedTerminalVisible && "text-foreground"
                      )}
                    >
                      <Terminal className="h-4.5 w-4.5" />
                    </Button>
                  </HotkeyTooltipTrigger>
                  <HotkeyTooltipContent side="bottom" shortcut={terminalShortcut} />
                </HotkeyTooltip>
              ) : null}
              {onOpenExternal ? (
                <HotkeyTooltip>
                  <HotkeyTooltipTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => onOpenExternal("open_editor")}
                      title={`Open in ${editorLabel}`}
                      className="border border-border/0"
                    >
                      <Code className="h-4.5 w-4.5" />
                    </Button>
                  </HotkeyTooltipTrigger>
                  <HotkeyTooltipContent side="bottom" shortcut={editorShortcut} />
                </HotkeyTooltip>
              ) : null}
            </>
          )}
          {onToggleRightSidebar ? (
            <HotkeyTooltip>
              <HotkeyTooltipTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={onToggleRightSidebar}
                  className={cn(
                    "border border-border/0",
                    rightSidebarVisible && "text-foreground"
                  )}
                >
                  <GitCompare className="h-4.5 w-4.5" />
                </Button>
              </HotkeyTooltipTrigger>
              <HotkeyTooltipContent side="bottom" shortcut={rightSidebarShortcut} />
            </HotkeyTooltip>
          ) : null}
        </div>
      </div>
    </CardHeader>
  )
}
