import { create } from "zustand"
import { persist } from "zustand/middleware"

interface ProjectGroupOrderState {
  order: string[]
  setOrder: (order: string[]) => void
}

export const useProjectGroupOrderStore = create<ProjectGroupOrderState>()(
  persist(
    (set) => ({
      order: [],
      setOrder: (order) => set({ order }),
    }),
    {
      name: "project-group-order",
    }
  )
)
