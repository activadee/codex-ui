import { useEffect, useRef, useState, type ChangeEvent, type ClipboardEvent } from "react"

import { Textarea } from "@/components/ui/textarea"
import type { SelectOption } from "@/data/app-data"
import type { AgentUsage, ImageAttachment } from "@/types/app"

import { AttachmentGrid } from "./attachment-grid"
import { ComposerControls } from "./composer-controls"
import { TodoDock, hasTodos } from "./todo-dock"

export type ComposerPanelProps = {
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
  errorMessage,
  todoList
}: ComposerPanelProps) {
  const actionDisabled = !canSend || isStreaming
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const textareaRef = useRef<HTMLTextAreaElement | null>(null)
  const overlayBarRef = useRef<HTMLDivElement | null>(null)
  const [overlayHeight, setOverlayHeight] = useState<number>(44)

  useEffect(() => {
    const updateOverlayHeight = () => {
      const height = overlayBarRef.current?.offsetHeight ?? 40
      setOverlayHeight(height)
    }

    updateOverlayHeight()
    window.addEventListener("resize", updateOverlayHeight)
    return () => window.removeEventListener("resize", updateOverlayHeight)
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
    <div className="pt-5">
      {hasTodos(todoList) && todoList && <TodoDock todoList={todoList} />}
      <div className="flex flex-col gap-2.5">
        <div
          className="relative h-32 border border-border/70 bg-white text-base text-foreground shadow-sm focus-within:ring-2 focus-within:ring-primary"
          style={{ paddingBottom: overlayHeight + 10 }}
        >
          <Textarea
            value={prompt}
            onChange={(event) => onPromptChange(event.target.value)}
            onPaste={handlePaste}
            rows={3}
            placeholder={`Add a follow-up for ${projectName}`}
            ref={textareaRef}
            className="h-full min-h-0 overflow-y-auto resize-none border-0 bg-transparent px-3.5 py-2.5 text-base shadow-none focus-visible:ring-0"
          />

          <ComposerControls
            ref={overlayBarRef}
            model={model}
            reasoning={reasoning}
            sandbox={sandbox}
            modelOptions={modelOptions}
            reasoningOptions={reasoningOptions}
            sandboxOptions={sandboxOptions}
            onModelChange={onModelChange}
            onReasoningChange={onReasoningChange}
            onSandboxChange={onSandboxChange}
            isStreaming={isStreaming}
            actionDisabled={actionDisabled}
            onStop={onStop}
            onSend={onSend}
            onOpenImagePicker={() => fileInputRef.current?.click()}
          />
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
          <AttachmentGrid attachments={attachments} onRemoveAttachment={onRemoveAttachment} />
        )}
        {errorMessage && (
          <p role="alert" className="text-xs text-destructive">
            {errorMessage}
          </p>
        )}
      </div>
    </div>
  )
}
