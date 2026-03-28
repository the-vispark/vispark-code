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

type PersistedChatPreferencesState = Pick<
  ChatPreferencesState,
  "defaultProvider" | "providerDefaults" | "composerState" | "transcriptAutoScroll"
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

interface ChatPreferencesState {
  defaultProvider: DefaultProviderPreference
  providerDefaults: ChatProviderPreferences
  composerState: ComposerState
  transcriptAutoScroll: boolean
  setDefaultProvider: (provider: DefaultProviderPreference) => void
  setTranscriptAutoScroll: (enabled: boolean) => void
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
}

export function migrateChatPreferencesState(
  persistedState: Partial<PersistedChatPreferencesState> | undefined
): Pick<ChatPreferencesState, "defaultProvider" | "providerDefaults" | "composerState" | "transcriptAutoScroll"> {
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
    transcriptAutoScroll: persistedState?.transcriptAutoScroll ?? true,
  }
}

export const useChatPreferencesStore = create<ChatPreferencesState>()(
  persist(
    (set) => ({
      defaultProvider: "last_used",
      providerDefaults: createDefaultProviderDefaults(),
      composerState: composerFromProviderDefaults(createDefaultProviderDefaults()),
      transcriptAutoScroll: true,
      setDefaultProvider: (defaultProvider) => set({ defaultProvider }),
      setTranscriptAutoScroll: (transcriptAutoScroll) => set({ transcriptAutoScroll }),
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
              composerState: {
                ...state.composerState,
                modelOptions: { ...state.composerState.modelOptions },
              },
            }
          }

          return {
            composerState: composerFromProviderDefaults(state.providerDefaults),
          }
        }),
    }),
    {
      name: "vispark-chat-preferences",
      version: 2,
      migrate: (persistedState) =>
        migrateChatPreferencesState(persistedState as Partial<PersistedChatPreferencesState> | undefined),
    }
  )
)
