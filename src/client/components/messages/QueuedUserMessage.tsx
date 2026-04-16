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
      <div className="flex max-w-[85%] sm:max-w-[80%] flex-col items-end gap-1.5 text-right">
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
          <div className="relative">
            <div className="rounded-[20px] border border-dashed border-border bg-transparent px-3.5 py-1.5 prose prose-sm prose-invert text-primary [&_p]:whitespace-pre-line">
              <Markdown remarkPlugins={[remarkGfm]} components={createMarkdownComponents()}>{message.content}</Markdown>
            </div>
            <Button
              type="button"
              variant="none"
              size="none"
              className="absolute left-0 top-0 !p-0.5 -translate-x-[28%] -translate-y-[28%] rounded-full border bg-background text-muted-foreground hover:text-foreground"
              onClick={onRemove}
              title="Remove queued message"
            >
              <X className="size-3" />
            </Button>
          </div>
        ) : null}
        <div className="flex items-center gap-1 pr-2 text-xs text-muted-foreground">
          <Button
            type="button"
            variant="none"
            size="none"
            className="inline-flex h-auto items-center gap-0.5 p-0 text-xs font-medium text-muted-foreground hover:text-foreground"
            onClick={onSendNow}
          >
            <ArrowUp className="size-3" />
            Send Now
          </Button>
        </div>
      </div>
    </div>
  )
}
