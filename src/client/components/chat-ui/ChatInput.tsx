import { forwardRef, memo, useCallback, useEffect, useRef, useState } from "react"
import { ArrowUp, Brain, BrainCircuit, ListTodo, LockOpen, Sparkles, Zap } from "lucide-react"
import {
  type AgentProvider,
  type ModelOptions,
  type ProviderCatalogEntry,
} from "../../../shared/types"
import { Button } from "../ui/button"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"
import { Textarea } from "../ui/textarea"
import { cn } from "../../lib/utils"
import { useIsStandalone } from "../../hooks/useIsStandalone"
import { useChatInputStore } from "../../stores/chatInputStore"
import { useChatPreferencesStore } from "../../stores/chatPreferencesStore"
import { CHAT_INPUT_ATTRIBUTE, focusNextChatInput } from "../../app/chatFocusPolicy"

function PopoverMenuItem({
  onClick,
  selected,
  icon,
  label,
  description,
}: {
  onClick: () => void
  selected: boolean
  icon: React.ReactNode
  label: string
  description?: string
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-2 p-2 border border-border/0 rounded-lg text-left transition-opacity",
        selected ? "bg-muted border-border" : "hover:opacity-60"
      )}
    >
      {icon}
      <div>
        <div className="text-sm font-medium">{label}</div>
        {description ? <div className="text-xs text-muted-foreground">{description}</div> : null}
      </div>
    </button>
  )
}

function InputPopover({
  trigger,
  triggerClassName,
  disabled = false,
  children,
}: {
  trigger: React.ReactNode
  triggerClassName?: string
  disabled?: boolean
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
}) {
  const [open, setOpen] = useState(false)

  if (disabled) {
    return (
      <button
        disabled
        className={cn(
          "flex items-center gap-1.5 px-2 py-1 text-sm rounded-md text-muted-foreground [&>svg]:shrink-0 opacity-70 cursor-default",
          triggerClassName
        )}
      >
        {trigger}
      </button>
    )
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          className={cn(
            "flex items-center gap-1.5 px-2 py-1 text-sm rounded-md transition-colors text-muted-foreground [&>svg]:shrink-0",
            "hover:bg-muted/50",
            triggerClassName
          )}
        >
          {trigger}
        </button>
      </PopoverTrigger>
      <PopoverContent align="center" className="w-64 p-1">
        <div className="space-y-1">{typeof children === "function" ? children(() => setOpen(false)) : children}</div>
      </PopoverContent>
    </Popover>
  )
}

const MODEL_ICON_BY_ID = {
  "vispark/vision-small": Zap,
  "vispark/vision-medium": Sparkles,
  "vispark/vision-large": Brain,
} as const

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
    provider: preferredProvider,
    preferences,
    planMode,
    setModel,
    setModelOptions,
    setPlanMode,
  } = useChatPreferencesStore()
  const [value, setValue] = useState(() => (chatId ? getDraft(chatId) : ""))
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const isStandalone = useIsStandalone()

  const selectedProvider = activeProvider ?? preferredProvider
  const providerConfig = availableProviders.find((provider) => provider.id === selectedProvider) ?? availableProviders[0]
  const providerPrefs = preferences[selectedProvider]
  const showPlanMode = providerConfig?.supportsPlanMode ?? false
  const continualLearning = preferences.vision.modelOptions.continualLearning

  const autoResize = useCallback(() => {
    const element = textareaRef.current
    if (!element) return
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

  useEffect(() => {
    autoResize()
  }, [value, autoResize])

  useEffect(() => {
    window.addEventListener("resize", autoResize)
    return () => window.removeEventListener("resize", autoResize)
  }, [autoResize])

  useEffect(() => {
    textareaRef.current?.focus()
  }, [chatId])

  async function handleSubmit() {
    if (!value.trim()) return
    const nextValue = value

    setValue("")
    if (chatId) clearDraft(chatId)
    if (textareaRef.current) textareaRef.current.style.height = "auto"

    try {
      await onSubmit(nextValue, {
        provider: selectedProvider,
        model: providerPrefs.model,
        modelOptions: { vision: { ...preferences.vision.modelOptions } },
        planMode: showPlanMode ? planMode : false,
      })
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
      setPlanMode(!planMode)
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

  const ModelIcon = MODEL_ICON_BY_ID[providerPrefs.model as keyof typeof MODEL_ICON_BY_ID] ?? Sparkles

  return (
    <div className={cn("p-3 pt-0 md:pb-2", isStandalone && "px-5 pb-5")}>
      {missingVisionApiKey ? (
        <div className="mx-auto mb-3 max-w-[840px] rounded-2xl border border-amber-500/25 bg-amber-500/10 px-4 py-3 text-sm text-amber-950 dark:text-amber-100">
          <span className="font-medium">Vispark Lab API key missing.</span>{" "}
          Add it in{" "}
          <a href="/settings/general" className="underline underline-offset-4 hover:opacity-80">
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

      <div className="flex justify-center items-center gap-0.5 max-w-[840px] mx-auto mt-2 animate-fade-in">
        <button
          type="button"
          className="flex items-center gap-1.5 px-2 py-1 text-sm rounded-md text-muted-foreground"
        >
          <Sparkles className="h-3.5 w-3.5" />
          <span>{providerConfig?.label ?? "Vision"}</span>
        </button>

        <InputPopover
          trigger={
            <>
              <ModelIcon className="h-3.5 w-3.5" />
              <span>{providerConfig.models.find((model) => model.id === providerPrefs.model)?.label ?? providerPrefs.model}</span>
            </>
          }
        >
          {(close) => providerConfig.models.map((model) => {
            const Icon = MODEL_ICON_BY_ID[model.id as keyof typeof MODEL_ICON_BY_ID] ?? Sparkles
            return (
              <PopoverMenuItem
                key={model.id}
                onClick={() => {
                  setModel(selectedProvider, model.id)
                  close()
                }}
                selected={providerPrefs.model === model.id}
                icon={<Icon className="h-4 w-4 text-muted-foreground" />}
                label={model.label}
              />
            )
          })}
        </InputPopover>

        <InputPopover
          trigger={
            <>
              <BrainCircuit className="h-3.5 w-3.5" />
              <span>{continualLearning ? "Learning On" : "Learning Off"}</span>
            </>
          }
          triggerClassName={continualLearning ? "text-emerald-700 dark:text-emerald-300" : undefined}
        >
          {(close) => (
            <>
              <PopoverMenuItem
                onClick={() => {
                  setModelOptions("vision", { continualLearning: true })
                  close()
                }}
                selected={continualLearning}
                icon={<BrainCircuit className="h-4 w-4 text-muted-foreground" />}
                label="Continual Learning"
                description="Learn your coding style and reuse it in future chats"
              />
              <PopoverMenuItem
                onClick={() => {
                  setModelOptions("vision", { continualLearning: false })
                  close()
                }}
                selected={!continualLearning}
                icon={<LockOpen className="h-4 w-4 text-muted-foreground" />}
                label="Learning Off"
                description="Respond normally without updating or using saved learning weights"
              />
            </>
          )}
        </InputPopover>

        {showPlanMode ? (
          <InputPopover
            trigger={
              <>
                {planMode ? <ListTodo className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
                <span>{planMode ? "Plan Mode" : "Full Access"}</span>
              </>
            }
            triggerClassName={planMode ? "text-blue-400 dark:text-blue-300" : undefined}
          >
            {(close) => (
              <>
                <PopoverMenuItem
                  onClick={() => {
                    setPlanMode(false)
                    close()
                  }}
                  selected={!planMode}
                  icon={<LockOpen className="h-4 w-4 text-muted-foreground" />}
                  label="Full Access"
                  description="Execution without approval"
                />
                <PopoverMenuItem
                  onClick={() => {
                    setPlanMode(true)
                    close()
                  }}
                  selected={planMode}
                  icon={<ListTodo className="h-4 w-4 text-muted-foreground" />}
                  label="Plan Mode"
                  description="Review a plan before execution"
                />
              </>
            )}
          </InputPopover>
        ) : null}
      </div>
    </div>
  )
})

export const ChatInput = memo(ChatInputInner)
