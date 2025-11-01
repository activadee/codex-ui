import { useOutletContext } from "react-router-dom"

import type { SelectOption } from "@/data/app-data"
import type { ImageAttachment } from "@/types/app"
import { useWorkspaceController } from "@/hooks/useWorkspaceController"

export type WorkspaceRouteContextValue = {
  workspace: ReturnType<typeof useWorkspaceController>
  prompt: string
  setPrompt: (value: string) => void
  imageAttachments: ImageAttachment[]
  onAddImages: (files: File[]) => void
  onRemoveAttachment: (id: string) => void
  selectModel: (value: string) => void
  selectSandbox: (value: string) => void
  selectReasoning: (value: string) => void
  model: SelectOption
  sandbox: SelectOption
  reasoning: SelectOption
  reasoningOptions: SelectOption[]
  modelOptions: SelectOption[]
  sandboxOptions: SelectOption[]
  sendPrompt: () => Promise<number | undefined>
}

export function useWorkspaceRouteContext(): WorkspaceRouteContextValue {
  return useOutletContext<WorkspaceRouteContextValue>()
}
