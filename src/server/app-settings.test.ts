import { describe, expect, test } from "bun:test"
import { existsSync, mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { AppSettingsStore } from "./app-settings"

describe("app settings", () => {
  test("exposes and persists the continual learning weights file", () => {
    const homeDir = mkdtempSync(path.join(tmpdir(), "vispark-code-settings-"))
    const settings = new AppSettingsStore()

    settings.initialize(homeDir)

    const snapshot = settings.getSnapshot()
    expect(snapshot.visionApiKey).toBe("")
    expect(snapshot.visionContinualLearningWeightsPath).toBe(
      path.join(homeDir, ".vispark-code", "data", "vision-continual-learning-weights.txt")
    )
    expect(existsSync(snapshot.visionContinualLearningWeightsPath)).toBe(true)

    settings.updateVisionContinualLearningWeights("weights_blob_v1", homeDir)

    expect(settings.readVisionContinualLearningWeights(homeDir)).toBe("weights_blob_v1")
    expect(readFileSync(snapshot.visionContinualLearningWeightsPath, "utf8")).toBe("weights_blob_v1")
  })
})
