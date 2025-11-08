import type { EventPriority } from "./eventChannels"

/**
 * Runtime services provide shared tooling referenced throughout the platform layer.
 * See docs/frontend-architecture.md for the layering contract and rationale.
 */
export type RuntimeServices = {
  logger: PlatformLogger
  diagnostics: DiagnosticsClient
  featureFlags: FeatureFlagClient
  clock: () => number
}

export type PlatformLogger = {
  debug: (message: string, meta?: Record<string, unknown>) => void
  info: (message: string, meta?: Record<string, unknown>) => void
  warn: (message: string, meta?: Record<string, unknown>) => void
  error: (message: string, meta?: Record<string, unknown>) => void
}

export type DiagnosticsClient = {
  emit: (event: DiagnosticsEvent) => void
  scoped: (scope: string) => DiagnosticsClient
}

export type DiagnosticsEvent =
  | { type: "bridge.retry"; command: string; attempt: number; error: Error }
  | { type: "bridge.success"; command: string; durationMs: number; attempts: number }
  | { type: "bridge.failure"; command: string; attempts: number; error: Error }
  | { type: "eventbus.publish"; topic: string; priority: EventPriority; queued: number }

export type FeatureFlagClient = {
  isEnabled: (flag: string) => boolean
  snapshot: () => Readonly<Record<string, boolean>>
  override: (flag: string, value: boolean) => void
}

const defaultClock = () => {
  if (typeof performance !== "undefined" && typeof performance.now === "function") {
    return performance.now()
  }
  return Date.now()
}

function createConsoleLogger(tag = "platform"): PlatformLogger {
  const format = (level: string, message: string, meta?: Record<string, unknown>) => {
    const writer = console[level as keyof Console] as ((...args: unknown[]) => void) | undefined
    if (!writer) {
      return
    }
    if (meta && Object.keys(meta).length > 0) {
      writer(`[${tag}] ${message}`, meta)
      return
    }
    writer(`[${tag}] ${message}`)
  }

  return {
    debug: (message, meta) => format("debug", message, meta),
    info: (message, meta) => format("info", message, meta),
    warn: (message, meta) => format("warn", message, meta),
    error: (message, meta) => format("error", message, meta)
  }
}

function createDiagnosticsClient(logger: PlatformLogger, scope?: string): DiagnosticsClient {
  return {
    emit: (event) => {
      const namespace = scope ? `${scope}:` : ""
      logger.debug(`diagnostic:${namespace}${event.type}`, event as Record<string, unknown>)
    },
    scoped: (childScope: string) => {
      const nestedScope = scope ? `${scope}.${childScope}` : childScope
      return createDiagnosticsClient(logger, nestedScope)
    }
  }
}

function createFeatureFlagClient(initial?: Record<string, boolean>): FeatureFlagClient {
  const flags = new Map<string, boolean>(Object.entries(initial ?? {}))
  return {
    isEnabled: (flag) => flags.get(flag) ?? false,
    snapshot: () => {
      const entries: Record<string, boolean> = {}
      flags.forEach((value, key) => {
        entries[key] = value
      })
      return entries
    },
    override: (flag, value) => {
      flags.set(flag, value)
    }
  }
}

export type CreateRuntimeServicesOptions = {
  logger?: PlatformLogger
  diagnostics?: DiagnosticsClient
  featureFlags?: FeatureFlagClient
  clock?: () => number
}

export function createRuntimeServices(options: CreateRuntimeServicesOptions = {}): RuntimeServices {
  const logger = options.logger ?? createConsoleLogger()
  const diagnostics = options.diagnostics ?? createDiagnosticsClient(logger)
  return {
    logger,
    diagnostics,
    featureFlags: options.featureFlags ?? createFeatureFlagClient(),
    clock: options.clock ?? defaultClock
  }
}
