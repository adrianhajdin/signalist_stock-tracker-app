/**
 * Convert persisted messages (mixed UIMessage + ModelMessage) back to
 * UIMessage[] for replaying completed agent runs via useChatRuntime.
 *
 * The agent route's onFinish saves [...clientUIMessages, ...responseModelMessages].
 * UIMessages have `parts` arrays; ModelMessages have `content` arrays with
 * `role: "assistant"` or `role: "tool"`.
 *
 * Output uses AI SDK v6 UIMessage format where tool parts are:
 *   { type: "tool-{toolName}", toolCallId, state: "output-available", input, output }
 *
 * The tool name is encoded in the `type` field (e.g. "tool-get_market_overview"),
 * NOT as a separate `toolName` prop. assistant-ui's runtime extracts the name via
 * getStaticToolName() which does: type.split("-").slice(1).join("-").
 */

import type { UIMessage } from "ai";

// We use a simple incrementing counter for IDs since these are replay-only
let idCounter = 0;
function genId() {
  return `replay-${idCounter++}`;
}

/**
 * Detect whether a raw message object is a UIMessage (has `parts`) or a
 * ModelMessage (has `content` as array with typed parts).
 */
function isUIMessage(msg: Record<string, unknown>): boolean {
  return Array.isArray(msg.parts);
}

/**
 * Unwrap a ToolResultOutput (from ModelMessage) to the raw tool result value.
 * ModelMessage tool-result parts store output as { type: "json"|"text", value: ... }.
 * UIMessage tool parts just store the raw value directly.
 */
function unwrapToolOutput(output: unknown): unknown {
  if (output && typeof output === "object" && "type" in output && "value" in output) {
    const wrapped = output as { type: string; value: unknown };
    if (wrapped.type === "json" || wrapped.type === "text") {
      return wrapped.value;
    }
  }
  // Already unwrapped or unknown format — return as-is
  return output;
}

/**
 * Build a v6 tool part with the correct type format.
 * AI SDK v6 uses `type: "tool-{toolName}"` (not "tool-invocation").
 */
function makeToolPart(opts: {
  toolName: string;
  toolCallId: string;
  input: unknown;
  output?: unknown;
  state: string;
}): UIMessage["parts"][number] {
  return {
    type: `tool-${opts.toolName}`,
    toolCallId: opts.toolCallId,
    state: opts.state,
    input: opts.input,
    ...(opts.output !== undefined ? { output: opts.output } : {}),
  } as unknown as UIMessage["parts"][number];
}

/**
 * Convert the raw persisted JSON array into UIMessage[] that useChatRuntime
 * can accept as initialMessages with proper tool parts.
 */
export function convertPersistedToUIMessages(raw: unknown[]): UIMessage[] {
  idCounter = 0;
  const result: UIMessage[] = [];
  // Track the current assistant UIMessage being built so we can attach
  // tool results from subsequent "tool" ModelMessages.
  let currentAssistant: UIMessage | null = null;

  for (const rawMsg of raw) {
    const msg = rawMsg as Record<string, unknown>;

    // ── Already a UIMessage (from the client input) ──────────────────
    if (isUIMessage(msg)) {
      currentAssistant = null;
      const rawParts = msg.parts as Record<string, unknown>[];
      const parts: UIMessage["parts"] = [];
      for (const p of rawParts) {
        if (p.type === "text") {
          parts.push({ type: "text", text: p.text as string });
        } else if (p.type === "tool-invocation") {
          // Legacy v5 format — convert to v6 "tool-{name}" format
          const toolName = p.toolName as string;
          parts.push(
            makeToolPart({
              toolName,
              toolCallId: (p.toolCallId as string) || genId(),
              input: p.args ?? p.input ?? {},
              output: p.result ?? p.output,
              state: p.state === "result" ? "output-available" : (p.state as string) ?? "output-available",
            }),
          );
        } else if (
          typeof p.type === "string" &&
          (p.type as string).startsWith("tool-")
        ) {
          // Already v6 format (type: "tool-{name}") — pass through with normalization
          parts.push({
            type: p.type,
            toolCallId: (p.toolCallId as string) || genId(),
            state: p.state ?? "output-available",
            input: p.input ?? p.args ?? {},
            ...(p.output !== undefined ? { output: p.output } : {}),
            ...(p.result !== undefined && p.output === undefined ? { output: p.result } : {}),
          } as unknown as UIMessage["parts"][number]);
        }
      }
      result.push({
        id: (msg.id as string) || genId(),
        role: msg.role as UIMessage["role"],
        parts,
      });
      continue;
    }

    const role = msg.role as string;
    const content = msg.content as unknown;

    // ── User ModelMessage ────────────────────────────────────────────
    if (role === "user") {
      currentAssistant = null;
      const parts: UIMessage["parts"] = [];
      if (typeof content === "string") {
        parts.push({ type: "text", text: content });
      } else if (Array.isArray(content)) {
        for (const c of content) {
          const p = c as Record<string, unknown>;
          if (p.type === "text") {
            parts.push({ type: "text", text: p.text as string });
          }
        }
      }
      result.push({ id: genId(), role: "user", parts });
      continue;
    }

    // ── Assistant ModelMessage ────────────────────────────────────────
    if (role === "assistant") {
      const uiMsg: UIMessage = {
        id: genId(),
        role: "assistant",
        parts: [],
      };

      if (Array.isArray(content)) {
        for (const c of content) {
          const p = c as Record<string, unknown>;
          if (p.type === "text" && (p.text as string)?.length > 0) {
            uiMsg.parts.push({ type: "text", text: p.text as string });
          } else if (p.type === "tool-call") {
            // ModelMessage tool-call: { type: "tool-call", toolCallId, toolName, input }
            // Convert to UIMessage: { type: "tool-{toolName}", toolCallId, state, input }
            // State starts as "input-available" — will be upgraded to "output-available"
            // when the corresponding tool-result ModelMessage is processed.
            uiMsg.parts.push(
              makeToolPart({
                toolName: p.toolName as string,
                toolCallId: p.toolCallId as string,
                input: p.input ?? p.args ?? {},
                state: "input-available",
              }),
            );
          }
        }
      }

      currentAssistant = uiMsg;
      result.push(uiMsg);
      continue;
    }

    // ── Tool ModelMessage (results) ──────────────────────────────────
    if (role === "tool") {
      if (!currentAssistant || !Array.isArray(content)) continue;

      for (const c of content) {
        const p = c as Record<string, unknown>;
        if (p.type === "tool-result") {
          // ModelMessage tool-result: { type: "tool-result", toolCallId, toolName, output }
          // output is ToolResultOutput: { type: "json"|"text", value: ... }
          // Need to unwrap to raw value for UIMessage format.
          const toolPart = currentAssistant.parts.find(
            (part) => {
              const raw = part as Record<string, unknown>;
              return (
                typeof raw.type === "string" &&
                (raw.type as string).startsWith("tool-") &&
                raw.toolCallId === p.toolCallId
              );
            },
          ) as Record<string, unknown> | undefined;

          if (toolPart) {
            toolPart.state = "output-available";
            toolPart.output = unwrapToolOutput(p.output ?? p.result);
          }
        }
      }
      continue;
    }
  }

  return result;
}
