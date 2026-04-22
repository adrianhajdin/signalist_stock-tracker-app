"use client";

/**
 * ChatRuntime — the single source of truth for chat transport setup.
 *
 * Every chat surface in this app (analyst builder, editor, agent runs,
 * entry composers) renders this instead of constructing their own
 * DefaultChatTransport + useChatRuntime + AssistantRuntimeProvider.
 *
 * api and body are treated as mount-time values (captured via ref).
 * The transport is created once and never recreated — this matches the
 * intended lifecycle: a chat session is tied to the page it was opened on.
 */

import { useRef, useMemo, type ReactNode } from "react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { useChatRuntime } from "@assistant-ui/react-ai-sdk";
import { AssistantRuntimeProvider } from "@assistant-ui/react";

export interface ChatRuntimeProps {
  /** API route this chat posts to */
  api: string;
  /** Extra context sent with every message (runId, analystId, config, etc.) */
  body?: Record<string, unknown>;
  /** Pre-loaded messages for replay — pass for completed runs */
  messages?: UIMessage[];
  children: ReactNode;
}

export function ChatRuntime({ api, body, messages, children }: ChatRuntimeProps) {
  // api and initial messages are captured at mount (session-scoped)
  const apiRef = useRef(api);
  const messagesRef = useRef(messages);

  // Body proxy — same object reference, mutated on every render so the
  // transport picks up dynamic changes (e.g. model switches) on next send.
  const bodyProxyRef = useRef<Record<string, unknown>>({});
  // Sync: add/update keys from current body, remove keys no longer present
  const currentBody = body ?? {};
  for (const k of Object.keys(bodyProxyRef.current)) {
    if (!(k in currentBody)) delete bodyProxyRef.current[k];
  }
  Object.assign(bodyProxyRef.current, currentBody);

  const runtime = useChatRuntime({
    transport: useMemo(
      () => new DefaultChatTransport({ api: apiRef.current, body: bodyProxyRef.current }),
      // eslint-disable-next-line react-hooks/exhaustive-deps
      [],
    ),
    ...(messagesRef.current?.length ? { messages: messagesRef.current } : {}),
  });

  return <AssistantRuntimeProvider runtime={runtime}>{children}</AssistantRuntimeProvider>;
}
