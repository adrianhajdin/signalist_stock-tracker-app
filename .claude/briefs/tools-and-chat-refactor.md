# Tools & Chat Architecture Refactor — Brief for Fresh Agent Session

## Context

This is a paper-trading app called Hindsight. An AI agent researches stocks,
records theses, places paper trades via Alpaca, and learns from results. The
core surface is **the Run page** (`/runs/[id]`) where the agent streams in
research, calls tools, and the user can chat with it.

The user has been frustrated for many sessions about the chat / tools
architecture. Their words:

> "I asked for a Perplexity / Claude / Notion level architecture of a Chat
> and Tools product, first class, no cutting corners and no doing the easy
> way. I know that's not what I got. Seemingly there's still an entirely
> separate whole folder of code for the analyst run vs chatting with the
> analyst which is insane and makes no sense. I don't know how that's even
> possible. It's 1 chat. It's just a chat, and the runs go first
> automatically but you can also chat with it. I really don't know how this
> is possible. And 1 set of tools and then different ones are available /
> used for different agents obviously, like building an analyst doesn't
> need all the tools that a Run needs, but it should be 1 thing. 1 product.
> 1 set of tools and rendering and components."

**This brief is about the cleanup, not adding features.** The product should
behave identically before and after.

## What you're walking into

There are at least **four chat surfaces** that look like they should be one
thing, plus parallel tool registries, plus a 2813-line `tools.ts` file with
16 tools that each reinvent the same boilerplate.

### Chat surfaces (from a quick file scan)

| Surface | API route | Tool registry | Notes |
|---|---|---|---|
| Live agent run | `app/api/research/agent/route.ts` | `tool-uis/tool-ui-research.tsx` | The 8-phase research workflow. Streams in real time. Uses `useChat` from AI SDK v6. |
| Run followup chat | `app/api/chat/run-followup/route.ts` | `tool-uis/tool-ui-followup.tsx` | After a run completes, user can ask follow-up questions, place trades, etc. **Re-registers a subset of the same tools with slightly different render components.** |
| Analyst builder | `app/api/chat/analyst-builder/route.ts` | (own tools defined inline) | "Describe the analyst you want and I'll build it" wizard. |
| Analyst editor | `app/api/chat/analyst-editor/route.ts` | (own tools defined inline) | "Edit your analyst via chat" sheet from the analyst detail page. |

The user is right that this is a parallel system. The followup chat
literally imports `thesisRender`, `placeTradeRender`, and `closePositionRender`
from `tool-ui-research.tsx` and re-registers them under different tool names.
The analyst builder/editor have their own bespoke tool definitions that
overlap with the research tools (e.g. both can call `web_search`).

### `lib/agent/tools.ts` — 2813 lines, 16 tools

```
338  manage_watchlist
267  get_stock_data
261  place_trade
230  get_market_context
192  record_thesis
191  close_position
175  read_signals
155  record_run_summary
136  get_options_flow
121  complete_run
 92  read_morning_brief
 87  record_decision_plan
 74  web_search
 74  get_sec_filings
 55  get_earnings_data
```

Every single tool reinvents the same boilerplate:
- timing setup (`const _t0 = Date.now()`)
- `logToolStart(...)`, `logToolEnd(...)`, `logToolError(...)`
- try/catch wrapper with bespoke error return shape
- `_sources: [...]` array construction
- envelope shape `{ summary, tickers, _sources, data: { ... } }`

Half the tools forget to include `_sources` in their error path, which
silently breaks source-attribution chains. Several tools return slightly
different error envelope shapes, so the agent can't reliably recover from
errors because it doesn't know what shape to expect.

## Goals (in priority order)

### 1. ONE chat. ONE tool registry. ONE rendering layer.

Today the user has four separate codebases. The fix is a single chat
runtime parameterized by **mode**:

```ts
type ChatMode =
  | { kind: "research-run"; runId: string; analystId: string }
  | { kind: "run-followup"; runId: string; analystId: string }
  | { kind: "analyst-builder"; analystId?: string }
  | { kind: "analyst-editor"; analystId: string };
```

One API route. One tool registry. The mode determines:
- Which **subset** of tools is exposed to the agent (research-run gets all
  16; analyst-builder gets a smaller set focused on schema design + persona)
- Which **system prompt** is used
- Which **persistence layer** is hit (research runs persist to RunMessage;
  builder chats are ephemeral)

The render layer is shared across all modes — every tool has exactly one
React component that renders its result, and every chat shows that component
when the tool fires. The current "register the same tool twice with
different render components" pattern goes away.

### 2. Tool factory: one place for boilerplate, one shape for results

Replace the 16 hand-rolled tool blocks with a single factory:

```ts
export function defineTool<I, O>(spec: {
  name: string;
  description: string;
  schema: ZodSchema<I>;
  /** Which chat modes can call this tool */
  availableIn: ChatMode["kind"][];
  /** Pure business logic — the factory handles everything else */
  run: (input: I, ctx: ToolContext) => Promise<ToolResult<O>>;
}): Tool;
```

The factory handles:
- Timing + logging (no more `const _t0 = Date.now()` per tool)
- try/catch with consistent error envelope `{ ok: false, error: string, retryable: bool }`
- Auto-collecting `_sources` via `ctx.logSource(provider, title, url)`
- Auto-shaping the envelope: `{ summary, tickers, data, _sources }`
- Per-mode availability check

After this:
- Each tool definition shrinks from ~150 lines to ~30
- The agent can rely on a single error shape and recover from errors
- Source attribution can't silently break because the factory tracks it
- Adding a new tool is genuinely a 30-line commit

### 3. Result envelope is one shape, defined once

Today there are subtle variations between tools — some return `{ summary,
data }`, some return `{ summary, tickers, _sources, data }`, some put fields
at the top level instead of inside `data`. Pick one shape, type it strictly,
make the factory enforce it.

```ts
type ToolResult<T> =
  | { ok: true; summary: string; tickers?: TickerFinding[]; data: T; _sources: ToolSource[] }
  | { ok: false; error: string; retryable: boolean; _sources: ToolSource[] };
```

Every tool conforms. The render layer can pattern-match on `ok` and never
worry about which fields might be missing.

## Constraints

- **Don't change the agent's external behavior.** It still streams to
  `/runs/[id]`, still records theses, still places trades. Same prompt,
  same models, same tools. The user has invested heavily in the prompts and
  agent loop — you're refactoring the plumbing, not the brain.
- **Old persisted data still has to render.** Past runs in the DB have
  RunMessage rows with the OLD tool result shape baked in. The render layer
  needs a thin compatibility shim that maps old → new shape, OR the render
  layer needs to handle both shapes. Don't break replay of historical runs.
- **The streaming UX matters.** Tools can take 5-15 seconds to return. The
  agent fires multiple tools in sequence and the user watches them stream
  in. Whatever you build needs to preserve the in-progress / loading states
  per tool call.
- **Run a real agent end-to-end before merging.** Same input → byte-for-byte
  same final messages. This is the only way to know the refactor is safe.
  The user has a "Run" button on the analyst detail page that's the easiest
  way to test.

## Where to start (recommended order)

### Phase 1: Map the territory (READ ONLY, no code changes)

1. Read `lib/agent/tools.ts` end to end. Note the 16 tools, their input/output
   shapes, their `_sources` patterns, their error patterns. **List every
   variation in the result envelope you find.**
2. Read all four API routes:
   - `app/api/research/agent/route.ts`
   - `app/api/chat/run-followup/route.ts`
   - `app/api/chat/analyst-builder/route.ts`
   - `app/api/chat/analyst-editor/route.ts`
3. Read the registries:
   - `components/assistant-ui/tool-uis/tool-ui-research.tsx`
   - `components/assistant-ui/tool-uis/tool-ui-followup.tsx`
   - Any inline registries in the analyst builder/editor surfaces
4. Read `components/research/AgentThread.tsx` and the followup chat
   component to understand how `useChat` is wired up.
5. Write a one-page report identifying:
   - Every duplicated tool registration
   - Every result-envelope variation
   - Every place the four chat surfaces could share code but don't
   - The minimum compatibility shim needed for old persisted runs

**Stop and show this report to the user before writing any code.** They've
been burned before by agents that confidently rewrote things and broke them.

### Phase 2: Tool factory in isolation

1. Create `lib/agent/tool-factory.ts` with `defineTool` + the single
   `ToolResult<T>` type.
2. Migrate ONE simple tool first (`get_earnings_data`, 55 lines, lowest risk).
3. Run an agent end-to-end. Verify the byte-for-byte output is identical.
4. Migrate the rest in batches by complexity.
5. After each batch: tsc passes, dev server loads, run an agent.

### Phase 3: Unified chat runtime

1. Create `lib/chat/runtime.ts` that exports a single `createChatRoute({
   mode, runId?, analystId? })` function.
2. Migrate ONE chat surface first (`run-followup`, the simplest). Delete
   `tool-ui-followup.tsx` after the migration.
3. Then `research-run`. This is the biggest one and the one users see most.
4. Then `analyst-builder` and `analyst-editor`.
5. After each: tsc passes, dev server loads, the chat surface still works.

### Phase 4: Cleanup

- Delete the now-orphaned API routes
- Delete the now-orphaned tool registries
- Delete `tool-ui-followup.tsx` if it's still there

## Anti-patterns to avoid

- **Don't propose another big-bang EntityCard-style refactor.** The user
  has been burned by those. Each phase has to ship independently and be
  revertable in one `git revert`.
- **Don't change the design of any tool's UI rendering.** The thesis card,
  trade card, decision summary card — those are exactly how the user wants
  them. The only thing that changes is which file the render component
  lives in and how it's registered.
- **Don't introduce new abstractions that aren't justified by reducing
  duplication.** If a "factory" only saves 20 lines, it's not worth the
  indirection. The justification for `defineTool` is that 16 × 50 lines of
  boilerplate = 800 lines saved.
- **Don't touch the prompts.** The user has tuned them carefully.
- **Don't touch the agent's tool-calling loop or the AI SDK integration.**
  Those work. The work is BELOW that layer (tool implementations) and
  ABOVE it (rendering).

## Files of interest (rough sizes from a recent scan)

```
2813  lib/agent/tools.ts                                      ★ the big one
1248  lib/actions/analyst.actions.ts
 924  components/analysts/AnalystDetailClient.tsx
 879  components/assistant-ui/tool-uis/tool-ui-research.tsx
 723  components/Sidebar.tsx
 690  components/domain/thesis-card.tsx
 624  components/settings/AnalystsPage.tsx                    (deleted 4/8)
 618  lib/agent/update-analyst-briefing.ts
 582  components/trades/TradesPage.tsx
 531  lib/actions/portfolio.actions.ts
 516  app/api/research/agent/route.ts
 502  components/domain/onboarding-flow.tsx
 494  app/(root)/stocks/[symbol]/page.tsx
```

Plus everything in:
- `app/api/research/`
- `app/api/chat/`
- `components/assistant-ui/tool-uis/`
- `components/research/`

## What success looks like

1. **One** API route handles all four chat surfaces. The other three are
   thin redirects or deleted.
2. **One** tool registry. The factory exports a single `getToolsForMode(mode)`
   that returns the appropriate subset.
3. **One** result envelope. Strictly typed. Old persisted runs still render
   via a compatibility shim.
4. **`tools.ts` is well under 1500 lines** (down from 2813) because the
   boilerplate is gone.
5. **A new tool can be added in ~30 lines.** Validate this by adding one
   trivial new tool at the end of the refactor — e.g. `get_market_clock` —
   and showing the diff.
6. **The user runs an agent end-to-end and the messages are identical.**
7. **Old runs from before the refactor still replay correctly.**

## The user

- Not a developer. They can describe behavior, design, and frustration in
  detail but can't read TypeScript well. Don't ask them technical
  clarification questions; instead, show them options or do exploration
  first and propose a plan.
- Has been burned MANY times by agents that confidently rewrote things and
  broke them. Earn trust by showing the read-only Phase 1 report first.
- Cares deeply about the visual design and product feel. The cleanup is
  invisible to them; they're trusting that it will help future sessions
  ship faster without breaking what's already there.
- Will absolutely revert anything that breaks the live agent run. So make
  sure to test that path heavily.

## Known sharp edges

- **`text-[10px]` lint rule:** there's now an ESLint rule banning arbitrary
  pixel sizes in className. There are 143 existing baseline violations.
  Don't add new ones. (`eslint.config.mjs`)
- **`font-mono` lint rule:** same. Use `tabular-nums` for numbers/tickers.
- **Pre-commit hook runs `tsc --noEmit`:** if you commit broken code, the
  hook blocks you. Don't `--no-verify` your way around it.
- **The agent's `record_thesis` tool fires N times in a single message.**
  The render layer collects them all into one carousel via a forward-read
  pattern in `tool-ui-research.tsx`. Preserve this when migrating — see
  the `thesisRender` function for the read-forward implementation.
- **`useChat` from AI SDK v6 sends `UIMessage[]` (with a `parts` array) but
  `streamText` wants `ModelMessage[]`.** Use `convertToModelMessages()`
  between them. The current routes already do this; don't break it.
- **Old persisted runs use the original tool result shape.** Don't lose
  replay compatibility.
- **The AnalystDetailClient and Sidebar are huge files** with their own
  inline state management and data fetching. They're not part of this
  refactor, but if they're in your blast radius, leave them alone.

## What to deliver

A single PR per phase. Each PR:
- Has a clear "what changed / what's still the same" summary
- Has a test plan section the user can click through
- Doesn't change a single pixel of the UI design
- Can be reverted with one `git revert <sha>` if anything explodes
- Ends with a section called "What still uses the old pattern" so the
  user knows the migration is mid-flight and what's left

Ship Phase 1 (the read-only report) first. Get explicit user sign-off on
the plan before writing any code.

---

**Repo:** `dave-sucks/hindsight`
**Branch off:** `main`
**Worktree:** the user works in `/Users/davebixler/hindsight/.claude/worktrees/competent-haslett/`
**Pre-existing tsc errors:** 0 (don't introduce any; the pre-commit hook will block you)
**Current ESLint baseline warnings:** 143 (don't add to this; ideally reduce)
