import { afterEach, describe, expect, test } from "bun:test"
import { migrateChatPreferencesState, useChatPreferencesStore } from "./chatPreferencesStore"

const INITIAL_STATE = useChatPreferencesStore.getInitialState()

afterEach(() => {
  useChatPreferencesStore.setState(INITIAL_STATE)
})

describe("migrateChatPreferencesState", () => {
  test("normalizes provider defaults and composer state", () => {
    const migrated = migrateChatPreferencesState({
      defaultProvider: "last_used",
      providerDefaults: {
        vision: {
          model: "vispark/vision-large",
          modelOptions: { continualLearning: false },
          planMode: true,
        },
      },
      composerState: {
        provider: "vision",
        model: "vispark/vision-small",
        modelOptions: { continualLearning: false },
        planMode: false,
      },
    })

    expect(migrated).toEqual({
      defaultProvider: "last_used",
      providerDefaults: {
        vision: {
          model: "vispark/vision-large",
          modelOptions: { continualLearning: false },
          planMode: true,
        },
      },
      composerState: {
        provider: "vision",
        model: "vispark/vision-small",
        modelOptions: { continualLearning: false },
        planMode: false,
      },
    })
  })
})

describe("chat preference store", () => {
  test("editing provider defaults does not change composer state", () => {
    useChatPreferencesStore.getState().setProviderDefaultModel("vision", "vispark/vision-large")
    useChatPreferencesStore.getState().setProviderDefaultModelOptions("vision", {
      continualLearning: false,
    })
    useChatPreferencesStore.getState().setProviderDefaultPlanMode("vision", true)

    const state = useChatPreferencesStore.getState()
    expect(state.providerDefaults.vision).toEqual({
      model: "vispark/vision-large",
      modelOptions: { continualLearning: false },
      planMode: true,
    })
    expect(state.composerState).toEqual(INITIAL_STATE.composerState)
  })

  test("editing composer state does not change provider defaults", () => {
    useChatPreferencesStore.getState().setComposerModel("vispark/vision-small")
    useChatPreferencesStore.getState().setComposerModelOptions({ continualLearning: false })
    useChatPreferencesStore.getState().setComposerPlanMode(true)

    const state = useChatPreferencesStore.getState()
    expect(state.composerState).toEqual({
      provider: "vision",
      model: "vispark/vision-small",
      modelOptions: { continualLearning: false },
      planMode: true,
    })
    expect(state.providerDefaults).toEqual(INITIAL_STATE.providerDefaults)
  })

  test("resetComposerFromProvider copies provider defaults into composer state", () => {
    useChatPreferencesStore.setState({
      ...INITIAL_STATE,
      providerDefaults: {
        ...INITIAL_STATE.providerDefaults,
        vision: {
          model: "vispark/vision-large",
          modelOptions: { continualLearning: false },
          planMode: true,
        },
      },
    })

    useChatPreferencesStore.getState().resetComposerFromProvider("vision")

    expect(useChatPreferencesStore.getState().composerState).toEqual({
      provider: "vision",
      model: "vispark/vision-large",
      modelOptions: { continualLearning: false },
      planMode: true,
    })
  })

  test("initializeComposerForNewChat uses explicit default provider defaults", () => {
    useChatPreferencesStore.setState({
      ...INITIAL_STATE,
      defaultProvider: "vision",
      composerState: {
        provider: "vision",
        model: "vispark/vision-small",
        modelOptions: { continualLearning: false },
        planMode: false,
      },
      providerDefaults: {
        ...INITIAL_STATE.providerDefaults,
        vision: {
          model: "vispark/vision-large",
          modelOptions: { continualLearning: false },
          planMode: true,
        },
      },
    })

    useChatPreferencesStore.getState().initializeComposerForNewChat()

    expect(useChatPreferencesStore.getState().composerState).toEqual({
      provider: "vision",
      model: "vispark/vision-large",
      modelOptions: { continualLearning: false },
      planMode: true,
    })
  })

  test("initializeComposerForNewChat preserves composer state for last used", () => {
    useChatPreferencesStore.setState({
      ...INITIAL_STATE,
      defaultProvider: "last_used",
      composerState: {
        provider: "vision",
        model: "vispark/vision-small",
        modelOptions: { continualLearning: false },
        planMode: true,
      },
    })

    useChatPreferencesStore.getState().initializeComposerForNewChat()

    expect(useChatPreferencesStore.getState().composerState).toEqual({
      provider: "vision",
      model: "vispark/vision-small",
      modelOptions: { continualLearning: false },
      planMode: true,
    })
  })
})
