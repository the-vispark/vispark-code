import { useEffect, useRef } from "react"
import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom"
import { APP_NAME } from "../../shared/branding"
import type { SidebarData } from "../../shared/types"
import { AppDialogProvider } from "../components/ui/app-dialog"
import { TooltipProvider } from "../components/ui/tooltip"
import { playChatNotificationSound, shouldPlayChatSound } from "../lib/chatSounds"
import { useChatSoundPreferencesStore } from "../stores/chatSoundPreferencesStore"
import { VisparkCodeSidebar } from "./VisparkCodeSidebar"
import { ChatPage } from "./ChatPage"
import { LocalProjectsPage } from "./LocalProjectsPage"
import { SettingsPage } from "./SettingsPage"
import { useVisparkCodeState } from "./useVisparkCodeState"

export function getNotificationTitleCount(sidebarData: SidebarData) {
  return sidebarData.projectGroups.reduce((count, group) => (
    count + group.chats.reduce((chatCount, chat) => (
      chatCount + (chat.unread ? 1 : 0) + (chat.status === "waiting_for_user" ? 1 : 0)
    ), 0)
  ), 0)
}

interface ChatNotificationSnapshot {
  unreadCount: number
  waitingChatIds: Set<string>
}

export function getChatNotificationSnapshot(sidebarData: SidebarData): ChatNotificationSnapshot {
  let unreadCount = 0
  const waitingChatIds = new Set<string>()

  for (const group of sidebarData.projectGroups) {
    for (const chat of group.chats) {
      if (chat.unread) unreadCount += 1
      if (chat.status === "waiting_for_user") {
        waitingChatIds.add(chat.chatId)
      }
    }
  }

  return { unreadCount, waitingChatIds }
}

export function getChatSoundBurstCount(previous: SidebarData | null, next: SidebarData): number {
  if (!previous) return 0

  const previousSnapshot = getChatNotificationSnapshot(previous)
  const nextSnapshot = getChatNotificationSnapshot(next)
  const unreadIncrease = Math.max(0, nextSnapshot.unreadCount - previousSnapshot.unreadCount)
  let newWaitingChats = 0

  for (const chatId of nextSnapshot.waitingChatIds) {
    if (!previousSnapshot.waitingChatIds.has(chatId)) {
      newWaitingChats += 1
    }
  }

  return unreadIncrease + newWaitingChats
}

function VisparkCodeLayout() {
  const location = useLocation()
  const params = useParams()
  const state = useVisparkCodeState(params.chatId ?? null)
  const showMobileOpenButton = location.pathname === "/"
  const chatSoundPreference = useChatSoundPreferencesStore((store) => store.chatSoundPreference)
  const chatSoundId = useChatSoundPreferencesStore((store) => store.chatSoundId)
  const previousSidebarDataRef = useRef<SidebarData | null>(null)

  useEffect(() => {
    const notificationCount = getNotificationTitleCount(state.sidebarData)
    document.title = notificationCount > 0 ? `[${notificationCount}] ${APP_NAME}` : APP_NAME
  }, [state.sidebarData])

  useEffect(() => {
    const burstCount = getChatSoundBurstCount(previousSidebarDataRef.current, state.sidebarData)
    previousSidebarDataRef.current = state.sidebarData

    if (burstCount <= 0) return
    if (!shouldPlayChatSound(chatSoundPreference)) return

    void playChatNotificationSound(chatSoundId, burstCount).catch(() => undefined)
  }, [chatSoundId, chatSoundPreference, state.sidebarData])

  return (
    <div className="flex h-[100dvh] min-h-[100dvh] overflow-hidden">
      <VisparkCodeSidebar
        data={state.sidebarData}
        activeChatId={state.activeChatId}
        connectionStatus={state.connectionStatus}
        ready={state.sidebarReady}
        open={state.sidebarOpen}
        collapsed={state.sidebarCollapsed}
        showMobileOpenButton={showMobileOpenButton}
        onOpen={state.openSidebar}
        onClose={state.closeSidebar}
        onCollapse={state.collapseSidebar}
        onExpand={state.expandSidebar}
        onCreateChat={(projectId) => {
          void state.handleCreateChat(projectId)
        }}
        onDeleteChat={(chat) => {
          void state.handleDeleteChat(chat)
        }}
        onCopyPath={(localPath) => {
          void state.handleCopyPath(localPath)
        }}
        onOpenExternalPath={(action, localPath) => {
          void state.handleOpenExternalPath(action, localPath)
        }}
        onRemoveProject={(projectId) => {
          void state.handleRemoveProject(projectId)
        }}
        editorLabel={state.editorLabel}
        updateSnapshot={state.updateSnapshot}
        onInstallUpdate={() => {
          void state.handleInstallUpdate()
        }}
      />
      <Outlet context={state} />
    </div>
  )
}

export function App() {
  return (
    <TooltipProvider>
      <AppDialogProvider>
        <Routes>
          <Route element={<VisparkCodeLayout />}>
            <Route path="/" element={<LocalProjectsPage />} />
            <Route path="/settings" element={<SettingsPage />} />
            <Route path="/settings/:sectionId" element={<Navigate to="/settings" replace />} />
            <Route path="/chat/:chatId" element={<ChatPage />} />
          </Route>
        </Routes>
      </AppDialogProvider>
    </TooltipProvider>
  )
}
