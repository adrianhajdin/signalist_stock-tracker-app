"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MultiCombobox } from "@/components/ui/multi-combobox";
// Session A established lib/universe/canonical as the single source of truth
// for sector/industry vocabulary. Importing SECTORS/INDUSTRIES here keeps the
// combobox options aligned with the alias table + normalization helpers — so
// the values the user picks here are exactly what the router will compare.
import { SECTORS, INDUSTRIES } from "@/lib/universe/canonical";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Markdown } from "@/components/ui/markdown";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { InfoRow } from "@/components/ui/info-row";
import { Info, Search } from "lucide-react";
import {
  updateAnalystField,
} from "@/lib/actions/analyst.actions";
import type { AnalystConfig } from "@/lib/actions/analyst.actions";

interface AnalystConfigSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: AnalystConfig;
}

export function AnalystConfigSheet({
  open,
  onOpenChange,
  config,
}: AnalystConfigSheetProps) {
  const [, startTransition] = useTransition();

  const saveField = (field: Parameters<typeof updateAnalystField>[1], value: unknown) => {
    startTransition(async () => {
      await updateAnalystField(config.id, field, value);
    });
  };

  const policy = config.intelligencePolicy;

  function titleCase(s: string) {
    return s.charAt(0) + s.slice(1).toLowerCase().replace(/_/g, " ");
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-[420px] sm:max-w-[420px] overflow-y-auto"
      >
        <SheetHeader>
          <SheetTitle className="text-sm font-semibold">Configuration</SheetTitle>
          <SheetDescription className="text-xs">
            Edit settings directly or use the AI chat.
          </SheetDescription>
        </SheetHeader>

        <Tabs defaultValue="strategy">
          <TabsList className="mx-3">
            <TabsTrigger value="strategy">Strategy</TabsTrigger>
            <TabsTrigger value="config">Config</TabsTrigger>
          </TabsList>

          {/* ── Strategy (analystPrompt) ────────────────────────── */}
          <TabsContent value="strategy" className="p-3">
            {config.analystPrompt ? (
              <Markdown variant="compact">{config.analystPrompt}</Markdown>
            ) : (
              <p className="text-xs text-muted-foreground">
                No strategy prompt set yet. Use the AI chat to write one.
              </p>
            )}
          </TabsContent>

          {/* ── Config fields ───────────────────────────────────── */}
          <TabsContent value="config">
        <TooltipProvider>
          <div>
            {/* ── Trading rules ─────────────────────────────────── */}
            {/* Hard gates enforced inside place_trade.ts — not advisory. */}
            <div className="p-3 border-b flex flex-col gap-1">
              <SectionHeader
                label="Trading rules"
                tooltip="How this analyst places paper trades. Min Confidence, Max Positions, and Max Position Size are enforced inside place_trade — the agent cannot override them."
              />

              <InfoRow
                label="Direction"
                tooltip="Bias the agent can take: Long only, Short only, or Both."
              >
                <Select
                  defaultValue={config.directionBias}
                  onValueChange={(val) => saveField("directionBias", val)}
                >
                  <SelectTrigger size="sm" className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LONG">Long</SelectItem>
                    <SelectItem value="SHORT">Short</SelectItem>
                    <SelectItem value="BOTH">Both</SelectItem>
                  </SelectContent>
                </Select>
              </InfoRow>

              <InfoRow
                label="Hold Duration"
                tooltip="Typical holding period the agent plans for: Day (intraday), Swing (days to weeks), Position (weeks to months)."
              >
                <Select
                  defaultValue={config.holdDurations[0] ?? "SWING"}
                  onValueChange={(val) => saveField("holdDurations", [val])}
                >
                  <SelectTrigger size="sm" className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="DAY">Day</SelectItem>
                    <SelectItem value="SWING">Swing</SelectItem>
                    <SelectItem value="POSITION">Position</SelectItem>
                  </SelectContent>
                </Select>
              </InfoRow>

              <InfoRow
                label="Min Confidence"
                tooltip="Lowest thesis confidence (0-100) that can place a trade. Enforced — a thesis below this threshold gets rejected."
              >
                <Input
                  type="number"
                  defaultValue={config.minConfidence}
                  min={0}
                  max={100}
                  className="w-24 text-right tabular-nums"
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val !== config.minConfidence) {
                      saveField("minConfidence", Math.min(100, Math.max(0, val)));
                    }
                  }}
                />
              </InfoRow>

              <InfoRow
                label="Max Positions"
                tooltip="Most concurrent open positions this analyst can hold. Enforced — attempts to open beyond this are rejected."
              >
                <Input
                  type="number"
                  defaultValue={config.maxOpenPositions}
                  min={1}
                  max={20}
                  className="w-24 text-right tabular-nums"
                  onBlur={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val) && val !== config.maxOpenPositions) {
                      saveField("maxOpenPositions", Math.min(20, Math.max(1, val)));
                    }
                  }}
                />
              </InfoRow>

              <InfoRow
                label="Max Position Size"
                tooltip="Biggest single trade (in paper dollars) this analyst can open. Enforced — a larger request is rejected."
              >
                <Input
                  type="number"
                  defaultValue={config.maxPositionSize ?? 0}
                  min={0}
                  step={100}
                  className="w-24 text-right tabular-nums"
                  onBlur={(e) => {
                    const val = parseFloat(e.target.value);
                    if (!isNaN(val) && val !== config.maxPositionSize) {
                      saveField("maxPositionSize", Math.max(0, val));
                    }
                  }}
                />
              </InfoRow>
            </div>

            {/* ── Signal attention ──────────────────────────────── */}
            {/* Weights + budgets the signal router uses when deciding which */}
            {/* intelligence reaches this analyst each morning. Set by the   */}
            {/* Builder — exposed here read-only for visibility.             */}
            <div className="p-3 border-b flex flex-col gap-1">
              <SectionHeader
                label="Signal attention"
                tooltip="How the signal router weighs intelligence for this analyst — and how much of it the agent reads per run."
              />
              {policy && typeof policy.holdingsAttention === "number" && (
                <InfoRow
                  label="Holdings attention"
                  value={`${Math.round((policy.holdingsAttention as number) * 100)}%`}
                  mono
                  tooltip="Share of signal budget biased toward tickers this analyst already holds."
                />
              )}
              {policy && typeof policy.watchlistAttention === "number" && (
                <InfoRow
                  label="Watchlist attention"
                  value={`${Math.round((policy.watchlistAttention as number) * 100)}%`}
                  mono
                  tooltip="Share of signal budget biased toward watchlist tickers (not yet held)."
                />
              )}
              {policy && typeof policy.discoveryAttention === "number" && (
                <InfoRow
                  label="Discovery attention"
                  value={`${Math.round((policy.discoveryAttention as number) * 100)}%`}
                  mono
                  tooltip="Share of signal budget reserved for new opportunities that match the Universe fence but aren't on the watchlist."
                />
              )}
              {policy && typeof policy.maxSignalsPerRun === "number" && (
                <InfoRow
                  label="Signal budget"
                  value={String(policy.maxSignalsPerRun as number)}
                  mono
                  tooltip="Hard cap on how many signals the agent reads per run. Enforced."
                />
              )}
              {policy && typeof policy.allowLiveSearch === "boolean" && (
                <InfoRow
                  label="Live search"
                  value={(policy.allowLiveSearch as boolean) ? "On" : "Off"}
                  tooltip="When on, the agent can call live Perplexity Sonar during a run. Off = only pre-gathered signals."
                />
              )}
            </div>

            {/* ── Universe (discovery fence) ─────────────────────── */}
            {/* B contract: Universe = sectors ∧ industries ∧ themes ∧       */}
            {/* marketCapMin/Max ∧ exchanges. Empty dim = no filter.         */}
            {/* exclusionList hard-rejects. Watchlist + positions bypass.    */}
            <div className="p-3 border-b flex flex-col gap-3">
              <div className="flex items-center gap-1.5">
                <p className="text-sm font-medium">Universe</p>
                <Tooltip>
                  <TooltipTrigger render={<span className="cursor-help" />}>
                    <Info className="h-3 w-3 text-muted-foreground" />
                  </TooltipTrigger>
                  <TooltipContent className="max-w-xs">
                    The discovery fence. Signals only reach this analyst if they match these dimensions. Empty dimension = no filter. Watchlist + open positions bypass the fence.
                  </TooltipContent>
                </Tooltip>
              </div>

              <div className="flex flex-col gap-1.5">
                <FieldLabel
                  label="Sectors"
                  tooltip="GICS top-level sectors. Only signals whose ticker belongs to one of these sectors enter the fence."
                />
                <MultiCombobox
                  values={config.sectors}
                  options={SECTORS}
                  placeholder="Add a sector…"
                  groupLabel="GICS Sectors"
                  onChange={(next) => saveField("sectors", next)}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <FieldLabel
                  label="Industries"
                  tooltip="Narrower than Sectors — a signal's ticker industry must match one of these (AND-joined with Sectors)."
                />
                <MultiCombobox
                  values={config.industries}
                  options={INDUSTRIES}
                  placeholder="Add an industry…"
                  groupLabel="GICS Industries"
                  onChange={(next) => saveField("industries", next)}
                />
              </div>
              <ChipListEditor
                label="Themes"
                values={config.themes}
                placeholder="Free text — e.g. AI infrastructure, GLP-1, EV transition"
                tooltip="Analyst-defined narratives (not a fixed list). Signals tagged with any of these themes route into the fence. Example: 'AI infrastructure', 'GLP-1', 'EV transition'."
                onChange={(next) => saveField("themes", next)}
              />

              <MarketCapInput
                label="Market cap min"
                value={config.marketCapMin}
                onChange={(v) => saveField("marketCapMin", v)}
                tooltip="Floor (in $M) for ticker market cap. Smaller caps get rejected from the fence. Leave blank for no lower bound."
              />
              <MarketCapInput
                label="Market cap max"
                value={config.marketCapMax}
                onChange={(v) => saveField("marketCapMax", v)}
                tooltip="Ceiling (in $M) for ticker market cap. Larger caps get rejected. Leave blank for no upper bound."
              />

              <ChipListEditor
                label="Exclusion list"
                values={config.exclusionList}
                placeholder="Ticker to block"
                uppercase
                tooltip="Tickers that are hard-blocked for this analyst. Any signal or discovery naming one of these is rejected outright — even when held or on the watchlist."
                onChange={(next) => saveField("exclusionList", next)}
              />
            </div>

            {/* ── Sources ───────────────────────────────────────── */}
            {config.domainMonitors.length > 0 && (
              <div className="p-3 border-b">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <p className="text-sm font-medium">Sources</p>
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-help" />}>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Websites monitored daily for new articles. Perplexity Sonar searches each domain, then Firecrawl extracts full article text for the agent to read.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-col gap-1">
                  {config.domainMonitors.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm border-b border-border pb-1 last:border-0 min-h-8">
                      <img
                        src={`https://www.google.com/s2/favicons?domain=${m.domain}&sz=16`}
                        alt=""
                        width={14}
                        height={14}
                        className="size-3.5 rounded-sm shrink-0"
                      />
                      <span className="truncate flex-1">{m.name}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* ── Search Queries ─────────────────────────────────── */}
            {config.searchMonitors.length > 0 && (
              <div className="p-3 border-b">
                <div className="flex items-center gap-1.5 mb-1.5">
                  <p className="text-sm font-medium">Search Queries</p>
                  <Tooltip>
                    <TooltipTrigger render={<span className="cursor-help" />}>
                      <Info className="h-3 w-3 text-muted-foreground" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs">
                      Perplexity Sonar runs these queries daily before the agent wakes up. Results become findings that get routed to the analyst based on relevance.
                    </TooltipContent>
                  </Tooltip>
                </div>
                <div className="flex flex-col gap-1">
                  {config.searchMonitors.map((m) => (
                    <div key={m.id} className="flex items-center gap-2 text-sm border-b border-border pb-1 last:border-0 min-h-8">
                      <Search className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                      <span className="flex-1">{m.query}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </TooltipProvider>
          </TabsContent>
        </Tabs>
      </SheetContent>
    </Sheet>
  );
}

// ── SectionHeader ───────────────────────────────────────────────────────────
// Small heading used to group related InfoRows inside the Config tab. An
// info icon + tooltip explains what the whole section controls — so the
// user can glance at a section and know which fields are editable by them
// vs. set by the Builder/Editor agent.

function SectionHeader({
  label,
  tooltip,
}: {
  label: string;
  tooltip: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <p className="text-sm font-medium">{label}</p>
      <Tooltip>
        <TooltipTrigger render={<span className="cursor-help" />}>
          <Info className="h-3 w-3 text-muted-foreground" />
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
      </Tooltip>
    </div>
  );
}

// ── FieldLabel ──────────────────────────────────────────────────────────────
// The per-field label used inside the chip editors (Sectors, Industries,
// Themes, Exclusion). Matches the InfoRow tooltip pattern — optional info
// icon next to the label — so every editable field in the sheet has the
// same affordance for "what is this."

function FieldLabel({
  label,
  tooltip,
}: {
  label: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <span className="text-xs text-muted-foreground flex items-center gap-1">
      {label}
      {tooltip && (
        <Tooltip>
          <TooltipTrigger render={<span className="cursor-help inline-flex items-center" />}>
            <Info className="h-3 w-3 text-muted-foreground/70" />
          </TooltipTrigger>
          <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
        </Tooltip>
      )}
    </span>
  );
}

// ── ChipListEditor ──────────────────────────────────────────────────────────
// Editable array-of-strings field. Type + Enter to add, click × to remove.
// Keeps ShadCN components pure (variant/size only).

interface ChipListEditorProps {
  label: string;
  values: string[];
  placeholder?: string;
  /** If true, normalize added values to uppercase (for tickers). */
  uppercase?: boolean;
  /** Optional tooltip — shown as an info icon next to the label. */
  tooltip?: React.ReactNode;
  onChange: (next: string[]) => void;
}

function ChipListEditor({
  label,
  values,
  placeholder,
  uppercase,
  tooltip,
  onChange,
}: ChipListEditorProps) {
  const [draft, setDraft] = useState("");

  const add = () => {
    const raw = draft.trim();
    if (!raw) return;
    const normalized = uppercase ? raw.toUpperCase() : raw;
    if (values.includes(normalized)) {
      setDraft("");
      return;
    }
    onChange([...values, normalized]);
    setDraft("");
  };

  const remove = (v: string) => {
    onChange(values.filter((x) => x !== v));
  };

  return (
    <div className="flex flex-col gap-1.5">
      <FieldLabel label={label} tooltip={tooltip} />
      {values.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {values.map((v) => (
            <Badge key={v} variant="secondary">
              <span>{v}</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => remove(v)}
                aria-label={`Remove ${v}`}
              >
                <X />
              </Button>
            </Badge>
          ))}
        </div>
      )}
      <Input
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            add();
          }
        }}
        onBlur={add}
      />
    </div>
  );
}

// ── MarketCapInput ──────────────────────────────────────────────────────────
// Number input that stores dollars but displays in millions for readability.
// Blank = null (no bound).

interface MarketCapInputProps {
  label: string;
  value: number | null;
  onChange: (next: number | null) => void;
  tooltip?: React.ReactNode;
}

function MarketCapInput({ label, value, onChange, tooltip }: MarketCapInputProps) {
  const displayMillions =
    value != null && Number.isFinite(value) ? Math.round(value / 1_000_000) : "";

  return (
    <InfoRow label={label} tooltip={tooltip}>
      <div className="flex items-center gap-1">
        <Input
          type="number"
          defaultValue={displayMillions}
          min={0}
          step={100}
          placeholder="None"
          className="w-28 text-right tabular-nums"
          onBlur={(e) => {
            const raw = e.target.value.trim();
            if (raw === "") {
              if (value !== null) onChange(null);
              return;
            }
            const millions = parseFloat(raw);
            if (!Number.isFinite(millions)) return;
            const dollars = Math.round(millions * 1_000_000);
            if (dollars !== value) onChange(dollars);
          }}
        />
        <span className="text-xs text-muted-foreground">M</span>
      </div>
    </InfoRow>
  );
}
