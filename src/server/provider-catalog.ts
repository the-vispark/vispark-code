import type {
  AgentProvider,
  ModelOptions,
  ProviderCatalogEntry,
  VisionModelOptions,
} from "../shared/types"
import { DEFAULT_VISION_MODEL_OPTIONS, PROVIDERS } from "../shared/types"

export const SERVER_PROVIDERS: ProviderCatalogEntry[] = [...PROVIDERS]

export function getServerProviderCatalog(provider: AgentProvider): ProviderCatalogEntry {
  const entry = SERVER_PROVIDERS.find((candidate) => candidate.id === provider)
  if (!entry) {
    throw new Error(`Unknown provider: ${provider}`)
  }
  return entry
}

export function normalizeServerModel(provider: AgentProvider, model?: string): string {
  const catalog = getServerProviderCatalog(provider)
  if (model && catalog.models.some((candidate) => candidate.id === model)) {
    return model
  }
  return catalog.defaultModel
}

export function normalizeVisionModelOptions(modelOptions?: ModelOptions): VisionModelOptions {
  return {
    ...DEFAULT_VISION_MODEL_OPTIONS,
    ...(modelOptions?.vision ?? {}),
  }
}
