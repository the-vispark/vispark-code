export const APP_NAME = "Vispark Code"
export const CLI_COMMAND = "vispark-code"
export const DATA_ROOT_NAME = ".vispark-code"
export const DEV_DATA_ROOT_NAME = ".vispark-code-dev"
export const PACKAGE_NAME = "vispark-code"
// Read version from package.json — JSON import works in both Bun and Vite
import pkg from "../../package.json"
export const SDK_CLIENT_APP = `vispark-code/${pkg.version}`
export const LOG_PREFIX = "[vispark-code]"
export const DEFAULT_NEW_PROJECT_ROOT = `~/${APP_NAME}`

export type RuntimeProfile = "prod" | "dev"

type EnvLike = Record<string, string | undefined>

export function getRuntimeProfile(env: EnvLike = process.env): RuntimeProfile {
  return env.VISPARK_RUNTIME_PROFILE === "dev" || env["VISPARK-CODE_RUNTIME_PROFILE"] === "dev"
    ? "dev"
    : "prod"
}

export function getDataRootName(env: EnvLike = process.env) {
  return getRuntimeProfile(env) === "dev" ? DEV_DATA_ROOT_NAME : DATA_ROOT_NAME
}

export function getDataDir(homeDir: string, env: EnvLike = process.env) {
  return `${homeDir}/${getDataRootName(env)}/data`
}

export function getDataDirDisplay(env: EnvLike = process.env) {
  return `~/${getDataRootName(env)}/data`
}

export function getKeybindingsFilePath(homeDir: string, env: EnvLike = process.env) {
  return `${homeDir}/${getDataRootName(env)}/keybindings.json`
}

export function getKeybindingsFilePathDisplay(env: EnvLike = process.env) {
  return `~/${getDataRootName(env)}/keybindings.json`
}

export function getCliInvocation(arg?: string) {
  return arg ? `${CLI_COMMAND} ${arg}` : CLI_COMMAND
}
