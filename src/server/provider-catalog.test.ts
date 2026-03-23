import { describe, expect, test } from "bun:test"
import { normalizeServerModel, normalizeVisionModelOptions } from "./provider-catalog"

describe("provider catalog normalization", () => {
  test("defaults to the medium Vision model", () => {
    expect(normalizeServerModel("vision", undefined)).toBe("vispark/vision-medium")
  })

  test("preserves supported Vision models", () => {
    expect(normalizeServerModel("vision", "vispark/vision-large")).toBe("vispark/vision-large")
  })

  test("normalizes Vision model options", () => {
    expect(normalizeVisionModelOptions(undefined)).toEqual({ continualLearning: true })
    expect(normalizeVisionModelOptions({ vision: {} })).toEqual({ continualLearning: true })
    expect(normalizeVisionModelOptions({ vision: { continualLearning: false } })).toEqual({ continualLearning: false })
  })
})
