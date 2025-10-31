import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react"

import {
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  FileText,
  Image,
  ListChecks,
  Paperclip,
  SendHorizonal,
  Square,
  X
} from "lucide-react"

import { Textarea } from "@/components/ui/textarea"
import { Button } from "@/components/ui/button"
import { ControlSelect } from "@/components/app/control-select"
import type { AgentUsage, ImageAttachment } from "@/types/app"
import type { SelectOption } from "@/data/app-data"

type ComposerPanelProps = {
  projectName: string
  prompt: string
  onPromptChange: (value: string) => void
  attachments: ImageAttachment[]
  onAddImages: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  onSend: () => void
  onStop: () => void
  canSend: boolean
  isStreaming: boolean
  model: SelectOption
  reasoning: SelectOption
  sandbox: SelectOption
  modelOptions: SelectOption[]
  reasoningOptions: SelectOption[]
  sandboxOptions: SelectOption[]
  onModelChange: (value: string) => void
  onReasoningChange: (value: string) => void
  onSandboxChange: (value: string) => void
  usage?: AgentUsage | null
  status?: string
  errorMessage?: string | null
  todoList?: { items: Array<{ text: string; completed: boolean }> } | null
}

export function ComposerPanel({
  projectName,
  prompt,
  onPromptChange,
  attachments,
  onAddImages,
  onRemoveAttachment,
  onSend,
  onStop,
  canSend,
  isStreaming,
  model,
  reasoning,
  sandbox,
  modelOptions,
  reasoningOptions,
  sandboxOptions,
  onModelChange,
  onReasoningChange,
  onSandboxChange,
  usage,
  status,
  errorMessage,
  todoList
}: ComposerPanelProps) {
  const actionDisabled = !canSend || isStreaming
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const overlayBarRef = useRef<HTMLDivElement | null>(null)
  const [overlayHeight, setOverlayHeight] = useState<number>(44)

  // Input should not grow: no auto-resize; scrolling inside textarea instead.

  // Measure overlay height to reserve space inside the wrapper
  useEffect(() => {
    const fn = () => {
      const h = overlayBarRef.current?.offsetHeight ?? 40
      setOverlayHeight(h)
    }
    fn()
    window.addEventListener("resize", fn)
    return () => window.removeEventListener("resize", fn)
  }, [isStreaming])

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const items = Array.from(event.clipboardData?.items ?? [])
    const files: File[] = []
    for (const item of items) {
      if (item.kind === "file") {
        const file = item.getAsFile()
        if (file) {
          files.push(file)
        }
      }
    }
    if (files.length > 0) {
      event.preventDefault()
      onAddImages(files)
    }
  }

  const handleFileSelection = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? [])
    if (files.length > 0) {
      onAddImages(files)
    }
    event.target.value = ""
  }

  return (
    <div className="px-8 py-6">
      {/** Sticky todo dock shown above the input */}
      {Boolean(todolistHasItems(todoList)) && (
        <TodoDock todoList={todoList!} />
      )}
      <div className="flex flex-col gap-3">
        <div
          className="relative h-36 rounded-2xl border border-border bg-white text-base text-foreground shadow-sm focus-within:ring-2 focus-within:ring-primary"
          style={{ paddingBottom: overlayHeight + 12 }}
        >
          <Textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onPaste={handlePaste}
            rows={3}
            placeholder={`Add a follow-up for ${projectName}`}
            ref={textareaRef}
            className="h-full min-h-0 overflow-y-auto resize-none border-0 bg-transparent px-4 py-3 text-base shadow-none focus-visible:ring-0"
          />

          {/** Bottom bar inside the input wrapper: selects on left, actions on right */}
          <div
            ref={overlayBarRef}
            className="pointer-events-none absolute inset-x-3 bottom-3 z-10 flex items-center justify-between"
          >
            <div className="pointer-events-auto flex items-center gap-3 text-muted-foreground">
              <ControlSelect
                label="Model"
                value={model.value}
                options={modelOptions}
                onValueChange={onModelChange}
                variant="inline"
              />
              <ControlSelect
                label="Reasoning"
                value={reasoning.value}
                options={reasoningOptions}
                onValueChange={onReasoningChange}
                variant="inline"
              />
              <ControlSelect
                label="Sandbox"
                value={sandbox.value}
                options={sandboxOptions}
                onValueChange={onSandboxChange}
                variant="inline"
              />
            </div>
            <div className="pointer-events-auto flex items-center gap-2">
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="Attach file">
                <Paperclip className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 rounded-full"
                title="Insert image"
                onClick={() => fileInputRef.current?.click()}
              >
                <Image className="h-4 w-4" />
              </Button>
              <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="Add snippet">
                <FileText className="h-4 w-4" />
              </Button>
              {isStreaming && (
                <Button
                  type="button"
                  onClick={onStop}
                  variant="secondary"
                  className="rounded-full px-4 h-9"
                >
                  <Square className="h-4 w-4" />
                  Stop
                </Button>
              )}
              <Button
                type="button"
                onClick={onSend}
                disabled={actionDisabled}
                className="rounded-full px-5 h-9"
                title="Send"
              >
                <SendHorizonal className="mr-2 h-4 w-4" />
                Send
              </Button>
            </div>
          </div>
        </div>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          multiple
          tabIndex={-1}
          className="hidden"
          onChange={handleFileSelection}
        />
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-3">
            {attachments.map((attachment) => (
              <div key={attachment.id} className="relative flex w-28 flex-col gap-1 text-xs">
                <div className="relative aspect-square w-full overflow-hidden rounded-xl border border-border bg-muted">
                  <img
                    src={attachment.previewUrl}
                    alt={attachment.name}
                    className="h-full w-full object-cover"
                    draggable={false}
                  />
                  <button
                    type="button"
                    onClick={() => onRemoveAttachment(attachment.id)}
                    aria-label={`Remove ${attachment.name}`}
                    className="absolute right-1 top-1 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
                <span className="truncate text-muted-foreground">{attachment.name}</span>
              </div>
            ))}
          </div>
        )}
        {errorMessage && (
          <p role="alert" className="text-xs text-destructive">
            {errorMessage}
          </p>
        )}
        {/** bottom toolbar moved inside the textarea overlay */}
      </div>
    </div>
  )
}

function todolistHasItems(todoList?: { items: Array<{ text: string; completed: boolean }> } | null): boolean {
  return Boolean(todoList && Array.isArray(todoList.items) && todoList.items.length > 0)
}

function TodoDock({
  todoList
}: {
  todoList: { items: Array<{ text: string; completed: boolean }> }
}) {
  const [open, setOpen] = useState(false)
  const items = todoList.items

  const { total, done, left, activeIndex } = useMemo(() => {
    const total = items.length
    const done = items.filter((t) => t.completed).length
    const left = total - done
    const activeIndex = items.findIndex((t) => !t.completed)
    return { total, done, left, activeIndex }
  }, [items])

  return (
    <div className="mb-4 rounded-xl border border-primary/30 bg-primary/5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left text-sm text-foreground"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <ListChecks className="h-4 w-4 text-primary" />
          <span className="truncate">To-dos</span>
        </span>
        <span className="flex shrink-0 items-center gap-4 text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2 py-1 text-primary">{total} total</span>
          <span className="rounded-full bg-emerald-100/60 px-2 py-1 text-emerald-700">{done} done</span>
          <span className="rounded-full bg-amber-100/60 px-2 py-1 text-amber-700">{left} left</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <ul className="border-t border-primary/20 px-4 py-3 text-sm">
          {items.map((todo, idx) => {
            const isActive = !todo.completed && idx === activeIndex
            return (
              <li
                key={`${todo.text}-${idx}`}
                className="flex min-w-0 items-center gap-2 py-1"
              >
                <CheckCircle2
                  className={
                    todo.completed ? "h-4 w-4 text-primary" : isActive ? "h-4 w-4 text-amber-600" : "h-4 w-4 text-muted-foreground/60"
                  }
                />
                <span
                  className={
                    todo.completed
                      ? "wrap-break-word line-through text-muted-foreground"
                      : "wrap-break-word text-foreground"
                  }
                >
                  {todo.text}
                </span>
                {isActive && (
                  <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-700">
                    Active
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
