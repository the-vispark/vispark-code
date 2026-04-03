import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { Loader2, Menu, PanelLeft, Plus, Settings, X } from "lucide-react"
import { useLocation, useNavigate } from "react-router-dom"
import { APP_NAME } from "../../shared/branding"
import type { SidebarChatRow, SidebarData, UpdateSnapshot } from "../../shared/types"
import { ChatRow } from "../components/chat-ui/sidebar/ChatRow"
import { LocalProjectsSection } from "../components/chat-ui/sidebar/LocalProjectsSection"
import { Button } from "../components/ui/button"
import { useProjectGroupOrderStore } from "../stores/projectGroupOrderStore"
import { cn } from "../lib/utils"
import type { SocketStatus } from "./socket"

function BrandMark({ className }: { className?: string }) {
  return <img src="/favicon.png" alt="" className={className} />
}

interface VisparkCodeSidebarProps {
  data: SidebarData
  activeChatId: string | null
  connectionStatus: SocketStatus
  ready: boolean
  open: boolean
  collapsed: boolean
  showMobileOpenButton: boolean
  onOpen: () => void
  onClose: () => void
  onCollapse: () => void
  onExpand: () => void
  onCreateChat: (projectId: string) => void
  onDeleteChat: (chat: SidebarChatRow) => void
  onCopyPath: (localPath: string) => void
  onOpenExternalPath: (action: "open_finder" | "open_editor", localPath: string) => void
  onRemoveProject: (projectId: string) => void
  editorLabel: string
  updateSnapshot: UpdateSnapshot | null
  onInstallUpdate: () => void
}

export function VisparkCodeSidebar({
  data,
  activeChatId,
  connectionStatus,
  ready,
  open,
  collapsed,
  showMobileOpenButton,
  onOpen,
  onClose,
  onCollapse,
  onExpand,
  onCreateChat,
  onDeleteChat,
  onCopyPath,
  onOpenExternalPath,
  onRemoveProject,
  editorLabel,
  updateSnapshot,
  onInstallUpdate,
}: VisparkCodeSidebarProps) {
  const location = useLocation()
  const navigate = useNavigate()
  const scrollContainerRef = useRef<HTMLDivElement>(null)
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set())
  const [expandedGroups, setExpandedGroups] = useState<Set<string>>(new Set())
  const [nowMs, setNowMs] = useState(() => Date.now())
  const chatsPerProject = 10

  const savedOrder = useProjectGroupOrderStore((store) => store.order)
  const setGroupOrder = useProjectGroupOrderStore((store) => store.setOrder)

  const orderedProjectGroups = useMemo(() => {
    if (savedOrder.length === 0) return data.projectGroups

    const groupMap = new Map(data.projectGroups.map((group) => [group.groupKey, group]))
    const ordered = savedOrder
      .filter((key) => groupMap.has(key))
      .map((key) => groupMap.get(key)!)

    const orderedKeys = new Set(savedOrder)
    for (const group of data.projectGroups) {
      if (!orderedKeys.has(group.groupKey)) ordered.push(group)
    }

    return ordered
  }, [data.projectGroups, savedOrder])

  const handleReorderGroups = useCallback(
    (newOrder: string[]) => setGroupOrder(newOrder),
    [setGroupOrder]
  )

  const projectIdByPath = useMemo(
    () => new Map(data.projectGroups.map((group) => [group.localPath, group.groupKey])),
    [data.projectGroups]
  )

  const activeVisibleCount = useMemo(
    () => data.projectGroups.reduce((count, group) => count + group.chats.length, 0),
    [data.projectGroups]
  )

  const toggleSection = useCallback((key: string) => {
    setCollapsedSections((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const toggleExpandedGroup = useCallback((key: string) => {
    setExpandedGroups((previous) => {
      const next = new Set(previous)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }, [])

  const renderChatRow = useCallback((chat: SidebarChatRow) => (
    <ChatRow
      key={chat._id}
      chat={chat}
      activeChatId={activeChatId}
      nowMs={nowMs}
      onSelectChat={(chatId) => {
        navigate(`/chat/${chatId}`)
        onClose()
      }}
      onDeleteChat={() => onDeleteChat(chat)}
    />
  ), [activeChatId, navigate, nowMs, onClose, onDeleteChat])

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setNowMs(Date.now())
    }, 30_000)

    return () => window.clearInterval(intervalId)
  }, [])

  useEffect(() => {
    if (!activeChatId || !scrollContainerRef.current) return

    requestAnimationFrame(() => {
      const container = scrollContainerRef.current
      const activeElement = container?.querySelector(`[data-chat-id="${activeChatId}"]`) as HTMLElement | null
      if (!activeElement || !container) return

      const elementRect = activeElement.getBoundingClientRect()
      const containerRect = container.getBoundingClientRect()

      if (elementRect.top < containerRect.top + 38) {
        const relativeTop = elementRect.top - containerRect.top + container.scrollTop
        container.scrollTo({ top: relativeTop - 38, behavior: "smooth" })
      } else if (elementRect.bottom > containerRect.bottom) {
        const elementCenter = elementRect.top + elementRect.height / 2 - containerRect.top + container.scrollTop
        const containerCenter = container.clientHeight / 2
        container.scrollTo({ top: elementCenter - containerCenter, behavior: "smooth" })
      }
    })
  }, [activeChatId, activeVisibleCount])

  const hasVisibleChats = activeVisibleCount > 0
  const isLocalProjectsActive = location.pathname === "/"
  const isSettingsActive = location.pathname.startsWith("/settings")
  const isUtilityPageActive = isLocalProjectsActive || isSettingsActive
  const isConnecting = connectionStatus === "connecting" || !ready
  const statusLabel = isConnecting ? "Connecting" : connectionStatus === "connected" ? "Connected" : "Disconnected"
  const statusDotClass = connectionStatus === "connected" ? "bg-emerald-500" : "bg-amber-500"
  const showUpdateButton = updateSnapshot?.updateAvailable === true
  const showDevBadge = updateSnapshot
    ? updateSnapshot.latestVersion === `${updateSnapshot.currentVersion}-dev`
    : false
  const isUpdating = updateSnapshot?.status === "updating" || updateSnapshot?.status === "restart_pending"

  return (
    <>
      {!open && showMobileOpenButton ? (
        <Button
          variant="ghost"
          size="icon"
          className="fixed top-3 left-3 z-50 md:hidden"
          onClick={onOpen}
        >
          <Menu className="h-5 w-5" />
        </Button>
      ) : null}

      {collapsed && isUtilityPageActive ? (
        <div className="fixed left-0 top-0 z-40 hidden h-full items-start border-l border-border/0 pl-5 pt-4 md:flex">
          <div className="flex items-center gap-1">
            <BrandMark className="size-7 rounded-lg shadow-sm" />
            <Button
              variant="ghost"
              size="icon"
              onClick={onExpand}
              title="Expand sidebar"
            >
              <PanelLeft className="h-5 w-5" />
            </Button>
          </div>
        </div>
      ) : null}

      <div
        data-sidebar="open"
        className={cn(
          "fixed inset-0 z-50 flex h-[100dvh] select-none flex-col bg-background dark:bg-card",
          "md:relative md:inset-auto md:my-2 md:ml-2 md:mr-0 md:h-[calc(100dvh-16px)] md:w-[275px] md:rounded-2xl md:border md:border-border",
          open ? "flex" : "hidden md:flex",
          collapsed && "md:hidden"
        )}
      >
        <div className="flex h-[64px] max-h-[64px] items-center justify-between border-b pl-3 pr-[7px] md:h-[55px] md:max-h-[55px]">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onCollapse}
              title="Collapse sidebar"
              className="group/sidebar-collapse relative hidden h-7 w-7 items-center justify-center md:flex"
            >
              <BrandMark className="absolute inset-0 h-7 w-7 rounded-xl transition-all duration-200 ease-out group-hover/sidebar-collapse:scale-0 group-hover/sidebar-collapse:opacity-0" />
              <PanelLeft className="absolute inset-0 m-auto h-5 w-5 scale-0 text-slate-500 opacity-0 transition-all duration-200 ease-out group-hover/sidebar-collapse:scale-90 group-hover/sidebar-collapse:opacity-100 hover:opacity-50 dark:text-slate-400" />
            </button>
            <BrandMark className="h-7 w-7 rounded-xl md:hidden" />
            <span className="font-logo text-base uppercase tracking-[0.18em] text-slate-600 dark:text-slate-100 sm:text-[1.05rem]">
              {APP_NAME}
            </span>
          </div>

          <div className="flex items-center">
            {showDevBadge ? (
              <span
                className="mr-1 inline-flex items-center rounded-full border border-border bg-muted px-2 py-0.5 text-[11px] font-bold tracking-wider text-muted-foreground"
                title="Development build"
              >
                DEV
              </span>
            ) : showUpdateButton ? (
              <Button
                variant="outline"
                size="sm"
                className="mr-1 !h-auto rounded-full border-logo/20 bg-logo/20 px-2 py-0.5 text-[11px] font-bold tracking-wider text-logo hover:border-logo/20 hover:bg-logo hover:text-foreground"
                onClick={onInstallUpdate}
                disabled={isUpdating}
                title={updateSnapshot?.latestVersion ? `Update to ${updateSnapshot.latestVersion}` : "Update Vispark Code"}
              >
                {isUpdating ? <Loader2 className="mr-1.5 h-3 w-3 animate-spin" /> : null}
                UPDATE
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                navigate("/")
                onClose()
              }}
              className="size-10 rounded-lg"
              title="New project"
            >
              <Plus className="size-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden"
              onClick={onClose}
            >
              <X className="h-5 w-5" />
            </Button>
          </div>
        </div>

        <div
          ref={scrollContainerRef}
          className="scrollbar-hide flex-1 min-h-0 overflow-y-auto"
          style={{ WebkitOverflowScrolling: "touch" }}
        >
          <div className="p-[7px]">
            {!hasVisibleChats && isConnecting ? (
              <div className="space-y-5 px-1 pt-3">
                {[0, 1, 2].map((section) => (
                  <div key={section} className="animate-pulse space-y-2">
                    <div className="h-4 w-28 rounded bg-muted" />
                    <div className="space-y-1">
                      {[0, 1, 2].map((row) => (
                        <div key={row} className="flex items-center gap-2 rounded-md px-3 py-2">
                          <div className="h-3.5 w-3.5 rounded-full bg-muted" />
                          <div
                            className={cn(
                              "h-3.5 rounded bg-muted",
                              row === 0 ? "w-32" : row === 1 ? "w-40" : "w-28"
                            )}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : null}

            {!hasVisibleChats && !isConnecting && data.projectGroups.length === 0 ? (
              <p className="mt-6 p-2 text-center text-sm text-slate-400">No conversations yet</p>
            ) : null}

            <LocalProjectsSection
              projectGroups={orderedProjectGroups}
              editorLabel={editorLabel}
              onReorderGroups={handleReorderGroups}
              collapsedSections={collapsedSections}
              expandedGroups={expandedGroups}
              onToggleSection={toggleSection}
              onToggleExpandedGroup={toggleExpandedGroup}
              renderChatRow={renderChatRow}
              chatsPerProject={chatsPerProject}
              onNewLocalChat={(localPath) => {
                const projectId = projectIdByPath.get(localPath)
                if (projectId) {
                  onCreateChat(projectId)
                }
              }}
              onCopyPath={onCopyPath}
              onOpenExternalPath={onOpenExternalPath}
              onRemoveProject={onRemoveProject}
              isConnected={connectionStatus === "connected"}
            />
          </div>
        </div>

        <div className="border-t border-border p-2">
          <button
            type="button"
            onClick={() => {
              navigate("/settings")
              onClose()
            }}
            className={cn(
              "w-full rounded-xl rounded-t-md border px-3 py-2 text-left transition-colors",
              isSettingsActive
                ? "border-border bg-muted"
                : "border-border/0 hover:border-border hover:bg-muted active:bg-muted/80"
            )}
          >
            <div className="flex justify-between gap-2">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <span className="text-sm">Settings</span>
              </div>
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <span>{statusLabel}</span>
                {isConnecting ? (
                  <Loader2 className="h-2 w-2 animate-spin" />
                ) : (
                  <span className={cn("h-2 w-2 rounded-full", statusDotClass)} />
                )}
              </div>
            </div>
          </button>
        </div>
      </div>

      {open ? <div className="fixed inset-0 z-40 bg-black/40 md:hidden" onClick={onClose} /> : null}
    </>
  )
}
