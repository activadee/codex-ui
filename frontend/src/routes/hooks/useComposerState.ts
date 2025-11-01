import { useCallback, useEffect, useMemo, useState } from "react"

import {
  getReasoningOptions,
  modelOptions,
  sandboxOptions,
  type SelectOption
} from "@/data/app-data"
import { useAttachmentManager } from "@/routes/hooks/useAttachmentManager"

type ComposerStream = {
  setError: (message: string | null) => void
}

export function useComposerState(stream: ComposerStream) {
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState<SelectOption>(modelOptions[0])
  const [sandbox, setSandbox] = useState<SelectOption>(sandboxOptions[0])
  const reasoningOptions = useMemo(() => getReasoningOptions(model.value), [model.value])
  const [reasoning, setReasoning] = useState<SelectOption>(reasoningOptions[0])

  const { attachments, addImages, removeAttachment, clearAttachments } = useAttachmentManager(stream.setError)

  useEffect(() => {
    const options = getReasoningOptions(model.value)
    setReasoning((prev) => options.find((option) => option.value === prev.value) ?? options[0])
  }, [model])

  const setModelValue = useCallback((value: string) => {
    setModel(modelOptions.find((option) => option.value === value) ?? modelOptions[0])
  }, [])

  const setSandboxValue = useCallback((value: string) => {
    setSandbox(sandboxOptions.find((option) => option.value === value) ?? sandboxOptions[0])
  }, [])

  const setReasoningValue = useCallback(
    (value: string) => {
      setReasoning(
        reasoningOptions.find((option) => option.value === value) ?? reasoningOptions[0]
      )
    },
    [reasoningOptions]
  )

  return {
    prompt,
    setPrompt,
    model,
    setModelValue,
    sandbox,
    setSandboxValue,
    reasoning,
    setReasoningValue,
    reasoningOptions,
    modelOptions,
    sandboxOptions,
    imageAttachments: attachments,
    addImages,
    removeAttachment,
    clearAttachments
  }
}
