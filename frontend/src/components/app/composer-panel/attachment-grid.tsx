import { X } from "lucide-react"

import type { ImageAttachment } from "@/types/app"

type AttachmentGridProps = {
  attachments: ImageAttachment[]
  onRemoveAttachment: (id: string) => void
}

export function AttachmentGrid({ attachments, onRemoveAttachment }: AttachmentGridProps) {
  return (
    <div className="flex flex-wrap gap-2.5">
      {attachments.map((attachment) => (
        <div key={attachment.id} className="relative flex w-28 flex-col gap-1 text-xs">
          <div className="relative aspect-square w-full overflow-hidden rounded-lg border border-border bg-muted">
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
              className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-background/90 text-muted-foreground shadow-sm transition hover:text-foreground"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          <span className="truncate text-muted-foreground">{attachment.name}</span>
        </div>
      ))}
    </div>
  )
}
