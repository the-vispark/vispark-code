import { cpSync, existsSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import { DATA_ROOT_NAME, getDataDir } from "../shared/branding"

const LEGACY_DATA_ROOT_NAMES = [[ ".k", "anna" ].join("")] as const

export function getCurrentDataDir(homeDir = homedir()) {
  return getDataDir(homeDir)
}

function getLegacyDataDir(homeDir: string) {
  for (const rootName of LEGACY_DATA_ROOT_NAMES) {
    const candidate = path.join(homeDir, rootName, "data")
    if (existsSync(candidate)) {
      return candidate
    }
  }

  return null
}

export function ensureDataDirMigrated(homeDir = homedir()) {
  const currentDir = getCurrentDataDir(homeDir)
  if (existsSync(currentDir)) {
    return currentDir
  }

  const legacyDir = getLegacyDataDir(homeDir)
  if (legacyDir) {
    mkdirSync(path.dirname(currentDir), { recursive: true })
    cpSync(legacyDir, currentDir, {
      recursive: true,
      force: true,
    })
    return currentDir
  }

  mkdirSync(path.join(homeDir, DATA_ROOT_NAME), { recursive: true })
  return currentDir
}
