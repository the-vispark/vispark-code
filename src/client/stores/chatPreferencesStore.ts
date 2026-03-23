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
}

type ChatPreferences = {
  vision: ProviderPreference<VisionModelOptions>
}

type PersistedChatPreferencesState = Pick<ChatPreferencesState, "provider" | "planMode" | "preferences">

interface ChatPreferencesState {
  provider: AgentProvider
  planMode: boolean
  preferences: ChatPreferences
  setProvider: (provider: AgentProvider) => void
  setModel: (provider: AgentProvider, model: string) => void
  setModelOptions: <TProvider extends AgentProvider>(
    provider: TProvider,
    modelOptions: Partial<ProviderModelOptionsByProvider[TProvider]>
  ) => void
  setPlanMode: (planMode: boolean) => void
}

function normalizeVisionPreference(value?: {
  model?: string
  modelOptions?: Partial<VisionModelOptions>
}): ProviderPreference<VisionModelOptions> {
  return {
    model: value?.model ?? "vispark/vision-medium",
    modelOptions: {
      ...DEFAULT_VISION_MODEL_OPTIONS,
      ...(value?.modelOptions ?? {}),
    },
  }
}

export const useChatPreferencesStore = create<ChatPreferencesState>()(
  persist(
    (set) => ({
      provider: "vision",
      planMode: false,
      preferences: {
        vision: { model: "vispark/vision-medium", modelOptions: { ...DEFAULT_VISION_MODEL_OPTIONS } },
      },
      setProvider: (provider) => set({ provider }),
      setModel: (provider, model) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            [provider]: {
              ...state.preferences[provider],
              model,
            },
          },
        })),
      setModelOptions: (provider, modelOptions) =>
        set((state) => ({
          preferences: {
            ...state.preferences,
            [provider]: {
              ...state.preferences[provider],
              modelOptions: {
                ...state.preferences[provider].modelOptions,
                ...modelOptions,
              },
            },
          },
        })),
      setPlanMode: (planMode) => set({ planMode }),
    }),
    {
      name: "chat-preferences",
      version: 4,
      migrate: (persistedState) => {
        const state = persistedState as Partial<PersistedChatPreferencesState> | undefined

        return {
          provider: "vision" as const,
          planMode: state?.planMode ?? false,
          preferences: {
            vision: normalizeVisionPreference(
              state?.preferences && "vision" in state.preferences
                ? state.preferences.vision
                : undefined
            ),
          },
        }
      },
    }
  )
)
