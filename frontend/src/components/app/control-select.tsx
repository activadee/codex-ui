import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from "@/components/ui/select"
import { cn } from "@/lib/utils"
import type { SelectOption } from "@/data/app-data"

type ControlSelectProps = {
  label?: string
  value: string
  options: SelectOption[]
  onValueChange: (value: string) => void
  className?: string
  variant?: "default" | "inline"
}

export function ControlSelect({
  label,
  value,
  options,
  onValueChange,
  className,
  variant = "default"
}: ControlSelectProps) {
  const triggerBase =
    variant === "inline"
      ? "flex w-auto min-w-0 items-center gap-1 justify-between rounded-none border-none bg-transparent px-0 py-0 h-6 text-xs font-medium text-foreground shadow-none hover:bg-transparent [&_svg]:!h-3 [&_svg]:!w-3"
      : "flex w-auto min-w-36 items-center justify-between rounded-full border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-secondary"

  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn(triggerBase, className)}
      >
        <SelectValue placeholder={label ?? "Select an option"} />
      </SelectTrigger>
      <SelectContent className="w-48">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value} className="text-sm">
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}
