/**
 * ask_question — structured-interview primitive used by the Analyst
 * Builder, Editor, and Manager agents.
 *
 * The agent calls this to ask the user a single well-scoped question
 * with a small set of quick-reply options. The server-side execute is
 * a no-op echo — the actual "answer" arrives as the next user message,
 * appended by the client when the user submits a selection. This lets
 * us use Vercel AI SDK streamText out of the box without plumbing
 * addToolResult callbacks.
 *
 * The emitted `data` payload conforms to the Tool-UI Question Flow
 * library's `SerializableProgressiveMode` schema (one step at a time)
 * so the renderer can pass it straight into <QuestionFlow />.
 *   https://www.tool-ui.com/docs/question-flow
 *
 * Design rules (keep the agent disciplined, keep UX tight):
 *   - ONE question per call. Stacking multiple questions kills the flow.
 *   - 2-5 options. Fewer than 2 is not multiple-choice; more than 5
 *     overwhelms.
 *   - question must be a complete, stand-alone sentence ending in "?".
 *   - Only call when the answer would materially change what you
 *     propose. Don't quiz the user for fun.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";

/** Slugify an option label into a stable id (a–z, 0–9, dashes). */
function toOptionId(label: string, i: number): string {
  const slug = label
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug.length > 0 ? slug : `opt-${i + 1}`;
}

export const askQuestion = defineTool({
  description:
    "Ask the user ONE focused question with 2-5 quick-reply options. Use this to drive a structured interview when building or editing an analyst — do NOT use open-ended chat when you need a specific discrete input. " +
    "Only call when the answer would materially change your next suggestion. One question per call. Set selectionMode='multi' when the user can pick several options (e.g. sectors, themes).",
  schema: z.object({
    question: z
      .string()
      .describe(
        "The question text. Must be a complete sentence ending in '?'. Self-contained — do not rely on prior messages for context.",
      ),
    description: z
      .string()
      .optional()
      .describe(
        "Optional one-line helper text shown under the question. Use to clarify scope — e.g. 'Pick the one that best matches your style.'",
      ),
    options: z
      .array(
        z.object({
          label: z
            .string()
            .describe("Short quick-reply label (≤ 40 chars)."),
          description: z
            .string()
            .optional()
            .describe("Optional one-line subtext explaining the choice."),
        }),
      )
      .min(2)
      .max(5)
      .describe("2-5 plausible answers. Avoid yes/no unless truly binary."),
    selectionMode: z
      .enum(["single", "multi"])
      .optional()
      .describe(
        "'single' (default) picks one; 'multi' lets the user pick several (e.g. sectors, themes).",
      ),
    purpose: z
      .string()
      .optional()
      .describe(
        "Short internal tag for telemetry — e.g. 'direction_bias', 'hold_duration', 'theme_choice'. Not shown to the user.",
      ),
  }),
  ui: "ask-question" as const,

  // NOTE: intentionally no groupId and no progressLabel.
  // Questions render as a standalone QuestionFlow panel — no progress row,
  // no ToolProgress wrapper, no group header. The question itself is the UI.

  execute: async (args, ctx) => {
    // Shape the payload for the Tool-UI Question Flow library
    // (SerializableProgressiveMode).
    const options = args.options.map((opt, i) => ({
      id: toOptionId(opt.label, i),
      label: opt.label,
      ...(opt.description ? { description: opt.description } : {}),
    }));

    return {
      summary: args.question,
      data: {
        // Question Flow serializable schema
        id: `ask-${ctx.runId}-${Date.now()}`,
        step: 1,
        title: args.question,
        ...(args.description ? { description: args.description } : {}),
        options,
        selectionMode: args.selectionMode ?? "single",
        // Internal metadata
        purpose: args.purpose ?? null,
      },
      sources: [],
    };
  },
});
