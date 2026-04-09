import { beforeEach, describe, expect, test } from "bun:test"
import {
  DEFAULT_RIGHT_SIDEBAR_SIZE,
  getDefaultRightSidebarVisibilityState,
  migrateRightSidebarStore,
  RIGHT_SIDEBAR_MIN_WIDTH_PX,
  useRightSidebarStore,
} from "./rightSidebarStore"

const PROJECT_ID = "project-1"

describe("rightSidebarStore", () => {
  beforeEach(() => {
    useRightSidebarStore.setState({ size: DEFAULT_RIGHT_SIDEBAR_SIZE, projects: {} })
  })

  test("defaults to a closed drawer", () => {
    const visibility = useRightSidebarStore.getState().projects[PROJECT_ID] ?? getDefaultRightSidebarVisibilityState()
    expect(visibility.isVisible).toBe(false)
    expect(useRightSidebarStore.getState().size).toBe(DEFAULT_RIGHT_SIDEBAR_SIZE)
  })

  test("exports the expected pixel min width", () => {
    expect(RIGHT_SIDEBAR_MIN_WIDTH_PX).toBe(370)
  })

  test("keeps visibility isolated per project while sharing width", () => {
    useRightSidebarStore.getState().toggleVisibility(PROJECT_ID)
    useRightSidebarStore.getState().setSize(34)
    useRightSidebarStore.getState().toggleVisibility("project-2")

    expect(useRightSidebarStore.getState().projects[PROJECT_ID]).toEqual({
      isVisible: true,
    })
    expect(useRightSidebarStore.getState().projects["project-2"]).toEqual({
      isVisible: true,
    })
    expect(useRightSidebarStore.getState().size).toBe(34)
  })

  test("clamps resized widths", () => {
    useRightSidebarStore.getState().setSize(4)
    expect(useRightSidebarStore.getState().size).toBe(20)

    useRightSidebarStore.getState().setSize(80)
    expect(useRightSidebarStore.getState().size).toBe(80)
  })

  test("clearing a project removes its saved drawer state without resetting global width", () => {
    useRightSidebarStore.getState().toggleVisibility(PROJECT_ID)
    useRightSidebarStore.getState().setSize(42)
    useRightSidebarStore.getState().clearProject(PROJECT_ID)

    const visibility = useRightSidebarStore.getState().projects[PROJECT_ID] ?? getDefaultRightSidebarVisibilityState()
    expect(visibility.isVisible).toBe(false)
    expect(useRightSidebarStore.getState().size).toBe(42)
  })

  test("migration preserves per-project visibility and promotes the first valid project size to global width", async () => {
    const migrated = await migrateRightSidebarStore({
        projects: {
          [PROJECT_ID]: {
            isVisible: true,
            size: 34,
          },
          "project-2": {
            isVisible: false,
            size: 26,
          },
        },
      })

    expect(migrated).toEqual({
      size: 34,
      projects: {
        [PROJECT_ID]: {
          isVisible: true,
        },
        "project-2": {
          isVisible: false,
        },
      },
    })
  })

  test("migration preserves a persisted global size when already present", async () => {
    const migrated = await migrateRightSidebarStore({
      size: 44,
      projects: {
        [PROJECT_ID]: {
          isVisible: true,
          size: 34,
        },
      },
    })

    expect(migrated).toEqual({
      size: 44,
      projects: {
        [PROJECT_ID]: {
          isVisible: true,
        },
      },
    })
  })
})
