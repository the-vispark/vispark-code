import { describe, expect, test } from "bun:test"
import { getHarnessRuntimeInfo, resolveHarnessExecutablePath } from "./harness-sdk"

describe("harness runtime resolution", () => {
  test("prefers explicit environment configuration", () => {
    const runtime = getHarnessRuntimeInfo(
      { VISPARK_CODE_HARNESS_EXECUTABLE: "./vendor/vispark-code-harness/cli.js" },
      () => false
    )

    expect(runtime.source).toBe("env")
    expect(runtime.path).toMatch(/vendor\/vispark-code-harness\/cli\.js$/)
    expect(runtime.exists).toBe(false)
    expect(runtime.envVar).toBe("VISPARK_CODE_HARNESS_EXECUTABLE")
  })

  test("falls back to a vendored harness when present", () => {
    const runtime = getHarnessRuntimeInfo({}, (candidate) => candidate.endsWith("/vendor/vispark-code-harness/cli.js"))

    expect(runtime).toEqual({
      source: "vendor",
      path: expect.stringMatching(/vendor\/vispark-code-harness\/cli\.js$/),
      exists: true,
    })
  })

  test("returns the default vendored path when no override exists", () => {
    const runtime = getHarnessRuntimeInfo({}, () => false)

    expect(runtime).toEqual({
      source: "vendor",
      path: expect.stringMatching(/vendor\/vispark-code-harness\/cli\.js$/),
      exists: false,
    })
    expect(resolveHarnessExecutablePath({}, () => false)).toMatch(/vendor\/vispark-code-harness\/cli\.js$/)
  })
})
