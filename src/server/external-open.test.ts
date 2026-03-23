import { describe, expect, test } from "bun:test"
import { buildEditorCommand, tokenizeCommandTemplate } from "./external-open"

describe("tokenizeCommandTemplate", () => {
  test("keeps quoted arguments together", () => {
    expect(tokenizeCommandTemplate('code --reuse-window "{path}"')).toEqual([
      "code",
      "--reuse-window",
      "{path}",
    ])
  })
})

describe("buildEditorCommand", () => {
  test("builds a preset goto command for file links", () => {
    expect(
      buildEditorCommand({
        localPath: "/Users/jake/Projects/vispark-code/src/client/app/App.tsx",
        isDirectory: false,
        line: 12,
        column: 3,
        editor: { preset: "vscode", commandTemplate: "code {path}" },
        platform: "linux",
      })
    ).toEqual({
      command: "code",
      args: ["--goto", "/Users/jake/Projects/vispark-code/src/client/app/App.tsx:12:3"],
    })
  })

  test("builds a preset project command for directory opens", () => {
    expect(
      buildEditorCommand({
        localPath: "/Users/jake/Projects/vispark-code",
        isDirectory: true,
        editor: { preset: "cursor", commandTemplate: "cursor {path}" },
        platform: "linux",
      })
    ).toEqual({
      command: "cursor",
      args: ["/Users/jake/Projects/vispark-code"],
    })
  })

  test("builds a mac app fallback goto command with --args", () => {
    expect(
      buildEditorCommand({
        localPath: "/Users/jake/.vispark-code/data/vision-continual-learning-weights.txt",
        isDirectory: false,
        line: 1,
        column: 1,
        editor: { preset: "cursor", commandTemplate: "cursor {path}" },
        platform: "darwin",
        resolveExecutable: () => ({ command: "open", args: ["-a", "Cursor"] }),
      })
    ).toEqual({
      command: "open",
      args: [
        "-a",
        "Cursor",
        "--args",
        "--goto",
        "/Users/jake/.vispark-code/data/vision-continual-learning-weights.txt:1:1",
      ],
    })
  })

  test("uses the custom template for editor opens", () => {
    expect(
      buildEditorCommand({
        localPath: "/Users/jake/Projects/vispark-code/src/client/app/App.tsx",
        isDirectory: false,
        line: 12,
        column: 1,
        editor: { preset: "custom", commandTemplate: 'my-editor "{path}" --line {line}' },
        platform: "linux",
      })
    ).toEqual({
      command: "my-editor",
      args: ["/Users/jake/Projects/vispark-code/src/client/app/App.tsx", "--line", "12"],
    })
  })
})
