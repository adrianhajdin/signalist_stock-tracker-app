"use client";

/**
 * AgentChat — unified chat component for all three surfaces:
 *   - research-run: live agent run + follow-up conversation (tabs: Chat, Sources, Theses)
 *   - builder: analyst creation chat
 *   - editor: analyst editing chat
 *
 * The only chat component. Replaces AgentThread, AnalystBuilderChat,
 * AnalystChatProvider, and AnalystEditorChatWithInitial.
 * Uses the unified /api/agent/[mode] route.
 */

import { useMemo, useCallback, useTransition, useState } from "react";
import type { UIMessage } from "ai";
import type { ReactNode } from "react";
import type { AgentMode } from "@/lib/agent/modes";
import { MODES, RESEARCH_MODEL_OPTIONS } from "@/lib/agent/modes";
import { ChatRuntime } from "@/components/chat/chat-runtime";
import { Thread, type WelcomeConfig } from "@/components/assistant-ui/thread";
import type { HindsightComposerFeatures } from "@/components/assistant-ui/hindsight-composer";
import { HindsightComposer } from "@/components/assistant-ui/hindsight-composer";
import { ToolUICallbacksProvider } from "@/components/assistant-ui/tool-uis";
import { useAutoSend } from "@/hooks/useAutoSend";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  createAnalystFromBuilder,
  updateAnalystFromBuilder,
} from "@/lib/actions/analyst.actions";
import type { AgentConfigData } from "@/components/domain/agent-config-card";
import { Sparkles } from "lucide-react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { RunSourcesPanel } from "@/components/research/run-sources-panel";
import { ThesisRow, type ThesisRowData } from "@/components/ui/thesis-row";
import type { RunSourceItem } from "@/lib/actions/run-sources.actions";
import type { MorningBrief as IntelMorningBrief } from "@/components/intelligence/types";

// ── Model preference storage key ──────────────────────────────────────────────
const MODEL_PREF_KEY = "hindsight_research_model";

function getStoredModel(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(MODEL_PREF_KEY);
}

function storeModel(value: string) {
  localStorage.setItem(MODEL_PREF_KEY, value);
}

// ── Default welcome configs + composer features per mode ──────────────────────

const BUILDER_WELCOME: WelcomeConfig = {
  title: "Create a new analyst",
  subtitle:
    "Describe the trading strategy you want — I'll build a custom analyst for you.",
  icon: (
    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
      <Sparkles className="size-5" />
    </div>
  ),
};

const EDITOR_WELCOME: WelcomeConfig = {
  title: "Edit your analyst",
  subtitle: "Ask questions about the current strategy or suggest changes.",
};

const BUILDER_COMPOSER: HindsightComposerFeatures = {
  tickerSearch: true,
  placeholder: "Describe your ideal trading analyst…",
};

const EDITOR_COMPOSER: HindsightComposerFeatures = {
  tickerSearch: true,
  placeholder: "Ask a question or suggest strategy changes…",
};

// ── Props ─────────────────────────────────────────────────────────────────────

interface AgentChatProps {
  mode: AgentMode;

  // research-run
  runId?: string;
  analystId?: string;
  analystName?: string;
  autoStart?: boolean;
  headerAction?: ReactNode;
  brief?: IntelMorningBrief | null;
  sources?: RunSourceItem[];
  theses?: ThesisRowData[];

  // builder / editor
  currentConfig?: Record<string, unknown>;

  /** Pre-loaded messages for replay (historical runs) */
  messages?: UIMessage[];

  /** Thread composer slot (e.g. QuickReplies) */
  composerSlot?: ReactNode;

  /** Auto-send initial message (builder/editor) */
  initialPrompt?: string;

  /** Called when the AI suggests a config — opens the preview panel */
  onConfigSuggested?: (config: AgentConfigData, onConfirm: () => void) => void;

  /** Called when a DB mutation (create/update) starts or finishes */
  onMutatingChange?: (mutating: boolean) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function AgentChat({
  mode,
  runId,
  analystId,
  analystName,
  autoStart,
  headerAction,
  brief = null,
  sources = [],
  theses = [],
  currentConfig,
  messages,
  composerSlot,
  initialPrompt,
  onConfigSuggested,
  onMutatingChange,
}: AgentChatProps) {
  const api = `/api/agent/${mode}`;

  // Model override — only meaningful for research-run.
  // Reads stored preference from localStorage (set via settings page or the
  // in-chat selector). Falls back to mode default (gpt-4o) if nothing is stored
  // or the stored value isn't a known option.
  const defaultModel = MODES[mode].model;
  const [selectedModel, setSelectedModel] = useState<string>(() => {
    if (mode !== "research-run") return defaultModel;
    const stored = getStoredModel();
    const valid = RESEARCH_MODEL_OPTIONS.some((o) => o.value === stored);
    return valid ? (stored ?? defaultModel) : defaultModel;
  });

  const handleModelChange = useCallback((value: string) => {
    setSelectedModel(value);
    if (mode === "research-run") storeModel(value);
  }, [mode]);

  const body: Record<string, unknown> = {};
  if (runId) body.runId = runId;
  if (analystId) body.analystId = analystId;
  if (currentConfig) body.currentConfig = currentConfig;
  // Only send override when it differs from the mode default
  if (selectedModel !== defaultModel) body.modelOverride = selectedModel;

  return (
    <ChatRuntime api={api} body={body} messages={messages}>
      <AgentChatInner
        mode={mode}
        analystId={analystId}
        analystName={analystName}
        autoStart={autoStart}
        headerAction={headerAction}
        brief={brief}
        sources={sources}
        theses={theses}
        currentConfig={currentConfig}
        composerSlot={composerSlot}
        initialPrompt={initialPrompt}
        onConfigSuggested={onConfigSuggested}
        onMutatingChange={onMutatingChange}
        selectedModel={selectedModel}
        onModelChange={handleModelChange}
      />
    </ChatRuntime>
  );
}

// ── Inner component (inside ChatRuntime — can use thread hooks) ───────────────

interface InnerProps {
  mode: AgentMode;
  analystId?: string;
  analystName?: string;
  autoStart?: boolean;
  headerAction?: ReactNode;
  brief: IntelMorningBrief | null;
  sources: RunSourceItem[];
  theses: ThesisRowData[];
  currentConfig?: Record<string, unknown>;
  composerSlot?: ReactNode;
  initialPrompt?: string;
  onConfigSuggested?: (config: AgentConfigData, onConfirm: () => void) => void;
  onMutatingChange?: (mutating: boolean) => void;
  selectedModel?: string;
  onModelChange?: (value: string) => void;
}

function AgentChatInner({
  mode,
  analystId,
  analystName,
  autoStart,
  headerAction,
  brief,
  sources,
  theses,
  currentConfig,
  composerSlot,
  initialPrompt,
  onConfigSuggested,
  onMutatingChange,
  selectedModel,
  onModelChange,
}: InnerProps) {
  const router = useRouter();
  const [isMutating, startMutating] = useTransition();

  // research-run: auto-send "Run" to kick off the agent
  useAutoSend({ message: autoStart ? "Run" : initialPrompt, delay: autoStart ? 500 : 300 });

  const handleConfirmConfig = useCallback(
    (config: AgentConfigData) => {
      onMutatingChange?.(true);
      startMutating(async () => {
        try {
          if (mode === "builder") {
            // Session B audit follow-up: builder branch mirrors the editor —
            // industries / themes / marketCap ride through the `universe`
            // payload so createAnalystFromBuilder persists them to the
            // AgentConfig columns. Without this, new analysts start with
            // empty industries/themes even though the Builder proposed them.
            const result = await createAnalystFromBuilder({
              name: config.name ?? "Untitled Analyst",
              analystPrompt: config.analystPrompt ?? "General market research analyst",
              description: config.description,
              directionBias: config.directionBias ?? "BOTH",
              holdDurations: (config.holdDurations ?? ["SWING"]) as ("DAY" | "SWING" | "POSITION")[],
              sectors: config.sectors ?? [],
              signalTypes: config.signalTypes ?? [],
              minConfidence: config.minConfidence ?? 65,
              maxPositionSize: config.maxPositionSize ?? 5000,
              maxOpenPositions: config.maxOpenPositions ?? 5,
              minMarketCapTier: (config.minMarketCapTier ?? "LARGE") as "LARGE" | "MID" | "SMALL",
              watchlist: (config.watchlist ?? []) as string[],
              exclusionList: (config.exclusionList ?? []) as string[],
              domainMonitorProposal: config.domainMonitorProposal,
              intelligenceQueries: config.intelligenceQueries,
              intelligencePolicy: config.intelligencePolicy,
              universe: {
                sectors: config.sectors,
                industries: config.industries,
                themes: config.themes,
                marketCapMin: config.marketCapMin ?? undefined,
                marketCapMax: config.marketCapMax ?? undefined,
              },
            });
            toast.success(`Analyst "${config.name}" created`);
            router.push(`/analysts/${result.id}`);
          } else {
            // Session B: industries/themes/marketCapMin/Max ride through the
            // `universe` payload so they reach AgentConfig columns. Without
            // this, cherry-picking a Universe tab diff would silently no-op
            // because updateAnalystFromBuilder only reads these from `universe`.
            const universeKeys: Array<keyof AgentConfigData> = [
              "sectors",
              "industries",
              "themes",
              "marketCapMin",
              "marketCapMax",
            ];
            const hasUniverseField = universeKeys.some((k) => config[k] !== undefined);
            const universe = hasUniverseField
              ? {
                  sectors: config.sectors,
                  industries: config.industries,
                  themes: config.themes,
                  marketCapMin: config.marketCapMin ?? undefined,
                  marketCapMax: config.marketCapMax ?? undefined,
                }
              : undefined;

            await updateAnalystFromBuilder(analystId!, {
              name: config.name,
              analystPrompt: config.analystPrompt,
              directionBias: config.directionBias as "LONG" | "SHORT" | "BOTH",
              holdDurations: config.holdDurations as ("DAY" | "SWING" | "POSITION")[],
              sectors: config.sectors,
              signalTypes: config.signalTypes,
              minConfidence: config.minConfidence,
              maxPositionSize: config.maxPositionSize,
              maxOpenPositions: config.maxOpenPositions,
              minMarketCapTier: config.minMarketCapTier as "LARGE" | "MID" | "SMALL",
              watchlist: config.watchlist as string[] | undefined,
              exclusionList: config.exclusionList as string[] | undefined,
              domainMonitorProposal: config.domainMonitorProposal,
              intelligenceQueries: config.intelligenceQueries,
              intelligencePolicy: config.intelligencePolicy,
              universe,
            });
            router.push(`/analysts/${analystId}`);
          }
        } catch (err) {
          const msg = err instanceof Error ? err.message : "Unknown error";
          console.error(`Failed to ${mode === "builder" ? "create" : "update"} analyst:`, err);
          toast.error(`Failed: ${msg}`);
        } finally {
          onMutatingChange?.(false);
        }
      });
    },
    [mode, analystId, router, onMutatingChange],
  );

  const handleConfigSuggested = useCallback(
    (config: AgentConfigData) => {
      if (onConfigSuggested) {
        onConfigSuggested(config, () => handleConfirmConfig(config));
      }
    },
    [onConfigSuggested, handleConfirmConfig],
  );

  const callbacks = useMemo(
    () => ({
      onConfirmConfig: handleConfirmConfig,
      onConfigSuggested: onConfigSuggested ? handleConfigSuggested : undefined,
      isCreating: isMutating,
      confirmLabel: mode === "builder" ? "Create Analyst" : "Apply Changes",
      confirmingLabel: mode === "builder" ? "Creating..." : "Applying...",
      currentConfig: mode === "editor" ? currentConfig : undefined,
    }),
    [handleConfirmConfig, handleConfigSuggested, onConfigSuggested, isMutating, mode, currentConfig],
  );

  // ── research-run: tabbed layout ───────────────────────────────────────────

  if (mode === "research-run") {
    const isFollowupMode = !autoStart;
    return (
      <Tabs defaultValue={0} className="flex h-full flex-col">
        <div className="shrink-0 px-4 pt-2 flex items-center">
          <TabsList>
            <TabsTrigger value={0}>Chat</TabsTrigger>
            <TabsTrigger value={1}>Sources</TabsTrigger>
            <TabsTrigger value={2}>Theses</TabsTrigger>
          </TabsList>
          {headerAction && <div className="ml-auto">{headerAction}</div>}
        </div>

        <TabsContent value={0} className="flex-1 min-h-0 flex flex-col">
          <Thread
            welcomeConfig={{
              title: analystName ?? "Research Agent",
              subtitle: isFollowupMode
                ? "Run complete — ask follow-up questions or place trades"
                : "Autonomous research agent",
            }}
            composerSlot={
              composerSlot ?? (
                <HindsightComposer
                  features={{
                    placeholder: isFollowupMode
                      ? "Ask about the run, research a ticker, or place a trade…"
                      : "Ask a follow-up question…",
                    tickerSearch: true,
                    slashCommands: true,
                    modelLabel: RESEARCH_MODEL_OPTIONS.find((o) => o.value === selectedModel)?.label ?? selectedModel ?? "GPT-4o",
                    modelOptions: RESEARCH_MODEL_OPTIONS,
                    onModelChange,
                  }}
                />
              )
            }
          />
        </TabsContent>

        <TabsContent value={1} className="flex-1 min-h-0 overflow-y-auto">
          <RunSourcesPanel brief={brief} sources={sources} />
        </TabsContent>

        <TabsContent value={2} className="flex-1 min-h-0 overflow-y-auto">
          {theses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground">
              <p className="text-sm">No theses recorded</p>
              <p className="text-xs mt-1">Theses appear here once the agent records its picks</p>
            </div>
          ) : (
            <div className="mx-auto w-full max-w-2xl px-4 py-6 space-y-2">
              {theses.map((t) => (
                <ThesisRow key={t.id} thesis={t} />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    );
  }

  // ── builder / editor: config chat ────────────────────────────────────────

  return (
    <ToolUICallbacksProvider value={callbacks}>
      <Thread
        welcomeConfig={mode === "builder" ? BUILDER_WELCOME : EDITOR_WELCOME}
        composerFeatures={mode === "builder" ? BUILDER_COMPOSER : EDITOR_COMPOSER}
        composerSlot={composerSlot}
      />
    </ToolUICallbacksProvider>
  );
}
