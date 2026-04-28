import Markdown from "react-markdown"
import remarkGfm from "remark-gfm"
import { ArrowUp, X } from "lucide-react"
import type { QueuedChatMessage } from "../../../shared/types"
import { Button } from "../ui/button"
import { createMarkdownComponents } from "./shared"

interface QueuedUserMessageProps {
  message: QueuedChatMessage
  onRemove: () => void
  onSendNow: () => void
}

export function QueuedUserMessage({ message, onRemove, onSendNow }: QueuedUserMessageProps) {
  return (
    <div className="flex justify-end py-2">
      <div className="flex max-w-[85%] sm:max-w-[80%] flex-col items-end gap-1.5">
        {message.attachments.length > 0 ? (
          <div className="flex flex-wrap justify-end gap-2">
            {message.attachments.map((attachment) => (
              <div
                key={attachment.id}
                className="max-w-[220px] rounded-xl border border-dashed border-border bg-transparent px-3 py-2 text-left"
              >
                <div className="truncate text-[13px] font-medium text-foreground">{attachment.displayName}</div>
                <div className="truncate text-[11px] text-muted-foreground">{attachment.mimeType}</div>
              </div>
            ))}
          </div>
        ) : null}
        {message.content ? (
          <div className="group relative">
            <div className="grid grid-cols-[1fr_auto] items-end gap-2.5 rounded-[20px] border border-dashed border-border bg-transparent py-1.5 pl-3.5 pr-1.5 prose prose-sm prose-invert text-left text-primary [&_p]:whitespace-pre-line">
              <div>
                <Markdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents()}>
                  {message.content}
                </Markdown>
              </div>
              <Button
                type="button"
                variant="default"
                size="none"
                className="size-[24px] rounded-full border border-primary/10 bg-muted text-muted-foreground group-hover:!text-primary hover:bg-muted/60"
                onClick={onSendNow}
                title="Send queued message now"
              >
                <ArrowUp className="size-3.5" />
              </Button>
            </div>
            <Button
              type="button"
              variant="none"
              size="none"
              className="absolute top-0 left-0 gap-0.5 rounded-full border bg-background !p-0.5 text-xs font-medium text-muted-foreground opacity-0 -translate-x-[28%] -translate-y-[28%] scale-[0.1] group-hover:scale-100 group-hover:opacity-100 hover:text-foreground"
              onClick={onRemove}
              title="Remove queued message"
            >
              <X className="size-3" />
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  )
}
