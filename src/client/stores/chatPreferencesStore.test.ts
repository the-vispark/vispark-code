import { afterEach, describe, expect, test } from "bun:test"
import {
  DEFAULT_SHOW_TRANSCRIPT_TOC,
  migrateChatPreferencesState,
  NEW_CHAT_COMPOSER_ID,
  useChatPreferencesStore,
} from "./chatPreferencesStore"

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
      transcriptAutoScroll: false,
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
      chatStates: {},
      transcriptAutoScroll: false,
      showTranscriptToc: true,
    })
  })

  test("defaults transcript auto-scroll to enabled for older snapshots", () => {
    const migrated = migrateChatPreferencesState({
      defaultProvider: "last_used",
      providerDefaults: {
        vision: {
          model: "vispark/vision-medium",
          modelOptions: { continualLearning: true },
          planMode: false,
        },
      },
      composerState: {
        provider: "vision",
        model: "vispark/vision-medium",
        modelOptions: { continualLearning: true },
        planMode: false,
      },
    })

    expect(migrated.transcriptAutoScroll).toBe(true)
  })

  test("defaults transcript TOC visibility to enabled for older snapshots", () => {
    const migrated = migrateChatPreferencesState({
      defaultProvider: "last_used",
      providerDefaults: {
        vision: {
          model: "vispark/vision-medium",
          modelOptions: { continualLearning: true },
          planMode: false,
        },
      },
    })

    expect(migrated.showTranscriptToc).toBe(true)
  })
})

describe("chat preference store", () => {
  test("starts with continual learning turned off by default", () => {
    expect(INITIAL_STATE.providerDefaults.vision.modelOptions).toEqual({ continualLearning: false })
    expect(INITIAL_STATE.composerState.modelOptions).toEqual({ continualLearning: false })
  })

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

  test("persisting continual learning preference updates defaults and composer state together", () => {
    useChatPreferencesStore.getState().setVisionContinualLearningPreference(true)

    expect(useChatPreferencesStore.getState().providerDefaults.vision.modelOptions).toEqual({
      continualLearning: true,
    })
    expect(useChatPreferencesStore.getState().composerState.modelOptions).toEqual({
      continualLearning: true,
    })
  })

  test("persisting model preference updates defaults and composer state together", () => {
    useChatPreferencesStore.getState().setVisionModelPreference("vispark/vision-large")

    expect(useChatPreferencesStore.getState().providerDefaults.vision.model).toBe("vispark/vision-large")
    expect(useChatPreferencesStore.getState().composerState.model).toBe("vispark/vision-large")
  })

  test("can update transcript auto-scroll independently", () => {
    useChatPreferencesStore.getState().setTranscriptAutoScroll(false)

    expect(useChatPreferencesStore.getState().transcriptAutoScroll).toBe(false)
  })

  test("defaults transcript TOC visibility to enabled", () => {
    expect(useChatPreferencesStore.getState().showTranscriptToc).toBe(DEFAULT_SHOW_TRANSCRIPT_TOC)
  })

  test("can update transcript TOC visibility independently", () => {
    useChatPreferencesStore.getState().setShowTranscriptToc(false)

    expect(useChatPreferencesStore.getState().showTranscriptToc).toBe(false)
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

  test("initializes per-chat composer state from the current source state", () => {
    const store = useChatPreferencesStore.getState()

    store.setComposerState(NEW_CHAT_COMPOSER_ID, {
      provider: "vision",
      model: "vispark/vision-large",
      modelOptions: { continualLearning: true },
      planMode: true,
    })
    store.initializeComposerForChat("chat-a", {
      sourceState: store.getComposerState(NEW_CHAT_COMPOSER_ID),
    })

    expect(store.getComposerState("chat-a")).toEqual({
      provider: "vision",
      model: "vispark/vision-large",
      modelOptions: { continualLearning: true },
      planMode: true,
    })
  })

  test("keeps composer state isolated per chat", () => {
    const store = useChatPreferencesStore.getState()

    store.setComposerState("chat-a", {
      provider: "vision",
      model: "vispark/vision-small",
      modelOptions: { continualLearning: false },
      planMode: false,
    })
    store.setComposerState("chat-b", {
      provider: "vision",
      model: "vispark/vision-large",
      modelOptions: { continualLearning: true },
      planMode: true,
    })
    store.setChatComposerPlanMode("chat-a", true)

    expect(store.getComposerState("chat-a")).toEqual({
      provider: "vision",
      model: "vispark/vision-small",
      modelOptions: { continualLearning: false },
      planMode: true,
    })
    expect(store.getComposerState("chat-b")).toEqual({
      provider: "vision",
      model: "vispark/vision-large",
      modelOptions: { continualLearning: true },
      planMode: true,
    })
  })
})
