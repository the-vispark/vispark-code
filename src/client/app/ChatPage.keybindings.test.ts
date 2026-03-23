import { describe, expect, test } from "bun:test"
import { DEFAULT_KEYBINDINGS, type KeybindingsSnapshot } from "../../shared/types"
import { resolveChatPageKeybindingAction } from "./ChatPage"

const SNAPSHOT: KeybindingsSnapshot = {
  bindings: DEFAULT_KEYBINDINGS,
  warning: null,
  filePathDisplay: "~/.vispark-code/keybindings.json",
}

function createKeyEvent(key: string, modifiers?: Partial<KeyboardEvent>) {
  return {
    key,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    shiftKey: false,
    ...modifiers,
  } as KeyboardEvent
}

describe("resolveChatPageKeybindingAction", () => {
  test("matches the embedded terminal shortcut", () => {
    expect(resolveChatPageKeybindingAction(SNAPSHOT, createKeyEvent("j", { metaKey: true }))).toBe("toggleEmbeddedTerminal")
  })

  test("matches the split terminal shortcut", () => {
    expect(resolveChatPageKeybindingAction(SNAPSHOT, createKeyEvent("/", { metaKey: true }))).toBe("addSplitTerminal")
  })

  test("matches the right sidebar shortcut", () => {
    expect(resolveChatPageKeybindingAction(SNAPSHOT, createKeyEvent("b", { metaKey: true }))).toBe("toggleRightSidebar")
  })

  test("matches the open-in-finder shortcut", () => {
    expect(resolveChatPageKeybindingAction(SNAPSHOT, createKeyEvent("f", { metaKey: true, altKey: true }))).toBe("openInFinder")
  })

  test("matches the open-in-editor shortcut", () => {
    expect(resolveChatPageKeybindingAction(SNAPSHOT, createKeyEvent("o", { metaKey: true, shiftKey: true }))).toBe("openInEditor")
  })

  test("returns null for unrelated shortcuts", () => {
    expect(resolveChatPageKeybindingAction(SNAPSHOT, createKeyEvent("k", { metaKey: true }))).toBeNull()
  })
})
