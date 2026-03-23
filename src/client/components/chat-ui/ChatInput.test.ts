import { afterEach, describe, expect, test } from "bun:test"
import { resolvePlanModeState } from "./ChatInput"
import { useChatPreferencesStore } from "../../stores/chatPreferencesStore"

const INITIAL_STATE = useChatPreferencesStore.getInitialState()

afterEach(() => {
  useChatPreferencesStore.setState(INITIAL_STATE)
})

describe("resolvePlanModeState", () => {
  test("updates composer plan mode when the provider is not locked", () => {
    const result = resolvePlanModeState({
      providerLocked: false,
      planMode: true,
      selectedProvider: "vision",
      composerState: INITIAL_STATE.composerState,
      providerDefaults: INITIAL_STATE.providerDefaults,
      lockedComposerState: null,
    })

    expect(result).toEqual({
      composerPlanMode: true,
      lockedComposerState: null,
    })
  })

  test("updates only the locked state when the provider is locked", () => {
    const result = resolvePlanModeState({
      providerLocked: true,
      planMode: true,
      selectedProvider: "vision",
      composerState: {
        provider: "vision",
        model: "vispark/vision-medium",
        modelOptions: { continualLearning: true },
        planMode: false,
      },
      providerDefaults: INITIAL_STATE.providerDefaults,
      lockedComposerState: null,
    })

    expect(result.composerPlanMode).toBe(false)
    expect(result.lockedComposerState).toEqual({
      provider: "vision",
      model: "vispark/vision-medium",
      modelOptions: { continualLearning: true },
      planMode: true,
    })
  })

  test("reuses existing locked state instead of resetting to provider defaults", () => {
    const result = resolvePlanModeState({
      providerLocked: true,
      planMode: false,
      selectedProvider: "vision",
      composerState: {
        provider: "vision",
        model: "vispark/vision-small",
        modelOptions: { continualLearning: false },
        planMode: true,
      },
      providerDefaults: {
        ...INITIAL_STATE.providerDefaults,
        vision: {
          model: "vispark/vision-large",
          modelOptions: { continualLearning: true },
          planMode: true,
        },
      },
      lockedComposerState: {
        provider: "vision",
        model: "vispark/vision-medium",
        modelOptions: { continualLearning: true },
        planMode: true,
      },
    })

    expect(result.composerPlanMode).toBe(true)
    expect(result.lockedComposerState).toEqual({
      provider: "vision",
      model: "vispark/vision-medium",
      modelOptions: { continualLearning: true },
      planMode: false,
    })
  })
})
