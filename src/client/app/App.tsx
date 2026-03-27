import { Navigate, Outlet, Route, Routes, useLocation, useParams } from "react-router-dom"
import { AppDialogProvider } from "../components/ui/app-dialog"
import { TooltipProvider } from "../components/ui/tooltip"
import { VisparkCodeSidebar } from "./VisparkCodeSidebar"
import { ChatPage } from "./ChatPage"
import { LocalProjectsPage } from "./LocalProjectsPage"
import { SettingsPage } from "./SettingsPage"
import { useVisparkCodeState } from "./useVisparkCodeState"

function VisparkCodeLayout() {
  const location = useLocation()
  const params = useParams()
  const state = useVisparkCodeState(params.chatId ?? null)
  const showMobileOpenButton = location.pathname === "/" || location.pathname.startsWith("/settings")

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
        onRemoveProject={(projectId) => {
          void state.handleRemoveProject(projectId)
        }}
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
            <Route path="/settings" element={<Navigate to="/settings/general" replace />} />
            <Route path="/settings/:sectionId" element={<SettingsPage />} />
            <Route path="/chat/:chatId" element={<ChatPage />} />
          </Route>
        </Routes>
      </AppDialogProvider>
    </TooltipProvider>
  )
}
