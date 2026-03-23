import type { ReactNode } from "react"
import { Trash2 } from "lucide-react"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "../../ui/context-menu"

export function ProjectSectionMenu({
  onRemove,
  children,
}: {
  onRemove: () => void
  children: ReactNode
}) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem
          onSelect={(event) => {
            event.stopPropagation()
            onRemove()
          }}
          className="text-destructive dark:text-blue-400 hover:bg-destructive/10 focus:bg-destructive/10 dark:hover:bg-blue-500/20 dark:focus:bg-blue-500/20"
        >
          <Trash2 className="h-4 w-4" />
          <span className="text-xs font-medium">Remove</span>
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
