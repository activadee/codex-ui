import type { projects } from "../../wailsjs/go/models"
import type { Project } from "@/types/app"

const pathDelimiterRegex = /[\\/]/g

function deriveNameFromPath(path: string): string {
  const segments = path.split(pathDelimiterRegex).filter(Boolean)
  if (segments.length === 0) {
    return path || "Project"
  }
  return segments[segments.length - 1]
}

export function mapProjectDtoToProject(dto: projects.ProjectDTO): Project {
  const name = dto.displayName?.trim() || deriveNameFromPath(dto.path)
  const description =
    dto.displayName && dto.displayName.trim().length > 0 ? dto.path : `Workspace · ${dto.path}`

  return {
    id: dto.id,
    path: dto.path,
    name,
    description,
    tags: dto.tags ?? [],
    lastOpenedAt: dto.lastOpenedAt
  }
}
