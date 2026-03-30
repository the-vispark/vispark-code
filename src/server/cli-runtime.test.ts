import { afterEach, describe, expect, test } from "bun:test"
import { CLI_SUPPRESS_OPEN_ONCE_ENV_VAR } from "./restart"
import { compareVersions, getInstallTarget, parseArgs, runCli } from "./cli-runtime"

afterEach(() => {
  delete process.env[CLI_SUPPRESS_OPEN_ONCE_ENV_VAR]
})

function createDeps(overrides: Partial<Parameters<typeof runCli>[1]> = {}) {
  const calls = {
    startServer: [] as Array<{ port: number; host: string; openBrowser: boolean; share: boolean; strictPort: boolean }>,
    fetchLatestVersion: [] as string[],
    installVersion: [] as Array<{ packageName: string; version: string }>,
    relaunch: [] as Array<{ command: string; args: string[] }>,
    openUrl: [] as string[],
    log: [] as string[],
    warn: [] as string[],
    shareTunnel: [] as string[],
    renderShareQr: [] as string[],
    shareTunnelStops: 0,
  }

  const deps: Parameters<typeof runCli>[1] = {
    version: "0.3.0",
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
      return "0.3.0"
    },
    installVersion: (packageName, version) => {
      calls.installVersion.push({ packageName, version })
      return true
    },
    relaunch: (command, args) => {
      calls.relaunch.push({ command, args })
      return 0
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
    startShareTunnel: async (localUrl) => {
      calls.shareTunnel.push(localUrl)
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
        strictPort: false,
      },
    })
  })

  test("parses strict port mode", () => {
    expect(parseArgs(["--strict-port"])).toEqual({
      kind: "run",
      options: {
        port: 3210,
        host: "127.0.0.1",
        openBrowser: true,
        share: false,
        strictPort: true,
      },
    })
  })

  test("--remote without value binds all interfaces", () => {
    expect(parseArgs(["--remote"])).toEqual({
      kind: "run",
      options: {
        port: 3210,
        host: "0.0.0.0",
        openBrowser: true,
        share: false,
        strictPort: false,
      },
    })
  })

  test("--share enables public sharing", () => {
    expect(parseArgs(["--share"])).toEqual({
      kind: "run",
      options: {
        port: 3210,
        host: "127.0.0.1",
        openBrowser: true,
        share: true,
        strictPort: false,
      },
    })
  })

  test("--host with IP binds to that address", () => {
    expect(parseArgs(["--host", "100.64.0.1"])).toEqual({
      kind: "run",
      options: {
        port: 3210,
        host: "100.64.0.1",
        openBrowser: true,
        share: false,
        strictPort: false,
      },
    })
  })

  test("--host with hostname binds to that name", () => {
    expect(parseArgs(["--host", "dev-box"])).toEqual({
      kind: "run",
      options: {
        port: 3210,
        host: "dev-box",
        openBrowser: true,
        share: false,
        strictPort: false,
      },
    })
  })

  test("--host without a value throws", () => {
    expect(() => parseArgs(["--host"])).toThrow("Missing value for --host")
    expect(() => parseArgs(["--host", "--no-open"])).toThrow("Missing value for --host")
  })

  test("--share is incompatible with --host and --remote", () => {
    expect(() => parseArgs(["--share", "--host", "dev-box"])).toThrow("--share cannot be used with --host")
    expect(() => parseArgs(["--host", "dev-box", "--share"])).toThrow("--share cannot be used with --host")
    expect(() => parseArgs(["--share", "--remote"])).toThrow("--share cannot be used with --remote")
    expect(() => parseArgs(["--remote", "--share"])).toThrow("--share cannot be used with --remote")
  })

  test("returns version and help actions without running startup", () => {
    expect(parseArgs(["--version"])).toEqual({ kind: "version" })
    expect(parseArgs(["--help"])).toEqual({ kind: "help" })
  })
})

describe("compareVersions", () => {
  test("orders semver-like versions", () => {
    expect(compareVersions("0.3.0", "0.3.0")).toBe(0)
    expect(compareVersions("0.3.0", "0.3.1")).toBe(-1)
    expect(compareVersions("1.0.0", "0.9.9")).toBe(1)
  })
})

describe("getInstallTarget", () => {
  test("pins the global upgrade to the published npm package version", () => {
    expect(getInstallTarget("vispark-code", "0.4.0")).toBe("vispark-code@0.4.0")
  })
})

describe("runCli", () => {
  test("skips update checks for --version", async () => {
    const { calls, deps } = createDeps()

    const result = await runCli(["--version"], deps)

    expect(result).toEqual({ kind: "exited", code: 0 })
    expect(calls.fetchLatestVersion).toEqual([])
    expect(calls.startServer).toEqual([])
    expect(calls.log).toEqual(["0.3.0"])
  })

  test("starts normally when no newer version exists", async () => {
    const { calls, deps } = createDeps()

    const result = await runCli(["--port", "4000", "--no-open"], deps)

    expect(result.kind).toBe("started")
    expect(calls.fetchLatestVersion).toEqual(["vispark-code"])
    expect(calls.installVersion).toEqual([])
    expect(calls.relaunch).toEqual([])
    expect(calls.startServer).toEqual([{ port: 4000, host: "127.0.0.1", openBrowser: false, share: false, strictPort: false }])
    expect(calls.openUrl).toEqual([])
  })

  test("fails fast on unsupported Bun versions", async () => {
    const { calls, deps } = createDeps({
      bunVersion: "1.3.1",
    })

    const result = await runCli(["--no-open"], deps)

    expect(result).toEqual({ kind: "exited", code: 1 })
    expect(calls.startServer).toEqual([])
    expect(calls.warn).toContain("[vispark-code] Bun 1.3.5+ is required for the embedded terminal. Current Bun: 1.3.1")
  })

  test("opens the root route in the browser", async () => {
    delete process.env[CLI_SUPPRESS_OPEN_ONCE_ENV_VAR]
    const { calls, deps } = createDeps()

    await runCli(["--port", "4000"], deps)

    expect(calls.openUrl).toEqual(["http://localhost:4000"])
  })

  test("opens browser at hostname when --host <host> is given", async () => {
    delete process.env[CLI_SUPPRESS_OPEN_ONCE_ENV_VAR]
    const { calls, deps } = createDeps()

    await runCli(["--host", "dev-box", "--port", "4000"], deps)

    expect(calls.openUrl).toEqual(["http://dev-box:4000"])
  })

  test("suppresses browser open for a ui-triggered restarted child", async () => {
    process.env[CLI_SUPPRESS_OPEN_ONCE_ENV_VAR] = "1"
    const { calls, deps } = createDeps()

    await runCli(["--port", "4000"], deps)

    expect(calls.openUrl).toEqual([])
  })

  test("starts a share tunnel and prints qr/public/local urls", async () => {
    delete process.env[CLI_SUPPRESS_OPEN_ONCE_ENV_VAR]
    const { calls, deps } = createDeps()

    const result = await runCli(["--share", "--port", "4000"], deps)

    expect(result.kind).toBe("started")
    expect(calls.openUrl).toEqual([])
    expect(calls.shareTunnel).toEqual(["http://localhost:4000"])
    expect(calls.renderShareQr).toEqual(["https://vispark.trycloudflare.com"])
    expect(calls.log).toContain("QR Code:")
    expect(calls.log).toContain("[qr:https://vispark.trycloudflare.com]")
    expect(calls.log).toContain("Public URL:")
    expect(calls.log).toContain("https://vispark.trycloudflare.com")
    expect(calls.log).toContain("Local URL:")
    expect(calls.log).toContain("http://localhost:4000")

    if (result.kind !== "started") {
      throw new Error(`expected started result, got ${result.kind}`)
    }
    await result.stop()
    expect(calls.shareTunnelStops).toBe(1)
  })

  test("uses the actual bound port for --share", async () => {
    const { calls, deps } = createDeps({
      startServer: async (options) => {
        calls.startServer.push(options)
        return {
          port: 4001,
          stop: async () => {},
        }
      },
    })

    const result = await runCli(["--share", "--port", "4000"], deps)

    expect(result.kind).toBe("started")
    expect(calls.shareTunnel).toEqual(["http://localhost:4001"])
  })

  test("fails cleanly when share tunnel startup fails", async () => {
    let serverStopped = false
    const { calls, deps } = createDeps({
      startServer: async (options) => {
        calls.startServer.push(options)
        return {
          port: options.port,
          stop: async () => {
            serverStopped = true
          },
        }
      },
      startShareTunnel: async () => {
        throw new Error("cloudflared unavailable")
      },
    })

    const result = await runCli(["--share"], deps)

    expect(result).toEqual({ kind: "exited", code: 1 })
    expect(serverStopped).toBe(true)
    expect(calls.warn).toContain("[vispark-code] failed to start Cloudflare share tunnel")
    expect(calls.warn).toContain("[vispark-code] cloudflared unavailable")
  })

  test("installs and relaunches when a newer version is available", async () => {
    const { calls, deps } = createDeps({
      fetchLatestVersion: async (packageName) => {
        calls.fetchLatestVersion.push(packageName)
        return "0.4.0"
      },
    })

    const result = await runCli(["--port", "4000", "--no-open"], deps)

    expect(result).toEqual({ kind: "exited", code: 0 })
    expect(calls.installVersion).toEqual([{ packageName: "vispark-code", version: "0.4.0" }])
    expect(calls.relaunch).toEqual([{ command: "vispark-code", args: ["--port", "4000", "--no-open"] }])
    expect(calls.startServer).toEqual([])
  })

  test("falls back to current version when install fails", async () => {
    const { calls, deps } = createDeps({
      fetchLatestVersion: async (packageName) => {
        calls.fetchLatestVersion.push(packageName)
        return "0.4.0"
      },
      installVersion: (packageName, version) => {
        calls.installVersion.push({ packageName, version })
        return false
      },
    })

    const result = await runCli(["--no-open"], deps)

    expect(result.kind).toBe("started")
    expect(calls.installVersion).toEqual([{ packageName: "vispark-code", version: "0.4.0" }])
    expect(calls.relaunch).toEqual([])
    expect(calls.warn).toContain("[vispark-code] update failed, continuing current version")
  })

  test("falls back to current version when the registry check fails", async () => {
    const { calls, deps } = createDeps({
      fetchLatestVersion: async (packageName) => {
        calls.fetchLatestVersion.push(packageName)
        throw new Error("network unavailable")
      },
    })

    const result = await runCli(["--no-open"], deps)

    expect(result.kind).toBe("started")
    expect(calls.installVersion).toEqual([])
    expect(calls.relaunch).toEqual([])
    expect(calls.warn).toContain("[vispark-code] update check failed, continuing current version")
  })

  test("preserves original argv when relaunching", async () => {
    const { calls, deps } = createDeps({
      fetchLatestVersion: async (packageName) => {
        calls.fetchLatestVersion.push(packageName)
        return "0.4.0"
      },
    })

    await runCli(["--port", "4567", "--no-open"], deps)

    expect(calls.relaunch[0]).toEqual({
      command: "vispark-code",
      args: ["--port", "4567", "--no-open"],
    })
  })
})
