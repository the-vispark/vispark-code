import { describe, expect, test } from "bun:test"
import { parseLocalFileLink } from "./pathUtils"

describe("parseLocalFileLink", () => {
  test("parses an absolute file path with a line fragment", () => {
    expect(parseLocalFileLink("/Users/jake/Projects/vispark-code/src/app.ts#L12")).toEqual({
      path: "/Users/jake/Projects/vispark-code/src/app.ts",
      line: 12,
      column: undefined,
    })
  })

  test("parses an absolute file path without a fragment", () => {
    expect(parseLocalFileLink("/Users/jake/Projects/vispark-code/src/app.ts")).toEqual({
      path: "/Users/jake/Projects/vispark-code/src/app.ts",
    })
  })

  test("parses an absolute file path with a line suffix", () => {
    expect(parseLocalFileLink("/Users/jake/Projects/vispark-code/src/app.ts:42")).toEqual({
      path: "/Users/jake/Projects/vispark-code/src/app.ts",
      line: 42,
      column: undefined,
    })
  })

  test("parses an absolute file path with line and column suffixes", () => {
    expect(parseLocalFileLink("/Users/jake/Projects/vispark-code/src/app.ts:42:5")).toEqual({
      path: "/Users/jake/Projects/vispark-code/src/app.ts",
      line: 42,
      column: 5,
    })
  })

  test("parses same-origin absolute file urls with a line suffix", () => {
    const originalWindow = globalThis.window
    Object.defineProperty(globalThis, "window", {
      value: {
        location: {
          origin: "http://localhost:9000",
        },
      },
      configurable: true,
    })

    try {
      expect(parseLocalFileLink("http://localhost:9000/Users/jake/Projects/vispark-code/src/app.ts:42")).toEqual({
        path: "/Users/jake/Projects/vispark-code/src/app.ts",
        line: 42,
        column: undefined,
      })
    } finally {
      Object.defineProperty(globalThis, "window", {
        value: originalWindow,
        configurable: true,
      })
    }
  })

  test("does not treat web links as local file links", () => {
    expect(parseLocalFileLink("https://example.com")).toBeNull()
  })
})
