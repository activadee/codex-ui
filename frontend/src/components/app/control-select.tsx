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
}

export function ControlSelect({
  label,
  value,
  options,
  onValueChange,
  className
}: ControlSelectProps) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger
        className={cn(
          "flex w-auto min-w-36 items-center justify-between rounded-full border border-border bg-white px-3 py-1.5 text-sm font-medium text-foreground shadow-sm hover:bg-secondary",
          className
        )}
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

