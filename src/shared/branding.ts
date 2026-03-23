export const APP_NAME = "Vispark Code"
export const CLI_COMMAND = "vispark-code"
export const DATA_ROOT_NAME = ".vispark-code"
export const PACKAGE_NAME = "vispark-code"
// Read version from package.json — JSON import works in both Bun and Vite
import pkg from "../../package.json"
export const SDK_CLIENT_APP = `vispark-code/${pkg.version}`
export const LOG_PREFIX = "[vispark-code]"
export const DEFAULT_NEW_PROJECT_ROOT = `~/${APP_NAME}`

export function getDataRootName() {
  return DATA_ROOT_NAME
}

export function getDataDir(homeDir: string) {
  return `${homeDir}/${DATA_ROOT_NAME}/data`
}

export function getDataDirDisplay() {
  return `~/${DATA_ROOT_NAME.slice(1)}/data`
}

export function getCliInvocation(arg?: string) {
  return arg ? `${CLI_COMMAND} ${arg}` : CLI_COMMAND
}
