import { useState, type ComponentType, type SVGProps } from "react"
import { Brain, BrainCircuit, ListTodo, LockOpen, Sparkles, Zap } from "lucide-react"
import {
  type AgentProvider,
  type ProviderCatalogEntry,
  type VisionModelOptions,
} from "../../../shared/types"
import { cn } from "../../lib/utils"
import { Popover, PopoverContent, PopoverTrigger } from "../ui/popover"

type IconComponent = ComponentType<SVGProps<SVGSVGElement>>

export const PROVIDER_ICONS: Record<AgentProvider, IconComponent> = {
  vision: Sparkles,
}

export const MODEL_ICON_BY_ID: Record<string, typeof Sparkles> = {
  "vispark/vision-small": Zap,
  "vispark/vision-medium": Sparkles,
  "vispark/vision-large": Brain,
}

export function PopoverMenuItem({
  onClick,
  selected,
  icon,
  label,
  description,
  disabled,
}: {
  onClick: () => void
  selected: boolean
  icon: React.ReactNode
  label: React.ReactNode
  description?: string
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "w-full rounded-lg border border-border/0 p-2 text-left transition-opacity",
        "flex items-center gap-2",
        selected ? "border-border bg-muted" : "hover:opacity-60",
        disabled && "cursor-not-allowed opacity-40"
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

export function InputPopover({
  trigger,
  triggerClassName,
  disabled = false,
  showDisabledState = true,
  children,
}: {
  trigger: React.ReactNode
  triggerClassName?: string
  disabled?: boolean
  showDisabledState?: boolean
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
}) {
  const [open, setOpen] = useState(false)

  if (disabled) {
    return (
      <button
        disabled
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground",
          showDisabledState && "opacity-70",
          "[&>svg]:shrink-0 cursor-default [&>span]:whitespace-nowrap",
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
            "flex items-center gap-1.5 rounded-md px-2 py-1 text-sm text-muted-foreground transition-colors",
            "[&>svg]:shrink-0 [&>span]:whitespace-nowrap hover:bg-muted/50",
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

interface ChatPreferenceControlsProps {
  availableProviders: ProviderCatalogEntry[]
  selectedProvider: AgentProvider
  showProviderPicker?: boolean
  providerLocked?: boolean
  model: string
  modelOptions: VisionModelOptions
  onProviderChange?: (provider: AgentProvider) => void
  onModelChange: (provider: AgentProvider, model: string) => void
  onVisionContinualLearningChange: (enabled: boolean) => void
  planMode?: boolean
  onPlanModeChange?: (planMode: boolean) => void
  includePlanMode?: boolean
  className?: string
}

export function ChatPreferenceControls({
  availableProviders,
  selectedProvider,
  showProviderPicker = true,
  providerLocked = false,
  model,
  modelOptions,
  onProviderChange,
  onModelChange,
  onVisionContinualLearningChange,
  planMode = false,
  onPlanModeChange,
  includePlanMode = true,
  className,
}: ChatPreferenceControlsProps) {
  const providerConfig = availableProviders.find((provider) => provider.id === selectedProvider) ?? availableProviders[0]
  const ProviderIcon = PROVIDER_ICONS[selectedProvider]
  const ModelIcon = MODEL_ICON_BY_ID[model] ?? Sparkles
  const showPlanMode = includePlanMode && providerConfig?.supportsPlanMode && onPlanModeChange

  return (
    <div className={cn("flex items-center gap-0.5 md:justify-center", className)}>
      {showProviderPicker ? (
        <InputPopover
          disabled={providerLocked || !onProviderChange}
          showDisabledState={!providerLocked}
          trigger={(
            <>
              <ProviderIcon className="h-3.5 w-3.5" />
              <span>{providerConfig?.label ?? selectedProvider}</span>
            </>
          )}
        >
          {(close) => availableProviders.map((provider) => {
            const Icon = PROVIDER_ICONS[provider.id]
            return (
              <PopoverMenuItem
                key={provider.id}
                onClick={() => {
                  onProviderChange?.(provider.id)
                  close()
                }}
                selected={selectedProvider === provider.id}
                icon={<Icon className="h-4 w-4 text-muted-foreground" />}
                label={provider.label}
              />
            )
          })}
        </InputPopover>
      ) : null}

      <InputPopover
        trigger={(
          <>
            <ModelIcon className="h-3.5 w-3.5" />
            <span>{providerConfig.models.find((candidate) => candidate.id === model)?.label ?? model}</span>
          </>
        )}
      >
        {(close) => providerConfig.models.map((candidate) => {
          const Icon = MODEL_ICON_BY_ID[candidate.id] ?? Sparkles
          return (
            <PopoverMenuItem
              key={candidate.id}
              onClick={() => {
                onModelChange(selectedProvider, candidate.id)
                close()
              }}
              selected={model === candidate.id}
              icon={<Icon className="h-4 w-4 text-muted-foreground" />}
              label={candidate.label}
            />
          )
        })}
      </InputPopover>

      <InputPopover
        trigger={(
          <>
            <BrainCircuit className="h-3.5 w-3.5" />
            <span>{modelOptions.continualLearning ? "Learning On" : "Learning Off"}</span>
          </>
        )}
        triggerClassName={modelOptions.continualLearning ? "text-emerald-700 dark:text-emerald-300" : undefined}
      >
        {(close) => (
          <>
            <PopoverMenuItem
              onClick={() => {
                onVisionContinualLearningChange(true)
                close()
              }}
              selected={modelOptions.continualLearning}
              icon={<BrainCircuit className="h-4 w-4 text-muted-foreground" />}
              label="Continual Learning"
              description="Learn your coding style and reuse it in future chats"
            />
            <PopoverMenuItem
              onClick={() => {
                onVisionContinualLearningChange(false)
                close()
              }}
              selected={!modelOptions.continualLearning}
              icon={<LockOpen className="h-4 w-4 text-muted-foreground" />}
              label="Learning Off"
              description="Respond normally without updating or using saved learning weights"
            />
          </>
        )}
      </InputPopover>
      {showPlanMode ? (
        <InputPopover
          trigger={(
            <>
              {planMode ? <ListTodo className="h-3.5 w-3.5" /> : <LockOpen className="h-3.5 w-3.5" />}
              <span>{planMode ? "Plan Mode" : "Full Access"}</span>
            </>
          )}
          triggerClassName={planMode ? "text-blue-400 dark:text-blue-300" : undefined}
        >
          {(close) => (
            <>
              <PopoverMenuItem
                onClick={() => {
                  onPlanModeChange(false)
                  close()
                }}
                selected={!planMode}
                icon={<LockOpen className="h-4 w-4 text-muted-foreground" />}
                label="Full Access"
                description="Execution without approval"
              />
              <PopoverMenuItem
                onClick={() => {
                  onPlanModeChange(true)
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
  )
}
