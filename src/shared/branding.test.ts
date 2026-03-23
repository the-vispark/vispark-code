import { describe, expect, test } from "bun:test"
import {
  getDataDir,
  getDataDirDisplay,
  getDataRootName,
  getKeybindingsFilePath,
  getKeybindingsFilePathDisplay,
  getRuntimeProfile,
} from "./branding"

describe("runtime profile helpers", () => {
  test("defaults to the prod profile when unset", () => {
    expect(getRuntimeProfile({})).toBe("prod")
    expect(getDataRootName({})).toBe(".vispark-code")
    expect(getDataDir("/tmp/home", {})).toBe("/tmp/home/.vispark-code/data")
    expect(getDataDirDisplay({})).toBe("~/.vispark-code/data")
    expect(getKeybindingsFilePath("/tmp/home", {})).toBe("/tmp/home/.vispark-code/keybindings.json")
    expect(getKeybindingsFilePathDisplay({})).toBe("~/.vispark-code/keybindings.json")
  })

  test("switches to dev paths for the dev profile", () => {
    const env = { VISPARK_RUNTIME_PROFILE: "dev" }

    expect(getRuntimeProfile(env)).toBe("dev")
    expect(getDataRootName(env)).toBe(".vispark-code-dev")
    expect(getDataDir("/tmp/home", env)).toBe("/tmp/home/.vispark-code-dev/data")
    expect(getDataDirDisplay(env)).toBe("~/.vispark-code-dev/data")
    expect(getKeybindingsFilePath("/tmp/home", env)).toBe("/tmp/home/.vispark-code-dev/keybindings.json")
    expect(getKeybindingsFilePathDisplay(env)).toBe("~/.vispark-code-dev/keybindings.json")
  })

  test("accepts the underscore compatibility alias", () => {
    const env = { VISPARK_CODE_RUNTIME_PROFILE: "dev" }

    expect(getRuntimeProfile(env)).toBe("dev")
    expect(getDataRootName(env)).toBe(".vispark-code-dev")
  })

  test("accepts the hyphenated compatibility alias without throwing", () => {
    const env = { "VISPARK-CODE_RUNTIME_PROFILE": "dev" }

    expect(getRuntimeProfile(env)).toBe("dev")
    expect(getDataRootName(env)).toBe(".vispark-code-dev")
  })
})
