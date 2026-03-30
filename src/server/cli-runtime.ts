import process from "node:process"
import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import path from "node:path"
import { hasCommand, spawnDetached } from "./process-utils"
import { APP_NAME, CLI_COMMAND, getDataDirDisplay, LOG_PREFIX, PACKAGE_NAME } from "../shared/branding"
import { PROD_SERVER_PORT } from "../shared/ports"
import { CLI_SUPPRESS_OPEN_ONCE_ENV_VAR } from "./restart"
import {
  logShareDetails,
  renderTerminalQr,
  startShareTunnel as startShareTunnelDefault,
  type StartedShareTunnel,
} from "./share"

export interface CliOptions {
  port: number
  host: string
  openBrowser: boolean
  share: boolean
  strictPort: boolean
}

export interface StartedCli {
  kind: "started"
  stop: () => Promise<void>
}

export interface ExitedCli {
  kind: "exited"
  code: number
}

export type CliRunResult = StartedCli | ExitedCli

export interface UpdateInstallAttemptResult {
  ok: boolean
  errorCode: "version_not_live_yet" | "install_failed" | "command_missing" | null
  userTitle: string | null
  userMessage: string | null
}

export interface CliRuntimeDeps {
  version: string
  bunVersion: string
  startServer: (options: CliOptions) => Promise<{ port: number; stop: () => Promise<void> }>
  fetchLatestVersion: (packageName: string) => Promise<string>
  installVersion: (packageName: string, version: string) => boolean
  relaunch: (command: string, args: string[]) => number | null
  openUrl: (url: string) => void
  log: (message: string) => void
  warn: (message: string) => void
  renderShareQr?: (url: string) => Promise<string>
  startShareTunnel?: (localUrl: string) => Promise<StartedShareTunnel>
}

type ParsedArgs =
  | { kind: "run"; options: CliOptions }
  | { kind: "help" }
  | { kind: "version" }

const MINIMUM_BUN_VERSION = "1.3.5"
const INSTALL_REPAIR_ATTEMPTED_ENV_VAR = "VISPARK_CODE_INSTALL_REPAIR_ATTEMPTED"

function getPackageRoot() {
  return path.resolve(import.meta.dir, "..", "..")
}

function hasClientBundle(packageRoot = getPackageRoot()) {
  return existsSync(path.join(packageRoot, "dist", "client", "index.html"))
}

function isSourceCheckout(packageRoot = getPackageRoot()) {
  return existsSync(path.join(packageRoot, ".git"))
}

function maybeRepairMissingClientBundle(argv: string[], deps: CliRuntimeDeps) {
  const packageRoot = getPackageRoot()
  if (hasClientBundle(packageRoot) || isSourceCheckout(packageRoot)) {
    return null
  }

  if (process.env[INSTALL_REPAIR_ATTEMPTED_ENV_VAR] === "1") {
    deps.warn(`${LOG_PREFIX} installed client bundle is still missing after an automatic repair attempt`)
    return null
  }

  deps.warn(`${LOG_PREFIX} installed client bundle is missing, reinstalling ${PACKAGE_NAME}@${deps.version}`)
  if (!deps.installVersion(PACKAGE_NAME, deps.version)) {
    deps.warn(`${LOG_PREFIX} repair install failed, continuing current version`)
    return null
  }

  deps.log(`${LOG_PREFIX} restarting after repair install`)
  process.env[INSTALL_REPAIR_ATTEMPTED_ENV_VAR] = "1"
  const exitCode = deps.relaunch(CLI_COMMAND, argv)
  delete process.env[INSTALL_REPAIR_ATTEMPTED_ENV_VAR]
  if (exitCode === null) {
    deps.warn(`${LOG_PREFIX} restart after repair failed, continuing current version`)
    return null
  }

  return exitCode
}

function printHelp() {
  console.log(`${APP_NAME} — local-only project chat UI

Usage:
  ${CLI_COMMAND} [options]

Options:
  --port <number>      Port to listen on (default: ${PROD_SERVER_PORT})
  --host <host>        Bind to a specific host or IP
  --remote             Shortcut for --host 0.0.0.0
  --strict-port        Fail instead of trying another port
  --no-open            Don't open browser automatically
  --share              Create a public share URL and print a terminal QR code
  --version            Print version and exit
  --help               Show this help message`)
}

export function parseArgs(argv: string[]): ParsedArgs {
  let port = PROD_SERVER_PORT
  let host = "127.0.0.1"
  let openBrowser = true
  let share = false
  let strictPort = false
  let sawHost = false
  let sawRemote = false

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === "--version" || arg === "-v") {
      return { kind: "version" }
    }
    if (arg === "--help" || arg === "-h") {
      return { kind: "help" }
    }
    if (arg === "--port") {
      const next = argv[index + 1]
      if (!next) throw new Error("Missing value for --port")
      port = Number(next)
      index += 1
      continue
    }
    if (arg === "--host") {
      const next = argv[index + 1]
      if (!next || next.startsWith("-")) throw new Error("Missing value for --host")
      if (share) throw new Error("--share cannot be used with --host")
      sawHost = true
      host = next
      index += 1
      continue
    }
    if (arg === "--remote") {
      if (share) throw new Error("--share cannot be used with --remote")
      sawRemote = true
      host = "0.0.0.0"
      continue
    }
    if (arg === "--no-open") {
      openBrowser = false
      continue
    }
    if (arg === "--share") {
      if (sawHost) throw new Error("--share cannot be used with --host")
      if (sawRemote) throw new Error("--share cannot be used with --remote")
      share = true
      continue
    }
    if (arg === "--strict-port") {
      strictPort = true
      continue
    }
    if (!arg.startsWith("-")) throw new Error(`Unexpected positional argument: ${arg}`)
  }

  return {
    kind: "run",
    options: {
      port,
      host,
      openBrowser,
      share,
      strictPort,
    },
  }
}

export function compareVersions(currentVersion: string, latestVersion: string) {
  const currentParts = normalizeVersion(currentVersion)
  const latestParts = normalizeVersion(latestVersion)
  const length = Math.max(currentParts.length, latestParts.length)

  for (let index = 0; index < length; index += 1) {
    const current = currentParts[index] ?? 0
    const latest = latestParts[index] ?? 0
    if (current === latest) continue
    return current < latest ? -1 : 1
  }

  return 0
}

function normalizeVersion(version: string) {
  return version
    .trim()
    .replace(/^v/i, "")
    .split("-")[0]
    .split(".")
    .map((part) => Number.parseInt(part, 10))
    .filter((part) => Number.isFinite(part))
}

async function maybeSelfUpdate(argv: string[], deps: CliRuntimeDeps) {
  if (process.env.VISPARK_CODE_DISABLE_SELF_UPDATE === "1") {
    return null
  }

  deps.log(`${LOG_PREFIX} checking for updates`)

  let latestVersion: string
  try {
    latestVersion = await deps.fetchLatestVersion(PACKAGE_NAME)
  }
  catch (error) {
    deps.warn(`${LOG_PREFIX} update check failed, continuing current version`)
    if (error instanceof Error && error.message) {
      deps.warn(`${LOG_PREFIX} ${error.message}`)
    }
    return null
  }

  if (!latestVersion || compareVersions(deps.version, latestVersion) >= 0) {
    return null
  }

  deps.log(`${LOG_PREFIX} updating to ${latestVersion}`)
  if (!deps.installVersion(PACKAGE_NAME, latestVersion)) {
    deps.warn(`${LOG_PREFIX} update failed, continuing current version`)
    return null
  }

  deps.log(`${LOG_PREFIX} restarting into updated version`)
  const exitCode = deps.relaunch(CLI_COMMAND, argv)
  if (exitCode === null) {
    deps.warn(`${LOG_PREFIX} restart failed, continuing current version`)
    return null
  }

  return exitCode
}

export async function runCli(argv: string[], deps: CliRuntimeDeps): Promise<CliRunResult> {
  const parsedArgs = parseArgs(argv)
  if (parsedArgs.kind === "version") {
    deps.log(deps.version)
    return { kind: "exited", code: 0 }
  }
  if (parsedArgs.kind === "help") {
    printHelp()
    return { kind: "exited", code: 0 }
  }

  if (compareVersions(deps.bunVersion, MINIMUM_BUN_VERSION) < 0) {
    deps.warn(`${LOG_PREFIX} Bun ${MINIMUM_BUN_VERSION}+ is required for the embedded terminal. Current Bun: ${deps.bunVersion}`)
    return { kind: "exited", code: 1 }
  }

  const repairExitCode = maybeRepairMissingClientBundle(argv, deps)
  if (repairExitCode !== null) {
    return { kind: "exited", code: repairExitCode }
  }

  const relaunchExitCode = await maybeSelfUpdate(argv, deps)
  if (relaunchExitCode !== null) {
    return { kind: "exited", code: relaunchExitCode }
  }

  const { port, stop } = await deps.startServer(parsedArgs.options)
  const bindHost = parsedArgs.options.host
  const displayHost = bindHost === "127.0.0.1" || bindHost === "0.0.0.0" ? "localhost" : bindHost
  const url = `http://${bindHost}:${port}`
  const launchUrl = `http://${displayHost}:${port}`
  let shareTunnel: StartedShareTunnel | null = null

  deps.log(`${LOG_PREFIX} listening on ${url}`)
  deps.log(`${LOG_PREFIX} data dir: ${getDataDirDisplay()}`)

  if (parsedArgs.options.share) {
    const localUrl = `http://localhost:${port}`

    try {
      const startShareTunnel = deps.startShareTunnel
        ?? ((shareUrl: string) => startShareTunnelDefault(shareUrl, {
          log: (message) => {
            deps.log(`${LOG_PREFIX} ${message}`)
          },
        }))
      shareTunnel = await startShareTunnel(localUrl)
      await logShareDetails(deps.log, shareTunnel.publicUrl, localUrl, deps.renderShareQr ?? renderTerminalQr)
    } catch (error) {
      await stop()
      deps.warn(`${LOG_PREFIX} failed to start Cloudflare share tunnel`)
      if (error instanceof Error && error.message) {
        deps.warn(`${LOG_PREFIX} ${error.message}`)
      }
      return { kind: "exited", code: 1 }
    }
  }

  const suppressOpenBrowser = process.env[CLI_SUPPRESS_OPEN_ONCE_ENV_VAR] === "1"
  if (parsedArgs.options.openBrowser && !parsedArgs.options.share && !suppressOpenBrowser) {
    deps.openUrl(launchUrl)
  }

  return {
    kind: "started",
    stop: async () => {
      shareTunnel?.stop()
      await stop()
    },
  }
}

export function openUrl(url: string) {
  const platform = process.platform
  if (platform === "darwin") {
    spawnDetached("open", [url])
  } else if (platform === "win32") {
    spawnDetached("cmd", ["/c", "start", "", url])
  } else {
    spawnDetached("xdg-open", [url])
  }
  console.log(`${LOG_PREFIX} opened in default browser`)
}

export async function fetchLatestPackageVersion(_packageName: string) {
  const response = await fetch(`https://registry.npmjs.org/${PACKAGE_NAME}/latest`)
  if (!response.ok) {
    throw new Error(`npm registry fetch returned ${response.status}`)
  }

  const payload = await response.json() as { version?: unknown }
  if (typeof payload.version !== "string" || !payload.version.trim()) {
    throw new Error("npm registry response did not include a version")
  }

  return payload.version
}

export function getInstallTarget(packageName: string, version: string) {
  const normalizedVersion = version.trim()
  return `${packageName}@${normalizedVersion || "latest"}`
}

export function installPackageVersion(packageName: string, version: string) {
  if (!hasCommand("bun")) return false
  // Use an explicit package name and version so global self-updates track the
  // published npm artifact that includes the built client bundle.
  const result = spawnSync("bun", ["install", "-g", "--force", getInstallTarget(packageName, version)], { stdio: "inherit" })
  return result.status === 0
}

export function relaunchCli(command: string, args: string[]) {
  const result = spawnSync(command, args, { stdio: "inherit" })
  if (result.error) return null
  return result.status ?? 0
}
