import { afterEach, describe, expect, test } from "bun:test"
import { CLI_SUPPRESS_OPEN_ONCE_ENV_VAR } from "./restart"
import { compareVersions, getInstallTarget, parseArgs, runCli } from "./cli-runtime"

afterEach(() => {
  delete process.env[CLI_SUPPRESS_OPEN_ONCE_ENV_VAR]
})

function createInstallResult(ok = true) {
  return {
    ok,
    errorCode: ok ? null : "install_failed",
    userTitle: ok ? null : "Update failed",
    userMessage: ok ? null : "Install failed",
  } as const
}

function createDeps(overrides: Partial<Parameters<typeof runCli>[1]> = {}) {
  const calls = {
    startServer: [] as Array<{
      port: number
      host: string
      openBrowser: boolean
      share: false | "quick" | { kind: "token"; token: string }
      password: string | null
      strictPort: boolean
      trustProxy?: boolean
      update: {
        version: string
        argv: string[]
        command: string
      }
    }>,
    fetchLatestVersion: [] as string[],
    installVersion: [] as Array<{ packageName: string; version: string }>,
    openUrl: [] as string[],
    log: [] as string[],
    warn: [] as string[],
    shareTunnel: [] as Array<{ localUrl: string; shareMode: "quick" | { kind: "token"; token: string } }>,
    renderShareQr: [] as string[],
    shareTunnelStops: 0,
  }

  const deps: Parameters<typeof runCli>[1] = {
    version: "1.0.0",
    bunVersion: "1.3.10",
    startServer: async (options) => {
      calls.startServer.push(options)
      return {
        port: options.port,
        stop: async () => {},
      }
    },
    fetchLatestVersion: async (packageName) => {
      calls.fetchLatestVersion.push(packageName)
      return "1.0.0"
    },
    installVersion: (packageName, version) => {
      calls.installVersion.push({ packageName, version })
      return createInstallResult(true)
    },
    openUrl: (url) => {
      calls.openUrl.push(url)
    },
    log: (message) => {
      calls.log.push(message)
    },
    warn: (message) => {
      calls.warn.push(message)
    },
    renderShareQr: async (url) => {
      calls.renderShareQr.push(url)
      return `[qr:${url}]`
    },
    startShareTunnel: async (localUrl, shareMode) => {
      calls.shareTunnel.push({ localUrl, shareMode })
      return {
        publicUrl: "https://vispark.trycloudflare.com",
        stop: () => {
          calls.shareTunnelStops += 1
        },
      }
    },
    ...overrides,
  }

  return { calls, deps }
}

describe("parseArgs", () => {
  test("parses runtime options", () => {
    expect(parseArgs(["--port", "4000", "--no-open"])).toEqual({
      kind: "run",
      options: {
        port: 4000,
        host: "127.0.0.1",
        openBrowser: false,
        share: false,
        password: null,
        strictPort: false,
      },
    })
  })

  test("parses share, cloudflared, and password options", () => {
    expect(parseArgs(["--share"])).toEqual({
      kind: "run",
      options: {
        port: 3210,
        host: "127.0.0.1",
        openBrowser: true,
        share: "quick",
        password: null,
        strictPort: false,
      },
    })

    expect(parseArgs(["--cloudflared", "secret-token", "--password", "secret"])).toEqual({
      kind: "run",
      options: {
        port: 3210,
        host: "127.0.0.1",
        openBrowser: true,
        share: { kind: "token", token: "secret-token" },
        password: "secret",
        strictPort: false,
      },
    })
  })

  test("rejects invalid host/share combinations", () => {
    expect(() => parseArgs(["--share", "--host", "dev-box"])).toThrow("--share cannot be used with --host")
    expect(() => parseArgs(["--cloudflared", "secret-token", "--remote"])).toThrow("--cloudflared cannot be used with --remote")
    expect(() => parseArgs(["--password"])).toThrow("Missing value for --password")
  })
})

describe("compareVersions", () => {
  test("orders semver-like versions", () => {
    expect(compareVersions("1.0.0", "1.0.0")).toBe(0)
    expect(compareVersions("1.0.0", "1.0.1")).toBe(-1)
    expect(compareVersions("1.2.0", "1.1.9")).toBe(1)
  })
})

describe("getInstallTarget", () => {
  test("pins the global install target", () => {
    expect(getInstallTarget("vispark-code", "1.2.0")).toBe("vispark-code@1.2.0")
  })
})

describe("runCli", () => {
  test("returns version output without starting the server", async () => {
    const { calls, deps } = createDeps()

    const result = await runCli(["--version"], deps)

    expect(result).toEqual({ kind: "exited", code: 0 })
    expect(calls.startServer).toEqual([])
    expect(calls.log).toEqual(["1.0.0"])
  })

  test("starts normally when no update is available", async () => {
    const { calls, deps } = createDeps()

    const result = await runCli(["--port", "4000", "--no-open"], deps)

    expect(result.kind).toBe("started")
    expect(calls.fetchLatestVersion).toEqual(["vispark-code"])
    expect(calls.installVersion).toEqual([])
    expect(calls.startServer).toHaveLength(1)
    expect(calls.startServer[0]).toMatchObject({
      port: 4000,
      host: "127.0.0.1",
      openBrowser: false,
      share: false,
      password: null,
      strictPort: false,
      trustProxy: false,
      update: {
        version: "1.0.0",
        argv: ["--port", "4000", "--no-open"],
        command: "vispark-code",
      },
    })
  })

  test("fails fast on unsupported Bun versions", async () => {
    const { calls, deps } = createDeps({ bunVersion: "1.3.1" })

    const result = await runCli(["--no-open"], deps)

    expect(result).toEqual({ kind: "exited", code: 1 })
    expect(calls.startServer).toEqual([])
    expect(calls.warn).toContain("[vispark-code] Bun 1.3.5+ is required for the embedded terminal. Current Bun: 1.3.1")
  })

  test("opens the browser for local runs", async () => {
    const { calls, deps } = createDeps()

    await runCli(["--port", "4000"], deps)

    expect(calls.openUrl).toEqual(["http://localhost:4000"])
  })

  test("starts a quick share tunnel and prints QR details", async () => {
    const { calls, deps } = createDeps()

    const result = await runCli(["--share", "--port", "4000"], deps)

    expect(result.kind).toBe("started")
    expect(calls.openUrl).toEqual([])
    expect(calls.startServer[0]?.trustProxy).toBe(true)
    expect(calls.shareTunnel).toEqual([{ localUrl: "http://localhost:4000", shareMode: "quick" }])
    expect(calls.renderShareQr).toEqual(["https://vispark.trycloudflare.com"])
    expect(calls.log).toContain("QR Code:")
    expect(calls.log).toContain("https://vispark.trycloudflare.com")

    if (result.kind === "started") {
      await result.stop()
    }
    expect(calls.shareTunnelStops).toBe(1)
  })

  test("keeps running when a named tunnel has no discovered public hostname", async () => {
    const { calls, deps } = createDeps({
      startShareTunnel: async (localUrl, shareMode) => {
        calls.shareTunnel.push({ localUrl, shareMode })
        return {
          publicUrl: null,
          stop: () => {
            calls.shareTunnelStops += 1
          },
        }
      },
    })

    const result = await runCli(["--cloudflared", "secret-token"], deps)

    expect(result.kind).toBe("started")
    expect(calls.startServer[0]?.trustProxy).toBe(true)
    expect(calls.shareTunnel).toEqual([{
      localUrl: "http://localhost:3210",
      shareMode: { kind: "token", token: "secret-token" },
    }])
    expect(calls.warn).toContain("[vispark-code] named tunnel started but no public hostname was detected")
    expect(calls.warn).toContain("[vispark-code] use the hostname configured for the provided Cloudflare tunnel token")
    expect(calls.renderShareQr).toEqual([])
  })

  test("returns restarting when a newer version is available", async () => {
    const { calls, deps } = createDeps({
      fetchLatestVersion: async (packageName) => {
        calls.fetchLatestVersion.push(packageName)
        return "1.1.0"
      },
    })

    const result = await runCli(["--port", "4000", "--no-open"], deps)

    expect(result).toEqual({ kind: "restarting", reason: "startup_update" })
    expect(calls.installVersion).toEqual([{ packageName: "vispark-code", version: "1.1.0" }])
    expect(calls.startServer).toEqual([])
  })

  test("falls back to the current version when install fails", async () => {
    const { calls, deps } = createDeps({
      fetchLatestVersion: async (packageName) => {
        calls.fetchLatestVersion.push(packageName)
        return "1.1.0"
      },
      installVersion: (packageName, version) => {
        calls.installVersion.push({ packageName, version })
        return createInstallResult(false)
      },
    })

    const result = await runCli(["--no-open"], deps)

    expect(result.kind).toBe("started")
    expect(calls.installVersion).toEqual([{ packageName: "vispark-code", version: "1.1.0" }])
    expect(calls.warn).toContain("[vispark-code] update failed, continuing current version")
  })
})
