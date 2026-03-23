import { describe, expect, mock, test } from "bun:test"
import { createElement } from "react"
import { renderToStaticMarkup } from "react-dom/server"
import { RightSidebar } from "./RightSidebar"
import type { VisparkCodeSocket } from "../../app/socket"

const socketStub = {
  subscribeFileTree: () => () => {},
  command: async () => {
    throw new Error("Not implemented in SSR test")
  },
} as unknown as VisparkCodeSocket

describe("RightSidebar", () => {
  test("renders the placeholder copy", () => {
    const markup = renderToStaticMarkup(
      createElement(RightSidebar, {
        projectId: null,
        isVisible: true,
        socket: socketStub,
        onOpenFile: async () => {},
        onOpenInFinder: async () => {},
        onClose: () => {},
      })
    )

    expect(markup).toContain("Open a project to browse files.")
  })

  test("renders the close affordance", () => {
    const onClose = mock(() => {})
    const markup = renderToStaticMarkup(
      createElement(RightSidebar, {
        projectId: null,
        isVisible: true,
        socket: socketStub,
        onOpenFile: async () => {},
        onOpenInFinder: async () => {},
        onClose,
      })
    )

    expect(markup).toContain("Close file browser")
  })
})
