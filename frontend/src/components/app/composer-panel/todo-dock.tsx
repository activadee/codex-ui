import { useMemo, useState } from "react"

import { CheckCircle2, ChevronDown, ChevronRight, ListChecks } from "lucide-react"

type TodoItem = { text: string; completed: boolean }
export type ComposerTodoList = { items: TodoItem[] }

export function hasTodos(todoList?: ComposerTodoList | null): boolean {
  return Boolean(todoList && Array.isArray(todoList.items) && todoList.items.length > 0)
}

type TodoDockProps = {
  todoList: ComposerTodoList
}

export function TodoDock({ todoList }: TodoDockProps) {
  const [open, setOpen] = useState(false)
  const items = todoList.items

  const { total, done, left, activeIndex } = useMemo(() => {
    const total = items.length
    const done = items.filter((t) => t.completed).length
    const left = total - done
    const activeIndex = items.findIndex((t) => !t.completed)
    return { total, done, left, activeIndex }
  }, [items])

  return (
    <div className="bg-primary/5">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left text-sm text-foreground"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2 font-medium">
          <ListChecks className="h-4 w-4 text-primary" />
          <span className="truncate">To-dos</span>
        </span>
        <span className="flex shrink-0 items-center gap-3 text-xs text-muted-foreground">
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-primary">{total} total</span>
          <span className="rounded-full bg-emerald-100/60 px-2 py-0.5 text-emerald-700">{done} done</span>
          <span className="rounded-full bg-amber-100/60 px-2 py-0.5 text-amber-700">{left} left</span>
          {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open && (
        <ul className="border-t border-primary/20 px-4 py-3 text-sm">
          {items.map((todo, idx) => {
            const isActive = !todo.completed && idx === activeIndex
            return (
              <li key={`${todo.text}-${idx}`} className="flex min-w-0 items-center gap-2 py-1">
                <CheckCircle2
                  className={
                    todo.completed
                      ? "h-4 w-4 text-primary"
                      : isActive
                        ? "h-4 w-4 text-amber-600"
                        : "h-4 w-4 text-muted-foreground/60"
                  }
                />
                <span
                  className={
                    todo.completed
                      ? "wrap-break-word line-through text-muted-foreground"
                      : "wrap-break-word text-foreground"
                  }
                >
                  {todo.text}
                </span>
                {isActive && (
                  <span className="ml-auto inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium uppercase tracking-wide text-amber-700">
                    Active
                  </span>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
