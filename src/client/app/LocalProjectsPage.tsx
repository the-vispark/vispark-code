import { useOutletContext } from "react-router-dom"
import { LocalDev } from "../components/LocalDev"
import type { VisparkCodeState } from "./useVisparkCodeState"

export function LocalProjectsPage() {
  const state = useOutletContext<VisparkCodeState>()

  return (
    <div className="flex-1 flex flex-col min-w-0 relative">
      <LocalDev
        connectionStatus={state.connectionStatus}
        ready={state.localProjectsReady}
        snapshot={state.localProjects}
        startingLocalPath={state.startingLocalPath}
        commandError={state.commandError}
        onOpenProject={state.handleOpenLocalProject}
        onCreateProject={state.handleCreateProject}
        onPickDirectory={state.handlePickDirectory}
      />
    </div>
  )
}
