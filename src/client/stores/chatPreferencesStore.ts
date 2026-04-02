import { create } from "zustand"
import { persist } from "zustand/middleware"
import {
  DEFAULT_VISION_MODEL_OPTIONS,
  type AgentProvider,
  type ProviderModelOptionsByProvider,
  type VisionModelOptions,
} from "../../shared/types"

export interface ProviderPreference<TModelOptions> {
  model: string
  modelOptions: TModelOptions
  planMode: boolean
}

export type DefaultProviderPreference = "last_used" | AgentProvider

export type ChatProviderPreferences = {
  vision: ProviderPreference<VisionModelOptions>
}

export type ComposerState = {
  provider: "vision"
  model: string
  modelOptions: VisionModelOptions
  planMode: boolean
}

export const NEW_CHAT_COMPOSER_ID = "__new__"
export const DEFAULT_SHOW_TRANSCRIPT_TOC = true

type PersistedChatPreferencesState = Pick<
  ChatPreferencesState,
  "defaultProvider" | "providerDefaults" | "composerState" | "chatStates" | "transcriptAutoScroll" | "showTranscriptToc"
> & Partial<{
  liveProvider: AgentProvider
  livePreferences: ChatProviderPreferences
}>

function normalizeDefaultProvider(value?: string): DefaultProviderPreference {
  return value === "vision" ? "vision" : "last_used"
}

function normalizeVisionPreference(value?: {
  model?: string
  modelOptions?: Partial<VisionModelOptions>
  planMode?: boolean
}): ProviderPreference<VisionModelOptions> {
  return {
    model: value?.model ?? "vispark/vision-medium",
    modelOptions: {
      ...DEFAULT_VISION_MODEL_OPTIONS,
      ...(value?.modelOptions ?? {}),
    },
    planMode: Boolean(value?.planMode),
  }
}

function createDefaultProviderDefaults(): ChatProviderPreferences {
  return {
    vision: normalizeVisionPreference(),
  }
}

function normalizeProviderDefaults(value?: {
  vision?: {
    model?: string
    modelOptions?: Partial<VisionModelOptions>
    planMode?: boolean
  }
}): ChatProviderPreferences {
  return {
    vision: normalizeVisionPreference(value?.vision),
  }
}

function composerFromProviderDefaults(providerDefaults: ChatProviderPreferences): ComposerState {
  const preference = providerDefaults.vision
  return {
    provider: "vision",
    model: preference.model,
    modelOptions: { ...preference.modelOptions },
    planMode: preference.planMode,
  }
}

function normalizeComposerState(
  value: PersistedChatPreferencesState["composerState"] | undefined,
  providerDefaults: ChatProviderPreferences,
  legacyLiveProvider?: AgentProvider,
  legacyLivePreferences?: ChatProviderPreferences
): ComposerState {
  if (value?.provider === "vision") {
    const preference = normalizeVisionPreference(value)
    return {
      provider: "vision",
      model: preference.model,
      modelOptions: preference.modelOptions,
      planMode: preference.planMode,
    }
  }

  if (legacyLiveProvider === "vision") {
    const preference = normalizeVisionPreference(legacyLivePreferences?.vision)
    return {
      provider: "vision",
      model: preference.model,
      modelOptions: preference.modelOptions,
      planMode: preference.planMode,
    }
  }

  return composerFromProviderDefaults(providerDefaults)
}

function cloneComposerState(state: ComposerState): ComposerState {
  return {
    provider: state.provider,
    model: state.model,
    modelOptions: { ...state.modelOptions },
    planMode: state.planMode,
  }
}

function normalizeChatStates(
  value: Record<string, ComposerState> | undefined,
  providerDefaults: ChatProviderPreferences
): Record<string, ComposerState> {
  if (!value) return {}

  return Object.fromEntries(
    Object.entries(value).map(([chatId, composerState]) => [
      chatId,
      normalizeComposerState(composerState, providerDefaults),
    ])
  )
}

function createComposerStateForNewChat(args: {
  defaultProvider: DefaultProviderPreference
  providerDefaults: ChatProviderPreferences
  composerState: ComposerState
  sourceState?: ComposerState | null
}): ComposerState {
  if (args.defaultProvider === "last_used") {
    return cloneComposerState(args.sourceState ?? args.composerState)
  }

  return composerFromProviderDefaults(args.providerDefaults)
}

function getStoredComposerState(
  state: Pick<ChatPreferencesState, "defaultProvider" | "providerDefaults" | "composerState" | "chatStates">,
  chatId: string
): ComposerState {
  if (chatId === NEW_CHAT_COMPOSER_ID) {
    return cloneComposerState(state.composerState)
  }

  const existingState = state.chatStates[chatId]
  if (existingState) {
    return cloneComposerState(existingState)
  }

  return createComposerStateForNewChat({
    defaultProvider: state.defaultProvider,
    providerDefaults: state.providerDefaults,
    composerState: state.composerState,
  })
}

function updateStoredComposerState(
  state: Pick<ChatPreferencesState, "composerState" | "chatStates">,
  chatId: string,
  composerState: ComposerState
) {
  const nextState = cloneComposerState(composerState)

  if (chatId === NEW_CHAT_COMPOSER_ID) {
    return {
      composerState: nextState,
    }
  }

  return {
    chatStates: {
      ...state.chatStates,
      [chatId]: nextState,
    },
  }
}

interface ChatPreferencesState {
  defaultProvider: DefaultProviderPreference
  providerDefaults: ChatProviderPreferences
  composerState: ComposerState
  chatStates: Record<string, ComposerState>
  transcriptAutoScroll: boolean
  showTranscriptToc: boolean
  setDefaultProvider: (provider: DefaultProviderPreference) => void
  setTranscriptAutoScroll: (enabled: boolean) => void
  setShowTranscriptToc: (enabled: boolean) => void
  setProviderDefaultModel: (provider: AgentProvider, model: string) => void
  setVisionModelPreference: (model: string) => void
  setProviderDefaultModelOptions: <TProvider extends AgentProvider>(
    provider: TProvider,
    modelOptions: Partial<ProviderModelOptionsByProvider[TProvider]>
  ) => void
  setVisionContinualLearningPreference: (enabled: boolean) => void
  setProviderDefaultPlanMode: (provider: AgentProvider, planMode: boolean) => void
  setComposerProvider: (provider: AgentProvider) => void
  setComposerModel: (model: string) => void
  setComposerModelOptions: (modelOptions: Partial<VisionModelOptions>) => void
  setComposerPlanMode: (planMode: boolean) => void
  resetComposerFromProvider: (provider: AgentProvider) => void
  initializeComposerForNewChat: () => void
  getComposerState: (chatId: string) => ComposerState
  initializeComposerForChat: (chatId: string, options?: { sourceState?: ComposerState | null }) => void
  setComposerState: (chatId: string, composerState: ComposerState) => void
  setChatComposerProvider: (chatId: string, provider: AgentProvider) => void
  setChatComposerModel: (chatId: string, model: string) => void
  setChatComposerModelOptions: (chatId: string, modelOptions: Partial<VisionModelOptions>) => void
  setChatComposerPlanMode: (chatId: string, planMode: boolean) => void
  resetChatComposerFromProvider: (chatId: string, provider: AgentProvider) => void
}

export function migrateChatPreferencesState(
  persistedState: Partial<PersistedChatPreferencesState> | undefined
): Pick<ChatPreferencesState, "defaultProvider" | "providerDefaults" | "composerState" | "chatStates" | "transcriptAutoScroll" | "showTranscriptToc"> {
  const providerDefaults = normalizeProviderDefaults(persistedState?.providerDefaults)

  return {
    defaultProvider: normalizeDefaultProvider(persistedState?.defaultProvider),
    providerDefaults,
    composerState: normalizeComposerState(
      persistedState?.composerState,
      providerDefaults,
      persistedState?.liveProvider,
      persistedState?.livePreferences
    ),
    chatStates: normalizeChatStates(persistedState?.chatStates, providerDefaults),
    transcriptAutoScroll: persistedState?.transcriptAutoScroll ?? true,
    showTranscriptToc: persistedState?.showTranscriptToc ?? DEFAULT_SHOW_TRANSCRIPT_TOC,
  }
}

export const useChatPreferencesStore = create<ChatPreferencesState>()(
  persist(
    (set, get) => ({
      defaultProvider: "last_used",
      providerDefaults: createDefaultProviderDefaults(),
      composerState: composerFromProviderDefaults(createDefaultProviderDefaults()),
      chatStates: {},
      transcriptAutoScroll: true,
      showTranscriptToc: DEFAULT_SHOW_TRANSCRIPT_TOC,
      setDefaultProvider: (defaultProvider) => set({ defaultProvider }),
      setTranscriptAutoScroll: (transcriptAutoScroll) => set({ transcriptAutoScroll }),
      setShowTranscriptToc: (showTranscriptToc) => set({ showTranscriptToc }),
      setProviderDefaultModel: (_provider, model) =>
        set((state) => ({
          providerDefaults: {
            vision: normalizeVisionPreference({
              ...state.providerDefaults.vision,
              model,
            }),
          },
        })),
      setVisionModelPreference: (model) =>
        set((state) => ({
          providerDefaults: {
            vision: normalizeVisionPreference({
              ...state.providerDefaults.vision,
              model,
            }),
          },
          composerState: {
            ...state.composerState,
            model,
          },
        })),
      setProviderDefaultModelOptions: (_provider, modelOptions) =>
        set((state) => ({
          providerDefaults: {
            vision: normalizeVisionPreference({
              ...state.providerDefaults.vision,
              modelOptions: {
                ...state.providerDefaults.vision.modelOptions,
                ...(modelOptions as Partial<VisionModelOptions>),
              },
            }),
          },
        })),
      setVisionContinualLearningPreference: (enabled) =>
        set((state) => ({
          providerDefaults: {
            vision: normalizeVisionPreference({
              ...state.providerDefaults.vision,
              modelOptions: {
                ...state.providerDefaults.vision.modelOptions,
                continualLearning: enabled,
              },
            }),
          },
          composerState: {
            ...state.composerState,
            modelOptions: {
              ...state.composerState.modelOptions,
              continualLearning: enabled,
            },
          },
        })),
      setProviderDefaultPlanMode: (_provider, planMode) =>
        set((state) => ({
          providerDefaults: {
            vision: {
              ...state.providerDefaults.vision,
              planMode,
            },
          },
        })),
      setComposerProvider: () =>
        set((state) => ({
          composerState: {
            ...state.composerState,
            provider: "vision",
          },
        })),
      setComposerModel: (model) =>
        set((state) => ({
          composerState: {
            ...state.composerState,
            model,
          },
        })),
      setComposerModelOptions: (modelOptions) =>
        set((state) => ({
          composerState: {
            ...state.composerState,
            modelOptions: {
              ...state.composerState.modelOptions,
              ...modelOptions,
            },
          },
        })),
      setComposerPlanMode: (planMode) =>
        set((state) => ({
          composerState: {
            ...state.composerState,
            planMode,
          },
        })),
      resetComposerFromProvider: () =>
        set((state) => ({
          composerState: composerFromProviderDefaults(state.providerDefaults),
        })),
      initializeComposerForNewChat: () =>
        set((state) => {
          if (state.defaultProvider === "last_used") {
            return {
              composerState: cloneComposerState(state.composerState),
            }
          }

          return {
            composerState: composerFromProviderDefaults(state.providerDefaults),
          }
        }),
      getComposerState: (chatId) => getStoredComposerState(get(), chatId),
      initializeComposerForChat: (chatId, options) =>
        set((state) => {
          if (chatId === NEW_CHAT_COMPOSER_ID || state.chatStates[chatId]) {
            return state
          }

          return {
            chatStates: {
              ...state.chatStates,
              [chatId]: createComposerStateForNewChat({
                defaultProvider: state.defaultProvider,
                providerDefaults: state.providerDefaults,
                composerState: state.composerState,
                sourceState: options?.sourceState,
              }),
            },
          }
        }),
      setComposerState: (chatId, composerState) =>
        set((state) => updateStoredComposerState(state, chatId, composerState)),
      setChatComposerProvider: (chatId, _provider) =>
        set((state) => updateStoredComposerState(state, chatId, {
          ...getStoredComposerState(state, chatId),
          provider: "vision",
        })),
      setChatComposerModel: (chatId, model) =>
        set((state) => updateStoredComposerState(state, chatId, {
          ...getStoredComposerState(state, chatId),
          model,
        })),
      setChatComposerModelOptions: (chatId, modelOptions) =>
        set((state) => {
          const composerState = getStoredComposerState(state, chatId)
          return updateStoredComposerState(state, chatId, {
            ...composerState,
            modelOptions: {
              ...composerState.modelOptions,
              ...modelOptions,
            },
          })
        }),
      setChatComposerPlanMode: (chatId, planMode) =>
        set((state) => updateStoredComposerState(state, chatId, {
          ...getStoredComposerState(state, chatId),
          planMode,
        })),
      resetChatComposerFromProvider: (chatId, _provider) =>
        set((state) => updateStoredComposerState(state, chatId, composerFromProviderDefaults(state.providerDefaults))),
    }),
    {
      name: "vispark-chat-preferences",
      version: 3,
      migrate: (persistedState) =>
        migrateChatPreferencesState(persistedState as Partial<PersistedChatPreferencesState> | undefined),
    }
  )
)
