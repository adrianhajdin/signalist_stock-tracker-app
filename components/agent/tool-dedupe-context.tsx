"use client";

/**
 * ToolDedupeContext — cross-message dedup cursor.
 *
 * The in-group dedup inside ToolCallGroup only sees a single message's
 * content parts. When the agent makes the same tool call twice across
 * TWO assistant messages (e.g. a second deep-read of the same playbook
 * after reasoning between turns), each message renders its own row and
 * you end up with two identical "Reading the Catalyst Event playbook"
 * lines stacked next to each other.
 *
 * This context provides a shared mutable cursor that each ToolCallGroup
 * reads + updates during its render pass. React renders components
 * top-down, so by the time message N+1 renders, the cursor holds the
 * last key from message N. If it matches, message N+1 skips that part.
 *
 * The cursor is reset at the start of every render of the provider
 * (which wraps the Thread). This is intentionally impure — refs + render
 * order — but it works because a thread's message list renders in order
 * and we only need "was the PREVIOUS tool call identical."
 */

import { createContext, useContext, useRef, type ReactNode } from "react";

interface DedupeCursor {
  /** Stringified `toolName::JSON(args)` of the last non-skipped tool call. */
  lastKey: string | null;
}

const DedupeContext = createContext<{ current: DedupeCursor } | null>(null);

export function ToolDedupeProvider({ children }: { children: ReactNode }) {
  // useRef so the cursor identity is stable across renders, but mutate
  // the inner `lastKey` at the start of every render to reset. This is
  // the classic "impure render reset" pattern — fine here because we
  // want every fresh render pass to start with a clean cursor.
  const ref = useRef<DedupeCursor>({ lastKey: null });
  ref.current.lastKey = null;
  return <DedupeContext.Provider value={ref}>{children}</DedupeContext.Provider>;
}

/**
 * Returns the shared cursor. If no provider is mounted above, returns
 * a throwaway local cursor — the caller still works, dedup just
 * degrades to within-message scope.
 */
export function useToolDedupeCursor(): { current: DedupeCursor } {
  const fallback = useRef<DedupeCursor>({ lastKey: null });
  const ctx = useContext(DedupeContext);
  return ctx ?? fallback;
}
