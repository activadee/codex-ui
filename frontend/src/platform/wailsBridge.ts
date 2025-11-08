import { DeleteProject, ListProjects, MarkProjectOpened, RegisterProject } from "../../wailsjs/go/projects/API"
import {
  Cancel,
  CreatePullRequest,
  DeleteThread,
  EmitThreadDiffUpdate,
  GetThread,
  ListThreadFileDiffs,
  ListThreads,
  LoadThreadConversation,
  RenameThread,
  Send
} from "../../wailsjs/go/agents/API"
import { DeleteAttachment, SaveClipboardImage } from "../../wailsjs/go/attachments/API"
import { Resize, Start, Stop, Write } from "../../wailsjs/go/terminal/API"
import { SelectProjectDirectory } from "../../wailsjs/go/ui/API"
import type { agents, projects, terminal } from "../../wailsjs/go/models"

import { createRuntimeServices, type RuntimeServices, type DiagnosticsClient } from "./runtimeServices"

/**
 * WailsBridge is the single entry point for invoking Go commands from the frontend.
 * Downstream domain modules must only depend on this surface (see docs/frontend-architecture.md).
 */
export type PlatformBridge = {
  projects: ProjectsBridge
  threads: ThreadsBridge
  attachments: AttachmentsBridge
  terminal: TerminalBridge
  ui: UiBridge
}

export type ProjectsBridge = {
  list: () => Promise<projects.ProjectDTO[]>
  register: (payload: projects.RegisterProjectRequest) => Promise<projects.ProjectDTO>
  delete: (projectId: number) => Promise<void>
  markOpened: (projectId: number) => Promise<void>
}

export type ThreadsBridge = {
  list: (projectId: number) => Promise<agents.ThreadDTO[]>
  get: (threadId: number) => Promise<agents.ThreadDTO>
  rename: (threadId: number, title: string) => Promise<agents.ThreadDTO>
  delete: (threadId: number) => Promise<void>
  createPullRequest: (threadId: number) => Promise<string>
  listFileDiffs: (threadId: number) => Promise<agents.FileDiffStatDTO[]>
  emitDiffUpdate: (threadId: number) => Promise<void>
  loadConversation: (threadId: number) => Promise<agents.ConversationEntryDTO[]>
  sendMessage: (payload: agents.MessageRequest) => Promise<agents.StreamHandle>
  cancelStream: (streamId: string) => Promise<agents.CancelResponse>
}

export type AttachmentsBridge = {
  saveClipboardImage: (base64: string, mimeType: string) => Promise<string>
  deleteAttachment: (path: string) => Promise<void>
}

export type TerminalBridge = {
  start: (threadId: number) => Promise<terminal.Handle>
  stop: (threadId: number) => Promise<void>
  resize: (threadId: number, columns: number, rows: number) => Promise<void>
  write: (threadId: number, input: string) => Promise<void>
}

export type UiBridge = {
  selectProjectDirectory: (prompt?: string) => Promise<string>
}

export type RetryPolicy = {
  attempts: number
  baseDelayMs: number
  backoffFactor: number
  maxDelayMs: number
  jitterFactor: number
}

const defaultRetryPolicy: RetryPolicy = {
  attempts: 3,
  baseDelayMs: 150,
  backoffFactor: 2,
  maxDelayMs: 1500,
  jitterFactor: 0.25
}

export type CreateWailsBridgeOptions = {
  retryPolicy?: Partial<RetryPolicy>
  services?: RuntimeServices
}

type BridgeCommandMeta = {
  scope: string
  action: string
}

export class BridgeError extends Error {
  readonly code?: string
  readonly command: string

  constructor(message: string, options: { command: string; code?: string; cause?: unknown }) {
    const cause = options.cause instanceof Error ? options.cause : undefined
    super(message, cause ? { cause } : undefined)
    this.name = "BridgeError"
    this.command = options.command
    this.code = options.code
  }
}

export function createWailsBridge(options: CreateWailsBridgeOptions = {}): PlatformBridge {
  const services = options.services ?? createRuntimeServices()
  const policy = resolvePolicy(options.retryPolicy)
  const diagnosticScope = services.diagnostics.scoped("bridge")

  const execute = <T>(meta: BridgeCommandMeta, handler: () => Promise<T>) =>
    executeWithRetry(handler, meta, policy, services, diagnosticScope)

  return {
    projects: {
      list: () => execute({ scope: "projects", action: "list" }, () => ListProjects()),
      register: (payload) => execute({ scope: "projects", action: "register" }, () => RegisterProject(payload)),
      delete: (projectId) => execute({ scope: "projects", action: "delete" }, () => DeleteProject(projectId)),
      markOpened: (projectId) =>
        execute({ scope: "projects", action: "markOpened" }, () => MarkProjectOpened(projectId))
    },
    threads: {
      list: (projectId) => execute({ scope: "threads", action: "list" }, () => ListThreads(projectId)),
      get: (threadId) => execute({ scope: "threads", action: "get" }, () => GetThread(threadId)),
      rename: (threadId, title) =>
        execute({ scope: "threads", action: "rename" }, () => RenameThread(threadId, title)),
      delete: (threadId) => execute({ scope: "threads", action: "delete" }, () => DeleteThread(threadId)),
      createPullRequest: (threadId) =>
        execute({ scope: "threads", action: "createPullRequest" }, () => CreatePullRequest(threadId)),
      listFileDiffs: (threadId) =>
        execute({ scope: "threads", action: "listFileDiffs" }, () => ListThreadFileDiffs(threadId)),
      emitDiffUpdate: (threadId) =>
        execute({ scope: "threads", action: "emitDiffUpdate" }, () => EmitThreadDiffUpdate(threadId)),
      loadConversation: (threadId) =>
        execute({ scope: "threads", action: "loadConversation" }, () => LoadThreadConversation(threadId)),
      sendMessage: (payload) => execute({ scope: "threads", action: "sendMessage" }, () => Send(payload)),
      cancelStream: (streamId) => execute({ scope: "threads", action: "cancelStream" }, () => Cancel(streamId))
    },
    attachments: {
      saveClipboardImage: (base64, mimeType) =>
        execute({ scope: "attachments", action: "saveClipboardImage" }, () => SaveClipboardImage(base64, mimeType)),
      deleteAttachment: (path) =>
        execute({ scope: "attachments", action: "deleteAttachment" }, () => DeleteAttachment(path))
    },
    terminal: {
      start: (threadId) => execute({ scope: "terminal", action: "start" }, () => Start(threadId)),
      stop: (threadId) => execute({ scope: "terminal", action: "stop" }, () => Stop(threadId)),
      resize: (threadId, columns, rows) =>
        execute({ scope: "terminal", action: "resize" }, () => Resize(threadId, columns, rows)),
      write: (threadId, input) => execute({ scope: "terminal", action: "write" }, () => Write(threadId, input))
    },
    ui: {
      selectProjectDirectory: (prompt = "Select a project directory") =>
        execute({ scope: "ui", action: "selectProjectDirectory" }, () => SelectProjectDirectory(prompt))
    }
  }
}

export const platformBridge = createWailsBridge()

function resolvePolicy(overrides?: Partial<RetryPolicy>): RetryPolicy {
  if (!overrides) {
    return defaultRetryPolicy
  }
  return {
    attempts: overrides.attempts ?? defaultRetryPolicy.attempts,
    baseDelayMs: overrides.baseDelayMs ?? defaultRetryPolicy.baseDelayMs,
    backoffFactor: overrides.backoffFactor ?? defaultRetryPolicy.backoffFactor,
    maxDelayMs: overrides.maxDelayMs ?? defaultRetryPolicy.maxDelayMs,
    jitterFactor: overrides.jitterFactor ?? defaultRetryPolicy.jitterFactor
  }
}

async function executeWithRetry<T>(
  handler: () => Promise<T>,
  meta: BridgeCommandMeta,
  policy: RetryPolicy,
  services: RuntimeServices,
  diagnostics: DiagnosticsClient
): Promise<T> {
  const command = `${meta.scope}.${meta.action}`
  let attempt = 0
  const startedAt = services.clock()

  while (attempt < policy.attempts) {
    attempt += 1
    try {
      const result = await handler()
      diagnostics.emit({ type: "bridge.success", command, durationMs: services.clock() - startedAt, attempts: attempt })
      return result
    } catch (error) {
      const normalized = normalizeBridgeError(error, command)
      const shouldRetry = attempt < policy.attempts
      if (!shouldRetry) {
        diagnostics.emit({ type: "bridge.failure", command, attempts: attempt, error: normalized })
        throw normalized
      }
      diagnostics.emit({ type: "bridge.retry", command, attempt, error: normalized })
      await delay(computeDelay(policy, attempt))
    }
  }

  throw new BridgeError(`Command ${command} exhausted retries without executing`, { command })
}

function normalizeBridgeError(error: unknown, command: string): BridgeError {
  if (error instanceof BridgeError) {
    return error
  }
  if (error instanceof Error) {
    return new BridgeError(error.message, { command, cause: error })
  }
  return new BridgeError("Unknown platform bridge failure", { command })
}

function computeDelay(policy: RetryPolicy, attempt: number) {
  const exp = Math.pow(policy.backoffFactor, attempt - 1)
  const rawDelay = Math.min(policy.baseDelayMs * exp, policy.maxDelayMs)
  if (policy.jitterFactor <= 0) {
    return rawDelay
  }
  const jitter = rawDelay * policy.jitterFactor
  const min = rawDelay - jitter
  const max = rawDelay + jitter
  return min + Math.random() * (max - min)
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
