import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { spawnSync } from "node:child_process"
import { homedir } from "node:os"
import path from "node:path"
import { getDataDir, LOG_PREFIX } from "../shared/branding"

const SOURCE_SYNC_FILE = "source-sync.json"
const SOURCE_MIRRORS_DIR = "source-mirrors"
const DEFAULT_SYNC_INTERVAL_MS = 15 * 60 * 1000

type SourceKind = "app" | "runtime"

export interface SourceSyncTarget {
  url: string
  branch: string
  lastCommit?: string
  lastSyncedAt?: number
}

export interface SourceSyncConfig {
  enabled: boolean
  checkIntervalMs: number
  app?: SourceSyncTarget
  runtime?: SourceSyncTarget
}

export interface SourceSyncResult {
  configPath: string
  changedSources: SourceKind[]
  app?: SourceSyncTarget
  runtime?: SourceSyncTarget
}

function dataDir(homeDir = homedir()) {
  return getDataDir(homeDir)
}

function sourceSyncConfigPath(homeDir = homedir()) {
  return path.join(dataDir(homeDir), SOURCE_SYNC_FILE)
}

function sourceMirrorPath(kind: SourceKind, homeDir = homedir()) {
  return path.join(dataDir(homeDir), SOURCE_MIRRORS_DIR, kind)
}

function defaultConfig(): SourceSyncConfig {
  return {
    enabled: true,
    checkIntervalMs: DEFAULT_SYNC_INTERVAL_MS,
  }
}

function runGit(args: string[], cwd?: string) {
  const result = spawnSync("git", args, {
    cwd,
    encoding: "utf8",
  })

  if (result.status !== 0) {
    const detail = result.stderr?.trim() || result.stdout?.trim() || `git ${args.join(" ")} failed`
    throw new Error(detail)
  }

  return result.stdout.trim()
}

function tryGit(args: string[], cwd?: string) {
  try {
    return runGit(args, cwd)
  } catch {
    return null
  }
}

function discoverRemoteUrl(repoPath: string) {
  return tryGit(["remote", "get-url", "origin"], repoPath)
}

function discoverDefaultBranch(repoPath: string) {
  const originHead = tryGit(["symbolic-ref", "--short", "refs/remotes/origin/HEAD"], repoPath)
  if (originHead?.startsWith("origin/")) {
    return originHead.slice("origin/".length)
  }

  return tryGit(["rev-parse", "--abbrev-ref", "HEAD"], repoPath) ?? "main"
}

function parseConfig(value: unknown): SourceSyncConfig {
  const base = defaultConfig()
  if (!value || typeof value !== "object") {
    return base
  }

  const record = value as Record<string, unknown>
  const parseTarget = (candidate: unknown): SourceSyncTarget | undefined => {
    if (!candidate || typeof candidate !== "object") {
      return undefined
    }

    const target = candidate as Record<string, unknown>
    if (typeof target.url !== "string" || !target.url.trim()) {
      return undefined
    }

    return {
      url: target.url.trim(),
      branch: typeof target.branch === "string" && target.branch.trim() ? target.branch.trim() : "main",
      lastCommit: typeof target.lastCommit === "string" ? target.lastCommit : undefined,
      lastSyncedAt: typeof target.lastSyncedAt === "number" ? target.lastSyncedAt : undefined,
    }
  }

  return {
    enabled: typeof record.enabled === "boolean" ? record.enabled : base.enabled,
    checkIntervalMs: typeof record.checkIntervalMs === "number" ? record.checkIntervalMs : base.checkIntervalMs,
    app: parseTarget(record.app),
    runtime: parseTarget(record.runtime),
  }
}

export function loadSourceSyncConfig(homeDir = homedir()) {
  const configPath = sourceSyncConfigPath(homeDir)

  try {
    return parseConfig(JSON.parse(readFileSync(configPath, "utf8")))
  } catch {
    return null
  }
}

export function saveSourceSyncConfig(config: SourceSyncConfig, homeDir = homedir()) {
  const configPath = sourceSyncConfigPath(homeDir)
  mkdirSync(path.dirname(configPath), { recursive: true })
  writeFileSync(configPath, JSON.stringify(config, null, 2))
  return configPath
}

export function ensureSourceSyncConfig(
  homeDir = homedir(),
  projectRoot = path.resolve(import.meta.dir, "..", "..")
) {
  const existing = loadSourceSyncConfig(homeDir)
  if (existing) {
    return {
      config: existing,
      path: sourceSyncConfigPath(homeDir),
    }
  }

  const runtimeRoot = path.join(projectRoot, "vendor", "harness-upstream")
  const config: SourceSyncConfig = {
    ...defaultConfig(),
    app: (() => {
      const url = discoverRemoteUrl(projectRoot)
      if (!url) return undefined
      return {
        url,
        branch: discoverDefaultBranch(projectRoot),
      }
    })(),
    runtime: (() => {
      const url = discoverRemoteUrl(runtimeRoot)
      if (!url) return undefined
      return {
        url,
        branch: discoverDefaultBranch(runtimeRoot),
      }
    })(),
  }

  return {
    config,
    path: saveSourceSyncConfig(config, homeDir),
  }
}

function syncTarget(kind: SourceKind, target: SourceSyncTarget, homeDir = homedir()) {
  const mirrorPath = sourceMirrorPath(kind, homeDir)
  mkdirSync(path.dirname(mirrorPath), { recursive: true })

  if (!tryGit(["rev-parse", "--is-inside-work-tree"], mirrorPath)) {
    runGit(["clone", "--filter=blob:none", "--branch", target.branch, "--single-branch", target.url, mirrorPath])
  } else {
    runGit(["remote", "set-url", "origin", target.url], mirrorPath)
    runGit(["fetch", "origin", target.branch, "--prune"], mirrorPath)
    runGit(["checkout", target.branch], mirrorPath)
    runGit(["reset", "--hard", `origin/${target.branch}`], mirrorPath)
  }

  const nextCommit = runGit(["rev-parse", "HEAD"], mirrorPath)
  const changed = nextCommit !== target.lastCommit

  return {
    ...target,
    lastCommit: nextCommit,
    lastSyncedAt: Date.now(),
    changed,
  }
}

export function syncSources(homeDir = homedir(), projectRoot = path.resolve(import.meta.dir, "..", "..")): SourceSyncResult | null {
  const { config, path: configPath } = ensureSourceSyncConfig(homeDir, projectRoot)
  if (!config.enabled) {
    return null
  }

  const now = Date.now()
  const newestSyncAt = Math.max(config.app?.lastSyncedAt ?? 0, config.runtime?.lastSyncedAt ?? 0)
  if (newestSyncAt > 0 && now - newestSyncAt < config.checkIntervalMs) {
    return {
      configPath,
      changedSources: [],
      app: config.app,
      runtime: config.runtime,
    }
  }

  const changedSources: SourceKind[] = []
  const nextConfig: SourceSyncConfig = {
    ...config,
  }

  if (config.app) {
    const appSync = syncTarget("app", config.app, homeDir)
    nextConfig.app = {
      url: appSync.url,
      branch: appSync.branch,
      lastCommit: appSync.lastCommit,
      lastSyncedAt: appSync.lastSyncedAt,
    }
    if (appSync.changed) {
      changedSources.push("app")
    }
  }

  if (config.runtime) {
    const runtimeSync = syncTarget("runtime", config.runtime, homeDir)
    nextConfig.runtime = {
      url: runtimeSync.url,
      branch: runtimeSync.branch,
      lastCommit: runtimeSync.lastCommit,
      lastSyncedAt: runtimeSync.lastSyncedAt,
    }
    if (runtimeSync.changed) {
      changedSources.push("runtime")
    }
  }

  saveSourceSyncConfig(nextConfig, homeDir)

  return {
    configPath,
    changedSources,
    app: nextConfig.app,
    runtime: nextConfig.runtime,
  }
}

export function clearSourceSyncData(homeDir = homedir()) {
  rmSync(sourceSyncConfigPath(homeDir), { force: true })
  rmSync(path.join(dataDir(homeDir), SOURCE_MIRRORS_DIR), { recursive: true, force: true })
}

let backgroundSyncPromise: Promise<void> | null = null

export function startBackgroundSourceSync(homeDir = homedir(), projectRoot = path.resolve(import.meta.dir, "..", "..")) {
  if (process.env.VISPARK_CODE_DISABLE_SOURCE_SYNC === "1") {
    return
  }

  if (backgroundSyncPromise) {
    return
  }

  backgroundSyncPromise = Promise.resolve()
    .then(() => {
      const result = syncSources(homeDir, projectRoot)
      if (!result) {
        return
      }

      if (result.changedSources.length > 0) {
        console.log(`${LOG_PREFIX} refreshed hidden source mirrors: ${result.changedSources.join(", ")}`)
      }
    })
    .catch((error: unknown) => {
      if (error instanceof Error && error.message) {
        console.warn(`${LOG_PREFIX} source sync skipped: ${error.message}`)
      }
    })
    .finally(() => {
      backgroundSyncPromise = null
    })
}
