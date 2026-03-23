import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import path from "node:path"
import type { AppSettingsSnapshot } from "../shared/types"
import { getDataDir } from "../shared/branding"
import { ensureDataDirMigrated } from "./data-dir"

interface StoredSettings {
  visionApiKey?: unknown
}

function settingsFilePath(homeDir = homedir()) {
  return path.join(getDataDir(homeDir), "settings.json")
}

function visionContinualLearningWeightsPath(homeDir = homedir()) {
  return path.join(getDataDir(homeDir), "vision-continual-learning-weights.txt")
}

function createDefaultSettingsSnapshot(homeDir = homedir()): AppSettingsSnapshot {
  return {
    visionApiKey: "",
    visionContinualLearningWeightsPath: visionContinualLearningWeightsPath(homeDir),
  }
}

function normalizeSettings(value: unknown, homeDir = homedir()): AppSettingsSnapshot {
  const record = value && typeof value === "object" ? value as StoredSettings : {}
  return {
    ...createDefaultSettingsSnapshot(homeDir),
    visionApiKey: typeof record.visionApiKey === "string" ? record.visionApiKey : "",
  }
}

export class AppSettingsStore {
  private homeDir = homedir()
  private settings: AppSettingsSnapshot = createDefaultSettingsSnapshot(this.homeDir)

  private ensureWeightsFile(homeDir = this.homeDir) {
    ensureDataDirMigrated(homeDir)
    const filePath = visionContinualLearningWeightsPath(homeDir)
    mkdirSync(path.dirname(filePath), { recursive: true })
    if (!existsSync(filePath)) {
      writeFileSync(filePath, "", "utf8")
    }
    return filePath
  }

  private persistSettings(homeDir = this.homeDir) {
    ensureDataDirMigrated(homeDir)
    const filePath = settingsFilePath(homeDir)
    mkdirSync(path.dirname(filePath), { recursive: true })
    writeFileSync(filePath, JSON.stringify({
      visionApiKey: this.settings.visionApiKey,
    }, null, 2))
  }

  initialize(homeDir = this.homeDir) {
    this.homeDir = homeDir
    ensureDataDirMigrated(homeDir)
    const filePath = settingsFilePath(homeDir)
    mkdirSync(path.dirname(filePath), { recursive: true })
    this.ensureWeightsFile(homeDir)

    try {
      this.settings = normalizeSettings(JSON.parse(readFileSync(filePath, "utf8")), homeDir)
    } catch {
      this.settings = createDefaultSettingsSnapshot(homeDir)
    }
  }

  getSnapshot(): AppSettingsSnapshot {
    this.ensureWeightsFile(this.homeDir)
    return {
      ...this.settings,
      visionContinualLearningWeightsPath: visionContinualLearningWeightsPath(this.homeDir),
    }
  }

  updateVisionApiKey(visionApiKey: string, homeDir = this.homeDir) {
    this.homeDir = homeDir
    this.settings = {
      ...this.getSnapshot(),
      visionApiKey: visionApiKey.trim(),
    }
    this.persistSettings(homeDir)
  }

  readVisionContinualLearningWeights(homeDir = this.homeDir) {
    this.homeDir = homeDir
    const filePath = this.ensureWeightsFile(homeDir)
    try {
      return readFileSync(filePath, "utf8")
    } catch {
      return ""
    }
  }

  updateVisionContinualLearningWeights(weights: string, homeDir = this.homeDir) {
    this.homeDir = homeDir
    const filePath = this.ensureWeightsFile(homeDir)
    writeFileSync(filePath, weights, "utf8")
  }

  reset(homeDir = this.homeDir) {
    this.homeDir = homeDir
    this.settings = createDefaultSettingsSnapshot(homeDir)
    ensureDataDirMigrated(homeDir)
    rmSync(settingsFilePath(homeDir), { force: true })
    rmSync(visionContinualLearningWeightsPath(homeDir), { force: true })
  }
}
