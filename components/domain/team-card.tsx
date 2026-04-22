"use client";

import { useState, useCallback, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Zap, Globe, Database, Cpu, Copy, Check } from "lucide-react";
import { Markdown } from "@/components/ui/markdown";
import { ProviderIcon } from "@/components/chat/SourceChip";
import type { Team, ToolEntry, SubStep, Resource, ResourceType, RegistryTool, ToolCategory, TeamId } from "@/lib/agent/workflow-registry";
import { TOOL_REGISTRY } from "@/lib/agent/workflow-registry";

// ── Team label map ─────────────────────────────────────────────────────────

const TEAM_LABELS: Partial<Record<TeamId, string>> = {
  builder:      "Builder",
  agent:        "Research Agent",
  intelligence: "Intel Pipeline",
  briefing:     "Briefing Agent",
  evaluation:   "Evaluation",
};

// ── Resource type config ──────────────────────────────────────────────────

// ── GPT logo ───────────────────────────────────────────────────────────────

function GptLogo({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 320" fill="currentColor" className={className}>
      <path d="m297.06 130.97c7.26-21.79 4.76-45.66-6.85-65.48-17.46-30.4-52.56-46.04-86.84-38.68-15.25-17.18-37.16-26.95-60.13-26.81-35.04-.08-66.13 22.48-76.91 55.82-22.51 4.61-41.94 18.7-53.31 38.67-17.59 30.32-13.58 68.54 9.92 94.54-7.26 21.79-4.76 45.66 6.85 65.48 17.46 30.4 52.56 46.04 86.84 38.68 15.24 17.18 37.16 26.95 60.13 26.8 35.06.09 66.16-22.49 76.94-55.86 22.51-4.61 41.94-18.7 53.31-38.67 17.57-30.32 13.55-68.51-9.94-94.51zm-120.28 168.11c-14.03.02-27.62-4.89-38.39-13.88.49-.26 1.34-.73 1.89-1.07l63.72-36.8c3.26-1.85 5.26-5.32 5.24-9.07v-89.83l26.93 15.55c.29.14.48.42.52.74v74.39c-.04 33.08-26.83 59.9-59.91 59.97zm-128.84-55.03c-7.03-12.14-9.56-26.37-7.15-40.18.47.28 1.3.79 1.89 1.13l63.72 36.8c3.23 1.89 7.23 1.89 10.47 0l77.79-44.92v31.1c.02.32-.13.63-.38.83l-64.41 37.19c-28.69 16.52-65.33 6.7-81.92-21.95zm-16.77-139.09c7-12.16 18.05-21.46 31.21-26.29 0 .55-.03 1.52-.03 2.2v73.61c-.02 3.74 1.98 7.21 5.23 9.06l77.79 44.91-26.93 15.55c-.27.18-.61.21-.91.08l-64.42-37.22c-28.63-16.58-38.45-53.21-21.95-81.89zm221.26 51.49-77.79-44.92 26.93-15.54c.27-.18.61-.21.91-.08l64.42 37.19c28.68 16.57 38.51 53.26 21.94 81.94-7.01 12.14-18.05 21.44-31.2 26.28v-75.81c.03-3.74-1.96-7.2-5.2-9.06zm26.8-40.34c-.47-.29-1.3-.79-1.89-1.13l-63.72-36.8c-3.23-1.89-7.23-1.89-10.47 0l-77.79 44.92v-31.1c-.02-.32.13-.63.38-.83l64.41-37.16c28.69-16.55 65.37-6.7 81.91 22 6.99 12.12 9.52 26.31 7.15 40.1zm-168.51 55.43-26.94-15.55c-.29-.14-.48-.42-.52-.74v-74.39c.02-33.12 26.89-59.96 60.01-59.94 14.01 0 27.57 4.92 38.34 13.88-.49.26-1.33.73-1.89 1.07l-63.72 36.8c-3.26 1.85-5.26 5.31-5.24 9.06l-.04 89.79zm14.63-31.54 34.65-20.01 34.65 20v40.01l-34.65 20-34.65-20z" />
    </svg>
  );
}

const RESOURCE_TYPE_META: Record<ResourceType, { icon: typeof Zap; label: string }> = {
  api: { icon: Zap, label: "API" },
  website: { icon: Globe, label: "Scraper" },
  db: { icon: Database, label: "Database" },
  internal: { icon: Cpu, label: "Internal" },
};

// ── Sidebar open icon (from user's SVG) ────────────────────────────────────

export function SidebarOpenIcon({ className }: { className?: string }) {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      className={className}
    >
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="5"
        stroke="currentColor"
        strokeWidth="2"
      />
      <path
        d="M2 8C2 4.68629 4.68629 2 8 2H10V22H8C4.68629 22 2 19.3137 2 16V8Z"
        fill="currentColor"
      />
    </svg>
  );
}

// ── Tool detail dialog ────────────────────────────────────────────────────

function ToolDetailDialog({
  tool,
  open,
  onOpenChange,
  agents,
}: {
  tool: ToolEntry | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Always-shown: which workflow agents have this tool active */
  agents?: TeamId[];
}) {
  const [activeIdx, setActiveIdx] = useState(0);

  // Reset to first resource when tool changes
  useEffect(() => { setActiveIdx(0); }, [tool]);

  if (!tool || !tool.resources?.length) return null;

  const hasMultiple = tool.resources.length > 1;
  const single = tool.resources[0];
  const singleMeta = RESOURCE_TYPE_META[single.type];
  const active = tool.resources[activeIdx] ?? single;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {hasMultiple ? (
          <>
            {/* Multi-resource: tool header + badge selectors */}
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <ProviderIcon provider={tool.provider} size={16} />
                <code className="text-sm font-mono font-medium">{tool.name}</code>
              </div>
              <DialogTitle className="sr-only">{tool.name}</DialogTitle>
              <DialogDescription>{tool.summary}</DialogDescription>
            </DialogHeader>

            {/* Badge row — scrollable for many resources */}
            <div className="flex gap-1.5 overflow-x-auto pb-1 -mb-1">
              {tool.resources.map((r, i) => (
                <button
                  key={r.title}
                  type="button"
                  onClick={() => setActiveIdx(i)}
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    i === activeIdx
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-transparent text-muted-foreground border-border hover:bg-accent/50"
                  }`}
                >
                  {r.title}
                </button>
              ))}
            </div>

            <ResourceTabContent resource={active} />
          </>
        ) : (
          <>
            {/* Single resource: source header layout */}
            <DialogHeader>
              <div className="flex items-center gap-2 mb-1">
                <ProviderIcon provider={single.source} size={16} />
                <span className="text-sm font-medium">{single.source}</span>
                <Badge variant="secondary" className="text-[10px]">
                  {singleMeta.label}
                </Badge>
              </div>
              <DialogTitle>{single.title}</DialogTitle>
              <DialogDescription>{single.description}</DialogDescription>
            </DialogHeader>
            <ResourceEndpoint resource={single} />
          </>
        )}
        {/* Active in — always shown when agents are known */}
        {agents && agents.length > 0 && (
          <div>
            <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
              Active in
            </span>
            <div className="flex flex-wrap gap-1 mt-1">
              {agents.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-[10px] font-mono text-muted-foreground"
                >
                  {TEAM_LABELS[id] ?? id}
                </span>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** For multi-resource tabs: description + endpoint */
function ResourceTabContent({ resource }: { resource: Resource }) {
  return (
    <div className="space-y-3 pt-1">
      <p className="text-xs text-muted-foreground leading-relaxed">
        {resource.description}
      </p>
      <ResourceEndpoint resource={resource} />
    </div>
  );
}

/** Endpoint bar + example + notes (shared between single and tabbed views) */
function ResourceEndpoint({ resource }: { resource: Resource }) {
  const meta = RESOURCE_TYPE_META[resource.type];
  const TypeIcon = meta.icon;

  return (
    <div className="space-y-3">
      {/* Endpoint bar */}
      <div className="rounded-md border bg-muted/30 px-2.5 py-2 flex items-center gap-1.5">
        <TypeIcon className="h-3 w-3 text-muted-foreground/60 shrink-0" />
        <code className="text-[11px] text-foreground break-all flex-1">
          {resource.endpointOrPath}
        </code>
        {resource.type === "api" && (
          <Badge variant="secondary" className="text-[10px] shrink-0">
            GET
          </Badge>
        )}
      </div>

      {/* Example */}
      {resource.exampleOutput && (
        <div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
            Example
          </span>
          <p className="text-xs text-muted-foreground leading-relaxed mt-0.5">
            {resource.exampleOutput}
          </p>
        </div>
      )}

      {/* Notes */}
      {resource.notes?.length ? (
        <div>
          <span className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60">
            Notes
          </span>
          <ul className="mt-0.5 space-y-0">
            {resource.notes.map((note, i) => (
              <li key={i} className="text-[11px] text-muted-foreground leading-relaxed">
                · {note}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

// ── Source pill ────────────────────────────────────────────────────────────

function SourcePill({ provider }: { provider: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5">
      <ProviderIcon provider={provider} size={12} />
      <span className="text-[10px] text-muted-foreground">{provider}</span>
    </span>
  );
}

// ── Tool card ─────────────────────────────────────────────────────────────

export function ToolCard({
  tool,
  onClick,
  agents,
}: {
  tool: ToolEntry;
  onClick?: () => void;
  /** When provided, agent badges are shown below the provider pills */
  agents?: TeamId[];
}) {
  const hasDetail = tool.resources && tool.resources.length > 0;

  // Collect unique providers from resources (or fall back to tool.provider)
  const providers = tool.resources?.length
    ? [...new Set(tool.resources.map((r) => r.source))]
    : [tool.provider];

  return (
    <Card className="p-0 overflow-hidden">
      <button
        type="button"
        disabled={!hasDetail}
        onClick={onClick}
        className="w-full text-left px-3 py-2.5 space-y-1.5 hover:bg-accent/30 transition-colors disabled:hover:bg-transparent"
      >
        <code className="text-xs font-mono font-medium">{tool.name}</code>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {tool.summary}
        </p>
        <div className="flex items-center justify-between gap-2 pt-0.5 flex-wrap">
          <div className="flex items-center gap-1 flex-wrap">
            {providers.map((p) => (
              <SourcePill key={p} provider={p} />
            ))}
          </div>
          {agents && agents.length > 0 && (
            <div className="flex items-center gap-1 flex-wrap">
              {agents.map((id) => (
                <span
                  key={id}
                  className="inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-mono text-muted-foreground"
                >
                  {TEAM_LABELS[id] ?? id}
                </span>
              ))}
            </div>
          )}
        </div>
      </button>
    </Card>
  );
}

// ── Sub-step row ───────────────────────────────────────────────────────────

function SubStepRow({ step, index }: { step: SubStep; index: number }) {
  return (
    <div className="flex items-start gap-2.5 py-1">
      {step.time ? (
        <Badge variant="outline" className="shrink-0 text-[10px] font-mono tabular-nums mt-0.5">
          {step.time}
        </Badge>
      ) : (
        <span className="text-[10px] text-muted-foreground/50 font-mono tabular-nums w-4 shrink-0 text-center mt-0.5">
          {index + 1}
        </span>
      )}
      <div className="flex-1 min-w-0">
        <span className="text-xs font-medium">{step.title}</span>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {step.summary}
        </p>
      </div>
    </div>
  );
}

// ── Prompt banner + dialog ──────────────────────────────────────────────────

function PromptBanner({ team }: { team: Team }) {
  const [open, setOpen] = useState(false);
  const [promptText, setPromptText] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // Lazy-load prompt when dialog opens
  useEffect(() => {
    if (open && promptText === null && team.getPrompt) {
      team.getPrompt().then(setPromptText);
    }
  }, [open, promptText, team]);

  const handleCopy = useCallback(() => {
    if (promptText) {
      navigator.clipboard.writeText(promptText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [promptText]);

  return (
    <>
      <Card className="p-0 overflow-hidden">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="flex items-center gap-3 w-full text-left px-3 py-2.5 hover:bg-accent/30 transition-colors"
        >
          {/* GPT icon in rounded square */}
          <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
            <GptLogo className="h-5 w-5 text-muted-foreground" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium">{team.title} Prompt</span>
              {team.model && (
                <Badge variant="secondary" className="text-[10px]">{team.model}</Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {team.getPrompt
                ? "View the full system prompt sent to the agent"
                : `Defined in ${team.promptSource}`}
            </p>
          </div>
        </button>
      </Card>

      {/* Prompt dialog — full-screen-ish like finding detail */}
      {team.getPrompt && (
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-lg bg-muted flex items-center justify-center shrink-0">
                  <GptLogo className="h-5 w-5 text-muted-foreground" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <DialogTitle className="text-sm">{team.title} Prompt</DialogTitle>
                    {team.model && (
                      <Badge variant="secondary" className="text-[10px]">{team.model}</Badge>
                    )}
                  </div>
                  {team.promptSource && (
                    <p className="text-[11px] text-muted-foreground mt-0.5">
                      <code>{team.promptSource}</code>
                    </p>
                  )}
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  disabled={!promptText}
                >
                  {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy"}
                </Button>
              </div>
              <DialogDescription className="sr-only">
                System prompt for {team.title}
              </DialogDescription>
            </DialogHeader>

            {/* Scrollable prompt content */}
            <div className="-mx-4 no-scrollbar max-h-[60vh] overflow-y-auto px-4">
              {promptText ? (
                <div className="rounded-lg border bg-muted/20 px-4 py-3">
                  <Markdown variant="compact">{promptText}</Markdown>
                </div>
              ) : (
                <p className="text-xs text-muted-foreground py-8 text-center">Loading prompt...</p>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}

// ── Team sheet content ─────────────────────────────────────────────────────
// Renders a team's full content for use inside a sheet.

export function TeamSheetContent({ team }: { team: Team }) {
  const [selectedTool, setSelectedTool] = useState<ToolEntry | null>(null);
  const [selectedToolAgents, setSelectedToolAgents] = useState<TeamId[] | undefined>();
  const [dialogOpen, setDialogOpen] = useState(false);

  const handleToolClick = useCallback((tool: ToolEntry) => {
    setSelectedTool(tool);
    // Look up agents from registry for the dialog — don't show on the card (implied by team context)
    setSelectedToolAgents(TOOL_REGISTRY.find((rt) => rt.name === tool.name)?.agents);
    setDialogOpen(true);
  }, []);

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold">{team.title}</h2>
          {team.model && (
            <Badge variant="secondary" className="text-[10px]">{team.model}</Badge>
          )}
          <Badge variant="outline" className="text-[10px]">{team.schedule}</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          {team.description}
        </p>
      </div>

      {/* Prompt banner */}
      {(team.getPrompt || team.promptSource) && (
        <PromptBanner team={team} />
      )}

      <Separator />

      {/* Sub-steps */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-2">
          Steps
        </p>
        <div className="space-y-0.5">
          {team.substeps.map((step, i) => (
            <SubStepRow key={i} step={step} index={i} />
          ))}
        </div>
      </div>

      <Separator />

      {/* Tools */}
      <div>
        <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-2">
          Tools
          <span className="ml-1.5 text-muted-foreground/40">{team.tools.length}</span>
        </p>
        <div className="space-y-1.5">
          {team.tools.map((tool, i) => (
            <ToolCard
              key={i}
              tool={tool}
              onClick={tool.resources?.length ? () => handleToolClick(tool) : undefined}
            />
          ))}
        </div>
      </div>

      <ToolDetailDialog
        tool={selectedTool}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        agents={selectedToolAgents}
      />
    </div>
  );
}

// ── Workflow step card (for /agent-workflow page) ──────────────────────────

export function WorkflowStepCard({
  team,
  onOpenSheet,
}: {
  team: Team;
  onOpenSheet: () => void;
}) {
  return (
    <Card className="p-0 overflow-hidden">
      <div className="flex items-start gap-3 px-4 py-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">{team.title}</span>
            {team.model && (
              <Badge variant="secondary" className="text-[10px]">{team.model}</Badge>
            )}
            <Badge variant="outline" className="text-[10px]">{team.schedule}</Badge>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
            {team.summary}
          </p>
        </div>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger
              render={
                <button
                  type="button"
                  onClick={onOpenSheet}
                  className="shrink-0 p-1.5 rounded-md hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground mt-0.5"
                />
              }
            >
              <SidebarOpenIcon />
            </TooltipTrigger>
            <TooltipContent side="left">View details</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>
    </Card>
  );
}

// ── Tools Registry sheet content ──────────────────────────────────────────
// Renders all tools from TOOL_REGISTRY grouped by category using the
// existing ToolCard / ToolDetailDialog components.

const CATEGORY_LABELS: Record<ToolCategory, string> = {
  intelligence: "Intelligence",
  research:     "Research",
  action:       "Action",
  system:       "System",
};

const CATEGORY_ORDER: ToolCategory[] = ["intelligence", "research", "action", "system"];

function toToolEntry(rt: RegistryTool): ToolEntry {
  return {
    name: rt.name,
    provider: rt.providers[0] ?? "internal",
    summary: rt.summary,
    resources: rt.resources,
  };
}

export function ToolsRegistrySheetContent() {
  const [selectedRT, setSelectedRT] = useState<RegistryTool | null>(null);

  const handleToolClick = useCallback((rt: RegistryTool) => {
    setSelectedRT(rt);
  }, []);

  return (
    <div className="space-y-5">
      <div className="space-y-2">
        <div className="flex items-center gap-2 flex-wrap">
          <h2 className="text-sm font-semibold">Tools Registry</h2>
          <Badge variant="outline" className="text-[10px]">{TOOL_REGISTRY.length} tools</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">
          All tools available to agents. Click any tool with a data source to see endpoint details.
        </p>
      </div>

      <Separator />

      {CATEGORY_ORDER.map((cat) => {
        const tools = TOOL_REGISTRY.filter((t) => t.category === cat);
        if (tools.length === 0) return null;
        return (
          <div key={cat}>
            <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground/60 mb-2">
              {CATEGORY_LABELS[cat]}
              <span className="ml-1.5 text-muted-foreground/40">{tools.length}</span>
            </p>
            <div className="space-y-1.5">
              {tools.map((rt) => {
                const entry = toToolEntry(rt);
                return (
                  <ToolCard
                    key={rt.name}
                    tool={entry}
                    agents={rt.agents}
                    onClick={entry.resources?.length ? () => handleToolClick(rt) : undefined}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <ToolDetailDialog
        tool={selectedRT ? toToolEntry(selectedRT) : null}
        agents={selectedRT?.agents}
        open={selectedRT !== null}
        onOpenChange={(open) => { if (!open) setSelectedRT(null); }}
      />
    </div>
  );
}

// ── Flow connector ─────────────────────────────────────────────────────────

export function FlowConnector() {
  return (
    <div className="flex flex-col items-center">
      <div className="w-px h-4 bg-border" />
      <div className="h-1.5 w-1.5 rounded-full border border-border bg-background" />
      <div className="w-px h-4 bg-border" />
    </div>
  );
}
