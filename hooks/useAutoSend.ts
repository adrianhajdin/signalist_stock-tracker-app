"use client";

import { useEffect, useRef } from "react";
import { useThreadRuntime } from "@assistant-ui/react";

/**
 * Auto-send a message into the current thread once.
 *
 * IMPORTANT: hasSent is set to true *inside* the setTimeout callback,
 * not before. The new ChatRuntime wrapper causes useThreadRuntime() to
 * return a fresh reference on every render — if we set hasSent.current
 * eagerly, the effect's cleanup cancels the timer before it fires,
 * the effect re-runs, sees hasSent=true, and gives up forever. The
 * "Run" message would never be sent and the agent stream would never
 * start. Setting hasSent inside the callback means a re-run before
 * the timer fires can create a fresh timer (the old one was cleared
 * by cleanup), and append() still happens exactly once.
 */
export function useAutoSend({
  message,
  delay = 300,
}: {
  message?: string;
  delay?: number;
}) {
  const threadRuntime = useThreadRuntime();
  const hasSent = useRef(false);

  useEffect(() => {
    if (!message || hasSent.current) return;
    const timer = setTimeout(() => {
      hasSent.current = true;
      threadRuntime.append({
        role: "user",
        content: [{ type: "text", text: message }],
      });
    }, delay);
    return () => clearTimeout(timer);
  }, [message, delay, threadRuntime]);
}
