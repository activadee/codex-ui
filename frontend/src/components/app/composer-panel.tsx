import { useRef, type ChangeEvent, type ClipboardEvent } from "react"

import { FileText, Image, Paperclip, SendHorizonal, Square, X } from "lucide-react"

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
  errorMessage
}: ComposerPanelProps) {
  const actionDisabled = !canSend || isStreaming
  const fileInputRef = useRef<HTMLInputElement | null>(null)

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
      <div className="flex flex-wrap items-center gap-3 pb-4">
        <ControlSelect
          label="Model"
          value={model.value}
          options={modelOptions}
          onValueChange={onModelChange}
          className="min-w-[8rem]"
        />
        <ControlSelect
          label="Reasoning"
          value={reasoning.value}
          options={reasoningOptions}
          onValueChange={onReasoningChange}
          className="min-w-[7rem]"
        />
        <ControlSelect
          label="Sandbox"
          value={sandbox.value}
          options={sandboxOptions}
          onValueChange={onSandboxChange}
          className="min-w-[9rem]"
        />
      </div>

      <div className="flex flex-col gap-3">
        <Textarea
          value={prompt}
          onChange={(event) => onPromptChange(event.target.value)}
          onPaste={handlePaste}
          rows={3}
          placeholder={`Add a follow-up for ${projectName}`}
          className="min-h-[88px] resize-none rounded-2xl border border-border bg-white text-base text-foreground shadow-sm focus-visible:ring-2 focus-visible:ring-primary"
        />
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
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" title="Attach file">
              <Paperclip className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full"
              title="Insert image"
              onClick={() => fileInputRef.current?.click()}
            >
              <Image className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-9 w-9 rounded-full" title="Add snippet">
              <FileText className="h-4 w-4" />
            </Button>
          </div>
          <div className="flex items-center gap-3">
            {isStreaming && (
              <Button
                type="button"
                onClick={onStop}
                variant="secondary"
                className="rounded-full px-5"
              >
                <Square className="h-4 w-4" />
                Stop
              </Button>
            )}
            <Button
              type="button"
              onClick={onSend}
              disabled={actionDisabled}
              className="rounded-full px-6"
            >
              <SendHorizonal className="mr-2 h-4 w-4" />
              Send
            </Button>
          </div>
        </div>
      </div>
    </div>
  )
}
