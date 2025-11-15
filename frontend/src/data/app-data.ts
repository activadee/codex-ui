export type SelectOption = {
  label: string
  value: string
}

export const modelOptions: SelectOption[] = [
  { label: "GPT-5.1 Codex", value: "gpt-5.1-codex" },
  { label: "GPT-5.1 Codex Mini", value: "gpt-5.1-codex-mini" },
  { label: "GPT-5.1", value: "gpt-5.1" }
]

export const sandboxOptions: SelectOption[] = [
  { label: "Workspace write", value: "workspace-write" },
  { label: "Read only", value: "read-only" },
  { label: "Full access", value: "danger-full-access" }
]

const reasoningOptionsMap: Record<string, SelectOption[]> = {
  default: [
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" }
  ],
  "gpt-5.1-codex-mini": [
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" }
  ],
  "gpt-5": [
    { label: "Minimal", value: "minimal" },
    { label: "Low", value: "low" },
    { label: "Medium", value: "medium" },
    { label: "High", value: "high" }
  ]
}

export function getReasoningOptions(modelValue: string): SelectOption[] {
  return reasoningOptionsMap[modelValue] ?? reasoningOptionsMap.default
}
