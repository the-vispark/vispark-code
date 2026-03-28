import { forwardRef, memo, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { ArrowUp } from "lucide-react"
import {
  type AgentProvider,
  type ModelOptions,
  type ProviderCatalogEntry,
  type VisionModelOptions,
} from "../../../shared/types"
import { CHAT_INPUT_ATTRIBUTE, focusNextChatInput } from "../../app/chatFocusPolicy"
import { useIsStandalone } from "../../hooks/useIsStandalone"
import { useChatInputStore } from "../../stores/chatInputStore"
import { type ComposerState, useChatPreferencesStore } from "../../stores/chatPreferencesStore"
import { cn } from "../../lib/utils"
import { Button } from "../ui/button"
import { Textarea } from "../ui/textarea"
import { ChatPreferenceControls } from "./ChatPreferenceControls"

interface Props {
  onSubmit: (
    value: string,
    options?: { provider?: AgentProvider; model?: string; modelOptions?: ModelOptions; planMode?: boolean }
  ) => Promise<void>
  onCancel?: () => void
  disabled: boolean
  canCancel?: boolean
  chatId?: string | null
  activeProvider: AgentProvider | null
  availableProviders: ProviderCatalogEntry[]
  missingVisionApiKey?: boolean
}

function createLockedComposerState(
  _provider: AgentProvider,
  composerState: ComposerState,
  providerDefaults: ReturnType<typeof useChatPreferencesStore.getState>["providerDefaults"]
): ComposerState {
  if (composerState.provider === "vision") {
    return {
      provider: "vision",
      model: composerState.model,
      modelOptions: { ...composerState.modelOptions },
      planMode: composerState.planMode,
    }
  }

  return {
    provider: "vision",
    model: providerDefaults.vision.model,
    modelOptions: { ...providerDefaults.vision.modelOptions },
    planMode: providerDefaults.vision.planMode,
  }
}

export function resolvePlanModeState(args: {
  providerLocked: boolean
  planMode: boolean
  selectedProvider: AgentProvider
  composerState: ComposerState
  providerDefaults: ReturnType<typeof useChatPreferencesStore.getState>["providerDefaults"]
  lockedComposerState: ComposerState | null
}) {
  if (!args.providerLocked) {
    return {
      composerPlanMode: args.planMode,
      lockedComposerState: args.lockedComposerState,
    }
  }

  const nextLockedState = args.lockedComposerState
    ?? createLockedComposerState(args.selectedProvider, args.composerState, args.providerDefaults)

  return {
    composerPlanMode: args.composerState.planMode,
    lockedComposerState: {
      ...nextLockedState,
      planMode: args.planMode,
    } satisfies ComposerState,
  }
}

const ChatInputInner = forwardRef<HTMLTextAreaElement, Props>(function ChatInput({
  onSubmit,
  onCancel,
  disabled,
  canCancel,
  chatId,
  activeProvider,
  availableProviders,
  missingVisionApiKey = false,
}, forwardedRef) {
  const { getDraft, setDraft, clearDraft } = useChatInputStore()
  const {
    composerState,
    providerDefaults,
    setVisionModelPreference,
    setVisionContinualLearningPreference,
    setComposerModelOptions,
    setComposerPlanMode,
    resetComposerFromProvider,
  } = useChatPreferencesStore()
  const [value, setValue] = useState(() => (chatId ? getDraft(chatId) : ""))
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isStandalone = useIsStandalone()
  const [lockedComposerState, setLockedComposerState] = useState<ComposerState | null>(() => (
    activeProvider ? createLockedComposerState(activeProvider, composerState, providerDefaults) : null
  ))

  const providerLocked = activeProvider !== null
  const providerPrefs = providerLocked
    ? lockedComposerState ?? createLockedComposerState(activeProvider, composerState, providerDefaults)
    : composerState
  const selectedProvider = providerLocked ? activeProvider : composerState.provider
  const providerConfig = availableProviders.find((provider) => provider.id === selectedProvider) ?? availableProviders[0]
  const showPlanMode = providerConfig?.supportsPlanMode ?? false

  const autoResize = useCallback(() => {
    const element = textareaRef.current
    if (!element) return
    if (element.value.length === 0) {
      element.style.height = ""
      return
    }
    element.style.height = "auto"
    element.style.height = `${element.scrollHeight}px`
  }, [])

  const setTextareaRefs = useCallback((node: HTMLTextAreaElement | null) => {
    textareaRef.current = node

    if (!forwardedRef) return
    if (typeof forwardedRef === "function") {
      forwardedRef(node)
      return
    }

    forwardedRef.current = node
  }, [forwardedRef])

  useLayoutEffect(() => {
    autoResize()
  }, [value, autoResize])

  useEffect(() => {
    window.addEventListener("resize", autoResize)
    return () => window.removeEventListener("resize", autoResize)
  }, [autoResize])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [chatId])

  useEffect(() => {
    if (activeProvider === null) {
      setLockedComposerState(null)
      return
    }

    setLockedComposerState(createLockedComposerState(activeProvider, composerState, providerDefaults))
  }, [activeProvider, chatId, composerState, providerDefaults])

  function setVisionModelOptions(modelOptions: Partial<VisionModelOptions>) {
    if (providerLocked) {
      setLockedComposerState((current) => {
        const next = current ?? createLockedComposerState(selectedProvider, composerState, providerDefaults)
        return {
          ...next,
          modelOptions: { ...next.modelOptions, ...modelOptions },
        }
      })
    }

    if (typeof modelOptions.continualLearning === "boolean") {
      setVisionContinualLearningPreference(modelOptions.continualLearning)
      return
    }

    if (!providerLocked) {
      setComposerModelOptions(modelOptions)
    }
  }

  function setEffectivePlanMode(planMode: boolean) {
    const nextState = resolvePlanModeState({
      providerLocked,
      planMode,
      selectedProvider,
      composerState,
      providerDefaults,
      lockedComposerState,
    })

    if (nextState.lockedComposerState !== lockedComposerState) {
      setLockedComposerState(nextState.lockedComposerState)
    }
    if (nextState.composerPlanMode !== composerState.planMode) {
      setComposerPlanMode(nextState.composerPlanMode)
    }
  }

  function toggleEffectivePlanMode() {
    setEffectivePlanMode(!providerPrefs.planMode)
  }

  async function handleSubmit() {
    if (!value.trim()) return
    const nextValue = value
    const submitOptions = {
      provider: selectedProvider,
      model: providerPrefs.model,
      modelOptions: { vision: { ...providerPrefs.modelOptions } },
      planMode: showPlanMode ? providerPrefs.planMode : false,
    }

    setValue("")
    if (chatId) clearDraft(chatId)
    if (textareaRef.current) textareaRef.current.style.height = "auto"

    try {
      await onSubmit(nextValue, submitOptions)
    } catch (error) {
      console.error("[ChatInput] Submit failed:", error)
      setValue(nextValue)
      if (chatId) setDraft(chatId, nextValue)
    }
  }

  function handleKeyDown(event: React.KeyboardEvent) {
    if (event.key === "Tab" && !event.shiftKey) {
      event.preventDefault()
      focusNextChatInput(textareaRef.current, document)
      return
    }

    if (event.key === "Tab" && event.shiftKey && showPlanMode) {
      event.preventDefault()
      toggleEffectivePlanMode()
      return
    }

    if (event.key === "Escape" && canCancel) {
      event.preventDefault()
      onCancel?.()
      return
    }

    const isTouchDevice = "ontouchstart" in window || navigator.maxTouchPoints > 0
    if (event.key === "Enter" && !event.shiftKey && !canCancel && !isTouchDevice) {
      event.preventDefault()
      void handleSubmit()
    }
  }

  return (
    <div className={cn("p-3 pt-0 md:pb-2", isStandalone && "px-5 pb-5")}>
      {missingVisionApiKey ? (
        <div className="mx-auto mb-3 max-w-[840px] rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <span className="font-medium">Vispark Lab API key missing.</span>{" "}
          Add it in{" "}
          <a href="/settings" className="underline underline-offset-4 hover:opacity-80">
            Settings
          </a>{" "}
          to start building.
        </div>
      ) : null}

      <div className="flex items-end gap-2 max-w-[840px] mx-auto border dark:bg-card/40 backdrop-blur-lg border-border rounded-[29px] pr-1.5">
        <Textarea
          ref={setTextareaRefs}
          placeholder={missingVisionApiKey ? "Add your Vispark API key to start chatting..." : "Build something..."}
          value={value}
          autoFocus
          {...{ [CHAT_INPUT_ATTRIBUTE]: "" }}
          rows={1}
          onChange={(event) => {
            setValue(event.target.value)
            if (chatId) setDraft(chatId, event.target.value)
            autoResize()
          }}
          onKeyDown={handleKeyDown}
          disabled={disabled || missingVisionApiKey}
          className="flex-1 text-base p-3 md:p-4 pl-4.5 md:pl-6 resize-none max-h-[200px] outline-none bg-transparent border-0 shadow-none"
        />
        <Button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault()
            if (canCancel) {
              onCancel?.()
            } else if (!disabled && !missingVisionApiKey && value.trim()) {
              void handleSubmit()
            }
          }}
          disabled={!canCancel && (disabled || missingVisionApiKey || !value.trim())}
          size="icon"
          className="flex-shrink-0 bg-slate-600 text-white dark:bg-white dark:text-slate-900 rounded-full cursor-pointer h-10 w-10 md:h-11 md:w-11 mb-1 -mr-0.5 md:mr-0 md:mb-1.5 touch-manipulation disabled:bg-white/60 disabled:text-slate-700"
        >
          {canCancel ? (
            <div className="w-3 h-3 md:w-4 md:h-4 rounded-xs bg-current" />
          ) : (
            <ArrowUp className="h-5 w-5 md:h-6 md:w-6" />
          )}
        </Button>
      </div>

      <div
        className={cn(
          "mt-2 overflow-x-auto py-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
          isStandalone && "pb-0"
        )}
      >
        <div className="mx-auto flex min-w-max items-center justify-center px-3">
          <ChatPreferenceControls
            availableProviders={availableProviders}
            selectedProvider={selectedProvider}
            providerLocked={providerLocked}
            model={providerPrefs.model}
            modelOptions={providerPrefs.modelOptions}
            onProviderChange={(provider) => {
              if (providerLocked) return
              resetComposerFromProvider(provider)
            }}
            onModelChange={(_, model) => {
              if (providerLocked) {
                setLockedComposerState((current) => {
                  const next = current ?? createLockedComposerState(selectedProvider, composerState, providerDefaults)
                  return { ...next, model }
                })
                setVisionModelPreference(model)
                return
              }

              setVisionModelPreference(model)
            }}
            onVisionContinualLearningChange={(continualLearning) => {
              setVisionModelOptions({ continualLearning })
            }}
            planMode={providerPrefs.planMode}
            onPlanModeChange={setEffectivePlanMode}
            includePlanMode={showPlanMode}
            className="max-w-[840px] animate-fade-in"
          />
        </div>
      </div>
    </div>
  )
})

export const ChatInput = memo(ChatInputInner)
