import { create } from "zustand"
import { persist } from "zustand/middleware"

export interface ProjectRightSidebarVisibilityState {
  isVisible: boolean
}

interface RightSidebarState {
  size: number
  projects: Record<string, ProjectRightSidebarVisibilityState>
  toggleVisibility: (projectId: string) => void
  setSize: (size: number) => void
  clearProject: (projectId: string) => void
}

export const RIGHT_SIDEBAR_MIN_SIZE_PERCENT = 20
export const DEFAULT_RIGHT_SIDEBAR_SIZE = 33
export const RIGHT_SIDEBAR_MIN_WIDTH_PX = 370

function clampSize(size: number) {
  if (!Number.isFinite(size)) return DEFAULT_RIGHT_SIDEBAR_SIZE
  return Math.max(RIGHT_SIDEBAR_MIN_SIZE_PERCENT, size)
}

function createDefaultProjectVisibilityState(): ProjectRightSidebarVisibilityState {
  return {
    isVisible: false,
  }
}

function getProjectVisibilityState(
  projects: Record<string, ProjectRightSidebarVisibilityState>,
  projectId: string
): ProjectRightSidebarVisibilityState {
  return projects[projectId] ?? createDefaultProjectVisibilityState()
}

export function migrateRightSidebarStore(persistedState: unknown) {
  if (!persistedState || typeof persistedState !== "object") {
    return { size: DEFAULT_RIGHT_SIDEBAR_SIZE, projects: {} }
  }

  const state = persistedState as {
    size?: number
    projects?: Record<string, Partial<{ isVisible: boolean, size: number }>>
  }
  const globalSize = Number.isFinite(state.size)
    ? clampSize(state.size ?? DEFAULT_RIGHT_SIDEBAR_SIZE)
    : clampSize(
        Object.values(state.projects ?? {}).find((layout) => Number.isFinite(layout.size))?.size
        ?? DEFAULT_RIGHT_SIDEBAR_SIZE
      )
  const projects = Object.fromEntries(
    Object.entries(state.projects ?? {}).map(([projectId, layout]) => [
      projectId,
      {
        isVisible: layout.isVisible ?? false,
      },
    ])
  )

  return { size: globalSize, projects }
}

export const useRightSidebarStore = create<RightSidebarState>()(
  persist(
    (set) => ({
      size: DEFAULT_RIGHT_SIDEBAR_SIZE,
      projects: {},
      toggleVisibility: (projectId) =>
        set((state) => ({
          projects: {
            ...state.projects,
            [projectId]: {
              ...getProjectVisibilityState(state.projects, projectId),
              isVisible: !getProjectVisibilityState(state.projects, projectId).isVisible,
            },
          },
        })),
      setSize: (size) => set({ size: clampSize(size) }),
      clearProject: (projectId) =>
        set((state) => {
          const { [projectId]: _removed, ...rest } = state.projects
          return { projects: rest }
        }),
    }),
    {
      name: "right-sidebar-layouts",
      version: 4,
      migrate: migrateRightSidebarStore,
    }
  )
)

export const DEFAULT_RIGHT_SIDEBAR_VISIBILITY_STATE: ProjectRightSidebarVisibilityState = {
  isVisible: false,
}

export function getDefaultRightSidebarVisibilityState() {
  return {
    ...DEFAULT_RIGHT_SIDEBAR_VISIBILITY_STATE,
  }
}
