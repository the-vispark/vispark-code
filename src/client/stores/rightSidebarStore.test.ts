import { beforeEach, describe, expect, test } from "bun:test"
import { getDefaultProjectRightSidebarLayout, useRightSidebarStore } from "./rightSidebarStore"

const PROJECT_ID = "project-1"

describe("rightSidebarStore", () => {
  beforeEach(() => {
    useRightSidebarStore.setState({ projects: {} })
  })

  test("defaults to an open drawer", () => {
    const layout = useRightSidebarStore.getState().projects[PROJECT_ID] ?? getDefaultProjectRightSidebarLayout()
    expect(layout.isVisible).toBe(true)
    expect(layout.size).toBe(20)
  })

  test("keeps layouts isolated per project", () => {
    useRightSidebarStore.getState().toggleVisibility(PROJECT_ID)
    useRightSidebarStore.getState().setSize(PROJECT_ID, 34)
    useRightSidebarStore.getState().toggleVisibility("project-2")
    useRightSidebarStore.getState().setSize("project-2", 26)

    expect(useRightSidebarStore.getState().projects[PROJECT_ID]).toEqual({
      isVisible: false,
      size: 34,
    })
    expect(useRightSidebarStore.getState().projects["project-2"]).toEqual({
      isVisible: false,
      size: 26,
    })
  })

  test("clamps resized widths", () => {
    useRightSidebarStore.getState().setSize(PROJECT_ID, 4)
    expect(useRightSidebarStore.getState().projects[PROJECT_ID]?.size).toBe(20)

    useRightSidebarStore.getState().setSize(PROJECT_ID, 80)
    expect(useRightSidebarStore.getState().projects[PROJECT_ID]?.size).toBe(50)
  })

  test("clearing a project removes its saved drawer state", () => {
    useRightSidebarStore.getState().toggleVisibility(PROJECT_ID)
    useRightSidebarStore.getState().clearProject(PROJECT_ID)

    const layout = useRightSidebarStore.getState().projects[PROJECT_ID] ?? getDefaultProjectRightSidebarLayout()
    expect(layout.isVisible).toBe(true)
    expect(layout.size).toBe(20)
  })
})
