"use client";

import Link from "next/link";
import { Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { HowItWorksSheet, type FlowType } from "@/components/domain/how-it-works-sheet";
import {
  CONCEPTS,
  EMPTY_STATES,
  type ConceptKey,
} from "@/lib/education/concepts";

// ── Education Empty State ──────────────────────────────────────────────────
// Reusable empty state with icon, title, description, and optional actions.
// Use the `stateKey` prop to pull from centralized EMPTY_STATES config,
// or pass custom props directly.

interface EducationEmptyStateProps {
  /** Key into EMPTY_STATES config */
  stateKey?: string;
  /** Override: concept key for icon */
  concept?: ConceptKey;
  /** Override: title text */
  title?: string;
  /** Override: description text */
  description?: string;
  /** Override: CTA button */
  action?: { label: string; href: string };
  /** Override: HowItWorksSheet flow type */
  learnMoreFlow?: string;
  /** Size variant */
  size?: "default" | "compact" | "inline";
}

export function EducationEmptyState({
  stateKey,
  concept: conceptOverride,
  title: titleOverride,
  description: descOverride,
  action: actionOverride,
  learnMoreFlow: flowOverride,
  size = "default",
}: EducationEmptyStateProps) {
  const config = stateKey ? EMPTY_STATES[stateKey] : undefined;

  const conceptKey = conceptOverride ?? config?.concept ?? "analyst";
  const concept = CONCEPTS[conceptKey];
  const Icon = concept.icon;
  const title = titleOverride ?? config?.title ?? "Nothing here yet";
  const description = descOverride ?? config?.description ?? concept.description;
  const action = actionOverride ?? config?.action;
  const learnMoreFlow = flowOverride ?? config?.learnMoreFlow;

  if (size === "inline") {
    return (
      <div className="flex flex-col items-center justify-center py-6 px-4 space-y-2">
        <Icon className="h-8 w-8 text-muted-foreground/30" />
        <p className="text-xs text-muted-foreground text-center max-w-xs leading-relaxed">
          {title}. {description}
        </p>
      </div>
    );
  }

  if (size === "compact") {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
        <Icon className="h-8 w-8 mb-3 opacity-30" />
        <p className="text-sm font-medium text-foreground">{title}</p>
        <p className="text-xs mt-1 max-w-sm leading-relaxed">{description}</p>
        {(action || learnMoreFlow) && (
          <div className="flex items-center gap-2 mt-4">
            {action && (
              <Link
                href={action.href}
                className="inline-flex items-center justify-center h-8 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-muted"
              >
                {action.label}
              </Link>
            )}
            {learnMoreFlow && (
              <HowItWorksSheet flow={learnMoreFlow as FlowType}>
                <Info className="h-4 w-4" />
              </HowItWorksSheet>
            )}
          </div>
        )}
      </div>
    );
  }

  // Default: full empty state
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center text-muted-foreground">
      <Icon className="h-10 w-10 mb-4 opacity-30" />
      <p className="text-sm font-medium text-foreground">{title}</p>
      <p className="text-xs mt-1.5 max-w-md leading-relaxed">{description}</p>
      {(action || learnMoreFlow) && (
        <div className="flex items-center gap-2 mt-5">
          {action && (
            <Link
              href={action.href}
              className="inline-flex items-center justify-center h-8 rounded-md border border-input bg-background px-3 text-sm font-medium shadow-sm hover:bg-muted"
            >
              {action.label}
            </Link>
          )}
          {learnMoreFlow && (
            <HowItWorksSheet flow={learnMoreFlow as FlowType}>
              <Info className="h-4 w-4" />
            </HowItWorksSheet>
          )}
        </div>
      )}
    </div>
  );
}

// ── Concept Tooltip ────────────────────────────────────────────────────────
// Inline tooltip that explains a concept on hover.

export function ConceptTooltip({
  concept,
  children,
}: {
  concept: ConceptKey;
  children: React.ReactNode;
}) {
  const def = CONCEPTS[concept];

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger render={<span className="inline-flex items-center gap-1 border-b border-dashed border-muted-foreground/30 cursor-help" />}>
          {children}
        </TooltipTrigger>
        <TooltipContent side="bottom" className="max-w-xs">
          <p className="text-xs leading-relaxed">{def.tooltip}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
