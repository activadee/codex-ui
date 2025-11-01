import { useCallback, useEffect, useMemo, useRef, useState } from "react"

import { DeleteAttachment, SaveClipboardImage } from "../../../wailsjs/go/main/App"
import {
  getReasoningOptions,
  modelOptions,
  sandboxOptions,
  type SelectOption
} from "@/data/app-data"
import type { ImageAttachment } from "@/types/app"

function createAttachmentId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID()
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function inferImageMimeType(file: File): string | null {
  if (file.type) {
    if (file.type.startsWith("image/")) {
      return file.type
    }
    if (file.type === "application/octet-stream" && file.size > 0) {
      return "image/png"
    }
    return null
  }

  const name = (file.name || "").toLowerCase()
  if (name.endsWith(".png")) {
    return "image/png"
  }
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) {
    return "image/jpeg"
  }
  if (name.endsWith(".gif")) {
    return "image/gif"
  }
  if (name.endsWith(".webp")) {
    return "image/webp"
  }
  if (name.endsWith(".bmp")) {
    return "image/bmp"
  }
  if (name.endsWith(".svg")) {
    return "image/svg+xml"
  }
  return null
}

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const result = reader.result
      if (typeof result === "string") {
        const base64 = result.split(",")[1]
        if (base64) {
          resolve(base64)
          return
        }
      }
      reject(new Error("Invalid image data"))
    }
    reader.onerror = () => {
      reject(new Error("Failed to read file"))
    }
    reader.readAsDataURL(file)
  })
}

export function useComposerState(stream: { setError: (message: string | null) => void }) {
  const [prompt, setPrompt] = useState("")
  const [model, setModel] = useState<SelectOption>(modelOptions[0])
  const [sandbox, setSandbox] = useState<SelectOption>(sandboxOptions[0])
  const reasoningOptions = useMemo(() => getReasoningOptions(model.value), [model.value])
  const [reasoning, setReasoning] = useState<SelectOption>(reasoningOptions[0])
  const [attachments, setAttachments] = useState<ImageAttachment[]>([])
  const attachmentsRef = useRef<ImageAttachment[]>([])

  useEffect(() => {
    attachmentsRef.current = attachments
  }, [attachments])

  useEffect(() => {
    const options = getReasoningOptions(model.value)
    setReasoning((prev) => options.find((option) => option.value === prev.value) ?? options[0])
  }, [model])

  useEffect(() => {
    return () => {
      attachmentsRef.current.forEach((attachment) => {
        URL.revokeObjectURL(attachment.previewUrl)
        void DeleteAttachment(attachment.path).catch((error) => {
          console.error("Failed to delete attachment on cleanup", error)
        })
      })
    }
  }, [])

  const clearAttachments = useCallback((options?: { deleteFiles?: boolean }) => {
    const deleteFiles = options?.deleteFiles ?? true
    setAttachments((previous) => {
      if (previous.length === 0) {
        return previous
      }
      previous.forEach((attachment) => {
        URL.revokeObjectURL(attachment.previewUrl)
        if (deleteFiles) {
          void DeleteAttachment(attachment.path).catch((error) => {
            console.error("Failed to delete attachment", error)
          })
        }
      })
      return []
    })
  }, [])

  const removeAttachment = useCallback((attachmentId: string) => {
    setAttachments((previous) => {
      const target = previous.find((attachment) => attachment.id === attachmentId)
      if (!target) {
        return previous
      }
      URL.revokeObjectURL(target.previewUrl)
      void DeleteAttachment(target.path).catch((error) => {
        console.error("Failed to delete attachment", error)
      })
      return previous.filter((attachment) => attachment.id !== attachmentId)
    })
  }, [])

  const addImages = useCallback(
    async (files: File[]) => {
      const entries = files
        .map((file) => {
          const mimeType = inferImageMimeType(file)
          return mimeType ? { file, mimeType } : null
        })
        .filter((entry): entry is { file: File; mimeType: string } => entry !== null)

      if (entries.length === 0) {
        return
      }

      const newAttachments: ImageAttachment[] = []
      for (const { file, mimeType } of entries) {
        try {
          const base64 = await readFileAsBase64(file)
          const storedPath = await SaveClipboardImage(base64, mimeType)
          const previewUrl = URL.createObjectURL(file)
          newAttachments.push({
            id: createAttachmentId(),
            path: storedPath,
            previewUrl,
            mimeType,
            size: file.size,
            name: file.name || "Pasted image"
          })
        } catch (error) {
          console.error("Failed to save pasted image", error)
          const message = error instanceof Error ? error.message : "Failed to attach image"
          stream.setError(message)
        }
      }

      if (newAttachments.length > 0) {
        setAttachments((previous) => [...previous, ...newAttachments])
      }
    },
    [stream]
  )

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
