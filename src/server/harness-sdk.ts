import { existsSync } from "node:fs"
import { resolve } from "node:path"
import process from "node:process"
import { fileURLToPath } from "node:url"
import {
  query as sdkQuery,
  type CanUseTool,
  type PermissionResult,
  type Query,
} from "../../vendor/vispark-code-harness/sdk"

const CUSTOM_EXECUTABLE_ENV_VARS = [
  "VISPARK_CODE_HARNESS_EXECUTABLE",
  "VISPARK_CODE_EXECUTABLE",
] as const

const DEFAULT_VENDOR_EXECUTABLE_CANDIDATES = [
  fileURLToPath(new URL("../../vendor/vispark-code-harness/cli.js", import.meta.url)),
] as const

export type { CanUseTool, PermissionResult, Query }

export interface HarnessRuntimeInfo {
  source: "vendor" | "env"
  path: string | null
  exists: boolean
  envVar?: (typeof CUSTOM_EXECUTABLE_ENV_VARS)[number]
}

export function getHarnessRuntimeInfo(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync
): HarnessRuntimeInfo {
  for (const envVar of CUSTOM_EXECUTABLE_ENV_VARS) {
    const configuredPath = env[envVar]?.trim()
    if (!configuredPath) continue

    const absolutePath = resolve(configuredPath)
    return {
      source: "env",
      path: absolutePath,
      exists: exists(absolutePath),
      envVar,
    }
  }

  for (const candidate of DEFAULT_VENDOR_EXECUTABLE_CANDIDATES) {
    if (!exists(candidate)) continue
    return {
      source: "vendor",
      path: candidate,
      exists: true,
    }
  }

  const defaultPath = DEFAULT_VENDOR_EXECUTABLE_CANDIDATES[0]
  return {
    source: "vendor",
    path: defaultPath,
    exists: exists(defaultPath),
  }
}

export function resolveHarnessExecutablePath(
  env: NodeJS.ProcessEnv = process.env,
  exists: (path: string) => boolean = existsSync
) {
  const runtime = getHarnessRuntimeInfo(env, exists)
  return runtime.path ?? undefined
}

export function query(args: Parameters<typeof sdkQuery>[0]): ReturnType<typeof sdkQuery> {
  const pathToHarnessExecutable = resolveHarnessExecutablePath()
  const options = {
    ...args.options,
  } as Record<string, unknown>
  const upstreamExecutableOptionKey = "pathToVisparkCodeExecutable"

  if (pathToHarnessExecutable && !(upstreamExecutableOptionKey in options)) {
    options[upstreamExecutableOptionKey] = pathToHarnessExecutable
  }

  return sdkQuery({
    ...args,
    options: options as NonNullable<Parameters<typeof sdkQuery>[0]["options"]>,
  })
}
