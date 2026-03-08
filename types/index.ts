// Re-export Prisma-generated types for convenience
// Note: Prisma v7 generates types with a "Model" suffix (e.g. TradeModel, not Trade)
export type {
  ResearchRunModel as ResearchRun,
  ThesisModel as Thesis,
  TradeModel as Trade,
  TradeEventModel as TradeEvent,
  AgentConfigModel as AgentConfig,
  UserModel as User,
  WatchlistItemModel as WatchlistItem,
} from "@/lib/generated/prisma/models";

// Derived / composite types

export type ResearchSource = "AGENT" | "MANUAL";
export type ResearchRunStatus = "PENDING" | "RUNNING" | "COMPLETE" | "FAILED";
export type TradeDirection = "LONG" | "SHORT";
export type ThesisDirection = "LONG" | "SHORT" | "PASS";
export type HoldDuration = "DAY" | "SWING" | "POSITION";
export type TradeStatus = "OPEN" | "CLOSED" | "CANCELLED";
export type ExitStrategy = "PRICE_TARGET" | "TIME_BASED" | "TRAILING" | "MANUAL";
export type CloseReason = "TARGET" | "STOP" | "TIME" | "MANUAL";
export type TradeOutcome = "WIN" | "LOSS" | "BREAKEVEN";
export type TradeEventType =
  | "PLACED"
  | "PRICE_CHECK"
  | "NEAR_TARGET"
  | "CLOSED"
  | "EVALUATED";

import type {
  ResearchRunModel,
  ThesisModel,
  TradeModel,
  TradeEventModel,
} from "@/lib/generated/prisma/models";

export type ThesisWithTrade = ThesisModel & {
  trade: TradeModel | null;
};

export type TradeWithEvents = TradeModel & {
  events: TradeEventModel[];
};

export type ResearchRunWithTheses = ResearchRunModel & {
  theses: ThesisWithTrade[];
};
