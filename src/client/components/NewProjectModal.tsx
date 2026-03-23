import { useState, useEffect, useRef } from "react"
import { Folder } from "lucide-react"
import { DEFAULT_NEW_PROJECT_ROOT } from "../../shared/branding"
import { Button } from "./ui/button"
import {
  Dialog,
  DialogContent,
  DialogBody,
  DialogTitle,
  DialogFooter,
} from "./ui/dialog"
import { SegmentedControl } from "./ui/segmented-control"

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onConfirm: (project: { mode: Tab; localPath: string; title: string }) => void
  onPickDirectory: (title?: string) => Promise<string | null>
}

type Tab = "new" | "existing"

function toKebab(str: string): string {
  return str
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/[^a-z0-9-]/g, "")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

export function NewProjectModal({ open, onOpenChange, onConfirm, onPickDirectory }: Props) {
  const [tab, setTab] = useState<Tab>("new")
  const [name, setName] = useState("")
  const [existingPath, setExistingPath] = useState("")
  const [isPicking, setIsPicking] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)
  const existingInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (open) {
      setTab("new")
      setName("")
      setExistingPath("")
      setIsPicking(false)
      setTimeout(() => inputRef.current?.focus(), 0)
    }
  }, [open])

  useEffect(() => {
    if (open) {
      setTimeout(() => {
        if (tab === "new") inputRef.current?.focus()
        else existingInputRef.current?.focus()
      }, 0)
    }
  }, [tab, open])

  const kebab = toKebab(name)
  const newPath = kebab ? `${DEFAULT_NEW_PROJECT_ROOT}/${kebab}` : ""
  const trimmedExisting = existingPath.trim()

  const canSubmit = tab === "new" ? !!kebab : !!trimmedExisting

  const handleSubmit = () => {
    if (!canSubmit) return
    if (tab === "new") {
      onConfirm({ mode: "new", localPath: newPath, title: name.trim() })
    } else {
      const folderName = trimmedExisting.split("/").pop() || trimmedExisting
      onConfirm({ mode: "existing", localPath: trimmedExisting, title: folderName })
    }
    onOpenChange(false)
  }

  const handleBrowse = async () => {
    setIsPicking(true)
    try {
      const result = await onPickDirectory("Select Project Folder")
      if (result) {
        const trimmed = result.trim()
        setExistingPath(trimmed)
        const folderName = trimmed.split("/").pop() || trimmed
        onConfirm({ mode: "existing", localPath: trimmed, title: folderName })
        onOpenChange(false)
      }
    } finally {
      setIsPicking(false)
      existingInputRef.current?.focus()
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="sm">
        <DialogBody className="space-y-4">
          <DialogTitle>Add Project</DialogTitle>

          <SegmentedControl
            value={tab}
            onValueChange={setTab}
            options={[
              { value: "new" as Tab, label: "New Folder" },
              { value: "existing" as Tab, label: "Existing Path" },
            ]}
            className="w-full"
            optionClassName="flex-1 justify-center"
          />

          {tab === "new" ? (
            <div className="space-y-2">
              <input
                ref={inputRef}
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit()
                  if (e.key === "Escape") onOpenChange(false)
                }}
                className="w-full px-3 py-2 text-sm border border-border rounded-md bg-background outline-none"
                placeholder="Project name"
              />
              {newPath && (
                <p className="text-xs text-muted-foreground font-mono">
                  {newPath}
                </p>
              )}
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex gap-2">
                <input
                  ref={existingInputRef}
                  type="text"
                  value={existingPath}
                  onChange={(e) => setExistingPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") handleSubmit()
                    if (e.key === "Escape") onOpenChange(false)
                  }}
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md bg-background outline-none"
                  placeholder="~/Projects/my-app"
                />
                <Button
                  variant="outline"
                  size="icon-sm"
                  onClick={handleBrowse}
                  disabled={isPicking}
                  title="Browse..."
                  className="h-9 w-9"
                >
                  <Folder className="h-4 w-4" />
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                The folder will be created if it doesn't exist.
              </p>
            </div>
          )}
        </DialogBody>
        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="secondary"
            size="sm"
            onClick={handleSubmit}
            disabled={!canSubmit || isPicking}
          >
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
