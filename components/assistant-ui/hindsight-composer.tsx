"use client";

import {
  useState,
  useEffect,
  useCallback,
  useRef,
  useMemo,
  type FC,
  type ComponentType,
} from "react";
import { flushSync } from "react-dom";
import {
  useEditor,
  EditorContent,
  ReactNodeViewRenderer,
  NodeViewWrapper,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Mention from "@tiptap/extension-mention";
import { Extension } from "@tiptap/core";
import Placeholder from "@tiptap/extension-placeholder";
import { useAui, useAuiState } from "@assistant-ui/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { InputGroup, InputGroupAddon } from "@/components/ui/input-group";
import { cn } from "@/lib/utils";
import { StockLogo } from "@/components/StockLogo";
import { searchStocks } from "@/lib/actions/finnhub.actions";
import { useDebounce } from "@/hooks/useDebounce";
import {
  SuggestionList,
  type SuggestionListHandle,
  type SuggestionItem,
  type TickerItem,
} from "./suggestion-list";
import {
  Send,
  Square,
  Slash,
  Loader2,
  Globe,
  BarChart3,
  TrendingUp,
  BanknoteArrowUp,
  HatGlasses,
  NotebookTabs,
  Settings2,
  DollarSign,
  Briefcase,
  Search,
  GitCompare,
} from "lucide-react";
import { FirstVisitTooltip } from "@/components/ui/first-visit-tooltip";

// ── Types ──────────────────────────────────────────────────────────────────

export interface SlashCommand {
  name: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  template: string;
}

export interface HindsightComposerFeatures {
  slashCommands?: boolean;
  commands?: SlashCommand[];
  tickerSearch?: boolean;
  plusMenu?: boolean;
  placeholder?: string;
  /** Display name for the AI model, e.g. "Claude Sonnet 4.6" or "GPT-4o" */
  modelLabel?: string;
  /** If provided, the model item becomes a submenu to switch models */
  modelOptions?: Array<{ label: string; value: string; provider: "openai" | "anthropic" }>;
  /** Called when the user selects a different model */
  onModelChange?: (value: string) => void;
}

// ── Defaults ───────────────────────────────────────────────────────────────

const DEFAULT_SLASH_COMMANDS: SlashCommand[] = [
  { name: "research",    label: "/research",    icon: Search,      template: "/research "    },
  { name: "trade",       label: "/trade",       icon: TrendingUp,  template: "/trade "       },
  { name: "compare",     label: "/compare",     icon: GitCompare,  template: "/compare "     },
  { name: "portfolio",   label: "/portfolio",   icon: Briefcase,   template: "/portfolio"    },
  { name: "performance", label: "/performance", icon: BarChart3,   template: "/performance"  },
];

const DEFAULT_STOCKS: TickerItem[] = [
  { symbol: "AAPL", name: "Apple Inc." },
  { symbol: "MSFT", name: "Microsoft Corp." },
  { symbol: "NVDA", name: "NVIDIA Corp." },
  { symbol: "GOOGL", name: "Alphabet Inc." },
  { symbol: "AMZN", name: "Amazon.com Inc." },
  { symbol: "TSLA", name: "Tesla Inc." },
];

// Sources: live data connections shown with stacked provider logos
const SOURCES = [
  {
    label: "Web Search",
    description: "Live internet search via Perplexity Sonar plus full article extraction via Firecrawl — finds breaking news, earnings releases, and any URL behind a signal.",
    icon: Globe,
    logos: [
      { domain: "perplexity.ai", name: "Perplexity" },
      { domain: "firecrawl.dev", name: "Firecrawl" },
    ],
  },
  {
    label: "Live Market Data",
    description: "Real-time quotes, earnings, and company metrics via Finnhub. Put/call ratios and options flow via FMP. 10-K, 10-Q, 8-K, and Form 4 filings from SEC EDGAR.",
    icon: TrendingUp,
    logos: [
      { domain: "finnhub.io", name: "Finnhub" },
      { domain: "sec.gov", name: "SEC EDGAR" },
      { domain: "financialmodelingprep.com", name: "FMP" },
    ],
  },
  {
    label: "Alpaca Trading Account",
    description: "Your connected Alpaca paper trading account — the agent reads live positions, P&L, and open orders, and can place, monitor, and close paper trades on your behalf.",
    icon: BanknoteArrowUp,
    logos: [
      { domain: "alpaca.markets", name: "Alpaca" },
    ],
  },
];

// All individual connectors shown in the "All connectors" submenu
const ALL_CONNECTORS = [
  { domain: "perplexity.ai",             name: "Perplexity Sonar" },
  { domain: "firecrawl.dev",             name: "Firecrawl" },
  { domain: "finnhub.io",               name: "Finnhub" },
  { domain: "sec.gov",                  name: "SEC EDGAR" },
  { domain: "financialmodelingprep.com", name: "Financial Modeling Prep" },
  { domain: "alpaca.markets",           name: "Alpaca" },
];

// Capabilities: agent intelligence (no external APIs, no logos)
const CAPABILITIES = [
  {
    label: "Research & Monitors",
    description: "Pre-market intelligence from nightly pipeline runs — firm-wide news sweeps, watchlist alerts, signal routing, and analyst-specific morning briefs ready before each run.",
    icon: HatGlasses,
  },
  {
    label: "Portfolio Knowledge",
    description: "Past trade outcomes, win rates, weekly calibration reports, and live portfolio context — used to tune the agent's confidence thresholds and position sizing decisions.",
    icon: NotebookTabs,
  },
];

// ── MentionChip — inline NodeView rendered inside the editor ───────────────

const MentionChip: FC<NodeViewProps> = ({ node }) => {
  const char = (node.attrs.mentionSuggestionChar ?? "@") as string;
  const id = node.attrs.id as string;

  const chipClass =
    "inline-flex items-center gap-1 rounded px-1.5 py-0.5 bg-secondary text-secondary-foreground text-xs font-medium mx-0.5 select-none cursor-default align-middle";

  if (char === "/") {
    const cmd = DEFAULT_SLASH_COMMANDS.find((c) => c.name === id);
    const Icon = cmd?.icon ?? Slash;
    return (
      <NodeViewWrapper as="span" className={chipClass}>
        <Icon className="size-3 pointer-events-none" />
        <span>{id}</span>
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper as="span" className={chipClass}>
      <StockLogo ticker={id} size="sm" className="size-3 pointer-events-none" />
      <span className="tabular-nums">{id}</span>
    </NodeViewWrapper>
  );
};

// ── Suggestion popup state ─────────────────────────────────────────────────

interface SuggestionPopupState {
  char: "@" | "/";
  items: SuggestionItem[];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  command: (props: any) => void;
  clientRect: (() => DOMRect | null) | null;
}

// ── Component ──────────────────────────────────────────────────────────────

export const HindsightComposer: FC<{ features?: HindsightComposerFeatures }> = ({
  features = {},
}) => {
  const {
    slashCommands = false,
    commands = DEFAULT_SLASH_COMMANDS,
    tickerSearch = false,
    plusMenu = true,
    placeholder = "Ask anything…",
    modelLabel,
    modelOptions,
    onModelChange,
  } = features;

  const modelLogoUrl = (label: string | undefined) => {
    if (!label) return null;
    return label.toLowerCase().includes("claude")
      ? "https://www.google.com/s2/favicons?domain=anthropic.com&sz=32"
      : "https://www.google.com/s2/favicons?domain=openai.com&sz=32";
  };
  const currentModelLogoUrl = modelLogoUrl(modelLabel);

  const aui = useAui();
  const isRunning = useAuiState((s) => s.thread.isRunning);

  const [isFocused, setIsFocused] = useState(false);
  const [hasContent, setHasContent] = useState(false);
  const isCollapsed = !isFocused && !hasContent && !isRunning;

  // ── Suggestion popup ──────────────────────────────────────────────────────
  const [suggestionPopup, setSuggestionPopup] = useState<SuggestionPopupState | null>(null);
  const listRef = useRef<SuggestionListHandle | null>(null);

  // ── Stable ref for handleSend (avoids stale closures in TipTap extension) ─
  const handleSendRef = useRef<() => void>(() => {});

  // ── Capture initial feature values for the useMemo closure ────────────────
  const initRef = useRef({ slashCommands, commands, tickerSearch, placeholder });

  // ── Build TipTap extensions exactly once ──────────────────────────────────
  const extensions = useMemo(() => {
    const { slashCommands: sc, commands: cmds, tickerSearch: ts, placeholder: ph } =
      initRef.current;

    // Extension: intercept Enter to send (Shift+Enter passes through for hard break)
    const EnterToSend = Extension.create({
      name: "enterToSend",
      priority: 100,
      addKeyboardShortcuts() {
        return {
          Enter: () => {
            // If suggestion popup is open, let it handle Enter
            if (listRef.current) return false;
            handleSendRef.current();
            return true;
          },
        };
      },
    });

    // Mention extension with @ (tickers) and / (commands) triggers
    const CustomMention = Mention.extend({
      addNodeView() {
        return ReactNodeViewRenderer(MentionChip);
      },
    }).configure({
      HTMLAttributes: {},
      renderText({ node }: { node: { attrs: Record<string, unknown> } }) {
        const char = (node.attrs.mentionSuggestionChar ?? "@") as string;
        return char === "/" ? `/${node.attrs.id as string}` : `$${node.attrs.id as string}`;
      },
      suggestions: [
        // @ticker suggestion
        ...(ts
          ? [
              {
                char: "@" as const,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                items: async ({ query }: any): Promise<TickerItem[]> => {
                  if (!query.trim()) return DEFAULT_STOCKS;
                  try {
                    const results = await searchStocks(query.trim());
                    return results.map((r) => ({ symbol: r.symbol, name: r.name }));
                  } catch {
                    return DEFAULT_STOCKS;
                  }
                },
                render: () => ({
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onStart: (props: any) => {
                    flushSync(() =>
                      setSuggestionPopup({
                        char: "@",
                        items: props.items as SuggestionItem[],
                        command: props.command,
                        clientRect: props.clientRect,
                      }),
                    );
                  },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onUpdate: (props: any) => {
                    flushSync(() =>
                      setSuggestionPopup({
                        char: "@",
                        items: props.items as SuggestionItem[],
                        command: props.command,
                        clientRect: props.clientRect,
                      }),
                    );
                  },
                  onExit: () => {
                    flushSync(() => setSuggestionPopup(null));
                  },
                  onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                    return listRef.current?.onKeyDown(event) ?? false;
                  },
                }),
              },
            ]
          : []),

        // /command suggestion
        ...(sc
          ? [
              {
                char: "/" as const,
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                items: async ({ query }: any): Promise<SlashCommand[]> => {
                  const q = (query as string).toLowerCase().trim();
                  return (cmds as SlashCommand[]).filter(
                    (cmd) => !q || cmd.name.includes(q) || cmd.label.toLowerCase().includes(q),
                  );
                },
                render: () => ({
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onStart: (props: any) => {
                    flushSync(() =>
                      setSuggestionPopup({
                        char: "/",
                        items: props.items as SuggestionItem[],
                        command: props.command,
                        clientRect: props.clientRect,
                      }),
                    );
                  },
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  onUpdate: (props: any) => {
                    flushSync(() =>
                      setSuggestionPopup({
                        char: "/",
                        items: props.items as SuggestionItem[],
                        command: props.command,
                        clientRect: props.clientRect,
                      }),
                    );
                  },
                  onExit: () => {
                    flushSync(() => setSuggestionPopup(null));
                  },
                  onKeyDown: ({ event }: { event: KeyboardEvent }) => {
                    return listRef.current?.onKeyDown(event) ?? false;
                  },
                }),
              },
            ]
          : []),
      ],
    });

    return [
      StarterKit.configure({
        bold: false,
        italic: false,
        strike: false,
        code: false,
        codeBlock: false,
        blockquote: false,
        heading: false,
        bulletList: false,
        orderedList: false,
        listItem: false,
        listKeymap: false,
        horizontalRule: false,
        link: false,
        underline: false,
        dropcursor: false,
        gapcursor: false,
        trailingNode: false,
      }),
      Placeholder.configure({ placeholder: ph }),
      CustomMention,
      EnterToSend,
    ];
  }, []); // stable — feature values captured via ref at mount

  // ── Editor ────────────────────────────────────────────────────────────────
  const editor = useEditor({
    extensions,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        "data-slot": "input-group-control",
        class: [
          "min-h-[4.5rem] w-full px-3 py-2 text-sm leading-relaxed",
          "bg-transparent outline-none focus:outline-none",
          "[&>p]:m-0 [&>p+p]:mt-1",
        ].join(" "),
      },
    },
    onFocus: () => setIsFocused(true),
    onBlur: () => setIsFocused(false),
    onUpdate({ editor: e }) {
      // Keep assistant-ui composer in sync so canSend works
      const text = e.getText({ blockSeparator: "\n" }).trim();
      setHasContent(text.length > 0);
      aui.composer().setText(text);
    },
  });

  // ── Send ──────────────────────────────────────────────────────────────────
  const handleSend = useCallback(() => {
    if (!editor || isRunning) return;
    if (listRef.current) return; // suggestion popup open — don't send
    const text = editor.getText({ blockSeparator: "\n" }).trim();
    if (!text) return;
    aui.composer().setText(text);
    aui.composer().send();
    editor.commands.clearContent(true);
  }, [editor, isRunning, aui]);

  useEffect(() => {
    handleSendRef.current = handleSend;
  }, [handleSend]);

  // ── Toolbar: insert ticker chip ───────────────────────────────────────────
  const insertTicker = useCallback(
    (symbol: string, name: string) => {
      editor
        ?.chain()
        .focus()
        .insertContent([
          { type: "mention", attrs: { id: symbol, label: name, mentionSuggestionChar: "@" } },
          { type: "text", text: " " },
        ])
        .run();
    },
    [editor],
  );

  // ── Toolbar: insert command chip ──────────────────────────────────────────
  const insertCommand = useCallback(
    (cmd: SlashCommand) => {
      editor
        ?.chain()
        .focus()
        .insertContent([
          { type: "mention", attrs: { id: cmd.name, label: cmd.label, mentionSuggestionChar: "/" } },
          { type: "text", text: " " },
        ])
        .run();
    },
    [editor],
  );

  // ── Ticker toolbar popover ────────────────────────────────────────────────
  const [tickerOpen, setTickerOpen] = useState(false);
  const [tickerQuery, setTickerQuery] = useState("");
  const [tickerResults, setTickerResults] = useState<TickerItem[]>(DEFAULT_STOCKS);
  const [tickerLoading, setTickerLoading] = useState(false);

  const handleTickerSearch = useCallback(async () => {
    if (!tickerQuery.trim()) {
      setTickerResults(DEFAULT_STOCKS);
      return;
    }
    setTickerLoading(true);
    try {
      const results = await searchStocks(tickerQuery.trim());
      setTickerResults(results.map((r) => ({ symbol: r.symbol, name: r.name })));
    } catch {
      setTickerResults([]);
    } finally {
      setTickerLoading(false);
    }
  }, [tickerQuery]);

  const debouncedTickerSearch = useDebounce(handleTickerSearch, 300);

  useEffect(() => {
    debouncedTickerSearch();
  }, [tickerQuery]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <InputGroup className="w-full bg-background/80 backdrop-blur-sm">
        {/* TipTap rich-text editor — clipped to single line on mobile when inactive */}
        <div
          className={cn(
            "w-full",
            isCollapsed && "sm:overflow-visible sm:max-h-none overflow-hidden max-h-10 cursor-text"
          )}
          onClick={() => isCollapsed && editor?.commands.focus()}
        >
          <EditorContent editor={editor} className="w-full" />
        </div>

        {/* Bottom toolbar — hidden on mobile when input is inactive */}
        <InputGroupAddon align="block-end" className={cn(isCollapsed && "hidden sm:flex")}>
          <div className="flex w-full items-center justify-between">
            <div className="flex items-center gap-1">

              {/* Settings2 — Sources & Capabilities (first in toolbar) */}
              {plusMenu && (
                <FirstVisitTooltip
                  title="Your analyst's toolkit"
                  description="Market data, web research, SEC filings, and Alpaca trading — everything your analyst can access."
                  storageKey="composer-capabilities"
                  variant="brand"
                  side="top"
                  align="start"
                >
                <TooltipProvider>
                  <DropdownMenu>
                    <Tooltip>
                      <TooltipTrigger
                        render={
                          <DropdownMenuTrigger
                            render={<Button variant="ghost" size="icon-sm" aria-label="Sources & Capabilities" />}
                          />
                        }
                      >
                        <Settings2 className="size-4" />
                      </TooltipTrigger>
                      <TooltipContent side="top">Sources & Capabilities</TooltipContent>
                    </Tooltip>

                    <DropdownMenuContent align="start" side="top" className="w-64">

                      {/* ── Sources ── */}
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Sources</DropdownMenuLabel>

                        {modelLabel && currentModelLogoUrl && (
                          modelOptions && onModelChange ? (
                            <DropdownMenuSub>
                              <DropdownMenuSubTrigger>
                                <img
                                  src={currentModelLogoUrl}
                                  alt={modelLabel}
                                  width={16}
                                  height={16}
                                  className="size-4 rounded-full ring-1 ring-popover object-contain bg-white shrink-0"
                                />
                                <span className="flex-1">{modelLabel}</span>
                              </DropdownMenuSubTrigger>
                              <DropdownMenuSubContent>
                                {modelOptions.map((opt) => {
                                  const logo = modelLogoUrl(opt.label);
                                  return (
                                    <DropdownMenuItem
                                      key={opt.value}
                                      onClick={() => onModelChange(opt.value)}
                                    >
                                      {logo && (
                                        <img
                                          src={logo}
                                          alt={opt.label}
                                          width={14}
                                          height={14}
                                          className="size-3.5 rounded-full ring-1 ring-popover object-contain bg-white shrink-0"
                                        />
                                      )}
                                      <span className="flex-1">{opt.label}</span>
                                      {opt.label === modelLabel && (
                                        <span className="text-xs text-primary">✓</span>
                                      )}
                                    </DropdownMenuItem>
                                  );
                                })}
                              </DropdownMenuSubContent>
                            </DropdownMenuSub>
                          ) : (
                            <DropdownMenuItem>
                              <img
                                src={currentModelLogoUrl}
                                alt={modelLabel}
                                width={16}
                                height={16}
                                className="size-4 rounded-full ring-1 ring-popover object-contain bg-white shrink-0"
                              />
                              <span className="flex-1">{modelLabel}</span>
                            </DropdownMenuItem>
                          )
                        )}

                        {SOURCES.map((source) => (
                          <Tooltip key={source.label}>
                            <TooltipTrigger render={<DropdownMenuItem />}>
                              <source.icon className="size-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1">{source.label}</span>
                              <div className="flex -space-x-1 ml-1">
                                {source.logos.map((logo) => (
                                  <img
                                    key={logo.domain}
                                    src={`https://www.google.com/s2/favicons?domain=${logo.domain}&sz=32`}
                                    alt={logo.name}
                                    title={logo.name}
                                    width={16}
                                    height={16}
                                    className="size-4 rounded-full ring-1 ring-popover object-contain bg-white"
                                  />
                                ))}
                              </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-56">
                              {source.description}
                            </TooltipContent>
                          </Tooltip>
                        ))}

                        {/* All connectors submenu */}
                        <DropdownMenuSub>
                          <DropdownMenuSubTrigger className="text-muted-foreground">
                            <div className="flex -space-x-1 mr-1">
                              {ALL_CONNECTORS.slice(0, 4).map((c) => (
                                <img
                                  key={c.domain}
                                  src={`https://www.google.com/s2/favicons?domain=${c.domain}&sz=32`}
                                  alt={c.name}
                                  width={14}
                                  height={14}
                                  className="size-3.5 rounded-full ring-1 ring-popover object-contain bg-white"
                                />
                              ))}
                            </div>
                            All connectors
                          </DropdownMenuSubTrigger>
                          <DropdownMenuSubContent className="w-52">
                            <DropdownMenuGroup>
                              {ALL_CONNECTORS.map((connector) => (
                                <DropdownMenuItem key={connector.domain}>
                                  <img
                                    src={`https://www.google.com/s2/favicons?domain=${connector.domain}&sz=32`}
                                    alt={connector.name}
                                    width={16}
                                    height={16}
                                    className="size-4 rounded-sm object-contain bg-white"
                                  />
                                  {connector.name}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuGroup>
                          </DropdownMenuSubContent>
                        </DropdownMenuSub>
                      </DropdownMenuGroup>

                      <DropdownMenuSeparator />

                      {/* ── Capabilities ── */}
                      <DropdownMenuGroup>
                        <DropdownMenuLabel>Capabilities</DropdownMenuLabel>

                        {CAPABILITIES.map((cap) => (
                          <Tooltip key={cap.label}>
                            <TooltipTrigger render={<DropdownMenuItem />}>
                              <cap.icon className="size-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1">{cap.label}</span>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="max-w-56">
                              {cap.description}
                            </TooltipContent>
                          </Tooltip>
                        ))}

                        {/* Commands submenu — last item in Capabilities */}
                        {slashCommands && (
                          <DropdownMenuSub>
                            <DropdownMenuSubTrigger>
                              <Slash className="size-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1">Commands</span>
                            </DropdownMenuSubTrigger>
                            <DropdownMenuSubContent className="w-44">
                              <DropdownMenuGroup>
                                {commands.map((cmd) => (
                                  <DropdownMenuItem key={cmd.name} onClick={() => insertCommand(cmd)}>
                                    <cmd.icon className="size-4" />
                                    {cmd.label}
                                  </DropdownMenuItem>
                                ))}
                              </DropdownMenuGroup>
                            </DropdownMenuSubContent>
                          </DropdownMenuSub>
                        )}
                      </DropdownMenuGroup>

                    </DropdownMenuContent>
                  </DropdownMenu>
                </TooltipProvider>
                </FirstVisitTooltip>
              )}

              {/* $ Stocks combobox (ghost, no chevron) */}
              {tickerSearch && (
                <Popover open={tickerOpen} onOpenChange={setTickerOpen}>
                  <PopoverTrigger
                    render={
                      <Button
                        variant="ghost"
                        size="sm"
                        role="combobox"
                        aria-expanded={tickerOpen}
                      />
                    }
                  >
                    <DollarSign className="size-3.5" />
                    Stocks
                  </PopoverTrigger>
                  <PopoverContent className="p-0 w-64">
                    <Command shouldFilter={false}>
                      <CommandInput
                        placeholder="Search stocks…"
                        value={tickerQuery}
                        onValueChange={setTickerQuery}
                      />
                      <CommandList>
                        {tickerLoading ? (
                          <div className="flex items-center justify-center gap-2 py-6">
                            <Loader2 className="size-4 animate-spin text-muted-foreground" />
                            <span className="text-sm text-muted-foreground">Searching…</span>
                          </div>
                        ) : (
                          <>
                            <CommandEmpty>No stocks found.</CommandEmpty>
                            <CommandGroup>
                              {tickerResults.map((stock) => (
                                <CommandItem
                                  key={stock.symbol}
                                  value={stock.symbol}
                                  onSelect={() => {
                                    insertTicker(stock.symbol, stock.name);
                                    setTickerOpen(false);
                                    setTickerQuery("");
                                    setTickerResults(DEFAULT_STOCKS);
                                  }}
                                >
                                  <StockLogo ticker={stock.symbol} size="sm" />
                                  <span className="font-medium">{stock.symbol}</span>
                                  <span className="text-muted-foreground truncate">{stock.name}</span>
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </>
                        )}
                      </CommandList>
                    </Command>
                  </PopoverContent>
                </Popover>
              )}
            </div>

            {/* Send / Stop */}
            {isRunning ? (
              <Button
                size="icon-sm"
                onClick={() => aui.composer().cancel()}
                aria-label="Stop"
              >
                <Square className="size-3 fill-current" />
              </Button>
            ) : (
              <Button
                size="icon-sm"
                onClick={handleSend}
                aria-label="Send"
              >
                <Send className="size-3" />
              </Button>
            )}
          </div>
        </InputGroupAddon>
      </InputGroup>

      {/* Floating suggestion popup — rendered via portal outside the InputGroup */}
      {suggestionPopup && (
        <SuggestionList
          ref={listRef}
          char={suggestionPopup.char}
          items={suggestionPopup.items}
          command={suggestionPopup.command}
          clientRect={suggestionPopup.clientRect}
        />
      )}
    </>
  );
};

HindsightComposer.displayName = "HindsightComposer";
