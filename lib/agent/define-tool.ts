/**
 * defineTool() — factory for the new tool pipeline.
 *
 * Wraps every tool execute function with:
 *   - Timing + structured logging
 *   - try/catch → ToolResult.ok:false on errors
 *   - Consistent ToolResult envelope (ok, ui, groupId, summary, data, sources)
 *
 * Usage:
 *   export const getEarningsData = defineTool({
 *     description: "Get earnings data for a ticker",
 *     schema: z.object({ ticker: z.string() }),
 *     ui: "ticker",
 *     groupId: "research",
 *     execute: async ({ ticker }, ctx) => {
 *       const data = await fetchEarnings(ticker);
 *       return { summary: `Earnings for ${ticker}`, data, sources: [] };
 *     },
 *   });
 *
 *   // In the route:
 *   const tools = { get_earnings_data: getEarningsData(ctx) };
 */

import { tool } from "ai";
import type { z } from "zod";
import type { ToolContext } from "./tool-context";
import type { ToolUI, ToolSource, ToolResult } from "./tool-result";
import type { AgentMode } from "./modes";

interface DefineToolOptions<TSchema extends z.ZodTypeAny, TData = unknown> {
  description: string;
  /** Zod schema for input args */
  schema: TSchema;
  /** Which UI renderer handles this tool's result */
  ui: ToolUI;
  /** Optional phase key — tools with the same groupId collapse in the UI */
  groupId?: string;
  /**
   * Produces a human-readable, present-tense gerund label from the args —
   * shown in the tool row and used to derive the group header. A good
   * label reads like a Chain-of-Thought line:
   *   "Reading the Momentum Breakout playbook"
   *   "Checking today's market regime"
   *   "Pulling $NVDA's snapshot"
   * If omitted, the UI falls back to the tool name.
   */
  progressLabel?: (args: z.infer<TSchema>) => string;
  /** If set, this tool is only included when the mode matches */
  modes?: AgentMode[];
  execute: (
    args: z.infer<TSchema>,
    ctx: ToolContext,
  ) => Promise<{
    summary: string;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data: any;
    sources?: ToolSource[];
    /**
     * Optional per-call UI override. Defaults to options.ui set on the
     * factory. Use when a single tool returns differently-shaped results
     * that need distinct renderers — e.g. read_knowledge_library emits
     * `generic` for an index listing but `playbook` for a specific
     * archetype entry so the user sees the full spec.
     */
    ui?: ToolUI;
  }>;
}

/** A defineTool call returns a "tool factory" — call it with ctx to get an AI SDK tool. */
export type ToolFactory<TSchema extends z.ZodTypeAny, TData = unknown> = (
  ctx: ToolContext,
) => ReturnType<typeof tool<TSchema, ToolResult<TData>>>;

export function defineTool<TSchema extends z.ZodTypeAny, TData = unknown>(
  options: DefineToolOptions<TSchema, TData>,
): ToolFactory<TSchema, TData> {
  return function makeToolInstance(ctx: ToolContext) {
    // AI SDK v6 `tool()` narrows the schema generic through Zod v4's
    // `$ZodType` internals, which TS can't unify with our generic
    // `z.ZodTypeAny` parameter at the factory boundary. Runtime behavior
    // is fine; cast is scoped to the tool() call-site only.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return tool<TSchema, ToolResult<TData>>({
      description: options.description,
      inputSchema: options.schema as any,
      execute: async (args): Promise<ToolResult<TData>> => {
        const t0 = Date.now();
        const resolvedGroupId = options.groupId
          ? ctx.groupId(options.groupId)
          : undefined;
        const label = options.description.slice(0, 40);

        console.log(`[tool] START "${label}" runId=${ctx.runId}`);

        // Compute the human progress label from args once. Wrapped in
        // try/catch so a malformed label builder can never break the tool.
        let progressLabel: string | undefined;
        if (options.progressLabel) {
          try {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            progressLabel = options.progressLabel(args as any);
          } catch {
            progressLabel = undefined;
          }
        }

        try {
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const result = await options.execute(args as any, ctx);
          const elapsed = Date.now() - t0;
          console.log(`[tool] END "${label}" ${elapsed}ms runId=${ctx.runId}`);

          return {
            ok: true as const,
            ui: result.ui ?? options.ui,
            ...(resolvedGroupId !== undefined ? { groupId: resolvedGroupId } : {}),
            ...(progressLabel !== undefined ? { progressLabel } : {}),
            summary: result.summary,
            data: result.data,
            sources: result.sources ?? [],
          };
        } catch (err) {
          const elapsed = Date.now() - t0;
          const msg = err instanceof Error ? err.message : "Tool failed";
          console.error(
            `[tool] FAILED "${label}" ${elapsed}ms runId=${ctx.runId}:`,
            msg,
          );
          return {
            ok: false as const,
            error: msg,
            retryable: false,
            sources: [],
          };
        }
      },
    });
  };
}
