import { forwardRef } from "react"

import { Paperclip, Image, FileText, Square, SendHorizonal } from "lucide-react"

import { Button } from "@/components/ui/button"
import { ControlSelect } from "@/components/app/control-select"
import type { SelectOption } from "@/data/app-data"

type ComposerControlsProps = {
  model: SelectOption
  reasoning: SelectOption
  sandbox: SelectOption
  modelOptions: SelectOption[]
  reasoningOptions: SelectOption[]
  sandboxOptions: SelectOption[]
  onModelChange: (value: string) => void
  onReasoningChange: (value: string) => void
  onSandboxChange: (value: string) => void
  isStreaming: boolean
  actionDisabled: boolean
  onStop: () => void
  onSend: () => void
  onOpenImagePicker: () => void
}

export const ComposerControls = forwardRef<HTMLDivElement, ComposerControlsProps>(
  (
    {
      model,
      reasoning,
      sandbox,
      modelOptions,
      reasoningOptions,
      sandboxOptions,
      onModelChange,
      onReasoningChange,
      onSandboxChange,
      isStreaming,
      actionDisabled,
      onStop,
      onSend,
      onOpenImagePicker
    },
    ref
  ) => {
    return (
      <div ref={ref} className="pointer-events-none absolute inset-x-3 bottom-2.5 z-10 flex items-center justify-between">
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
        <div className="pointer-events-auto flex items-center gap-1.5">
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="Attach file">
            <Paperclip className="h-4 w-4" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full"
            title="Insert image"
            onClick={onOpenImagePicker}
          >
            <Image className="h-4 w-4" />
          </Button>
          <Button variant="ghost" size="icon" className="h-8 w-8 rounded-full" title="Add snippet">
            <FileText className="h-4 w-4" />
          </Button>
          {isStreaming ? (
            <Button
              type="button"
              onClick={onStop}
              variant="secondary"
              size="icon"
              className="h-8 w-8 rounded-full"
              title="Stop"
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              type="button"
              onClick={onSend}
              disabled={actionDisabled}
              size="icon"
              className="h-8 w-8 rounded-full"
              title="Send"
            >
              <SendHorizonal className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    )
  }
)

ComposerControls.displayName = "ComposerControls"
