"use client";

import { useState, useCallback } from "react";
import { Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetTrigger,
  SheetClose,
  SheetContent,
  SheetTitle,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Tooltip,
  TooltipTrigger,
  TooltipContent,
  TooltipProvider,
} from "@/components/ui/tooltip";
import { TeamSheetContent } from "@/components/domain/team-card";
import {
  getTeam,
  exportWorkflowAsMarkdown,
  type TeamId,
} from "@/lib/agent/workflow-registry";
import { CoverageTab } from "@/components/intelligence/coverage-tab";
import type { CoverageData } from "@/components/intelligence/coverage-strip";

// ── Copy button ────────────────────────────────────────────────────────────

function CopyButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(exportWorkflowAsMarkdown()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger
          render={<Button variant="outline" size="icon-sm" onClick={handleCopy} />}
        >
          {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
        </TooltipTrigger>
        <TooltipContent side="bottom">
          {copied ? "Copied" : "Copy workflow as markdown"}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ── FlowType alias (backwards compat) ──────────────────────────────────────

export type FlowType = TeamId;

// ── Sheet ──────────────────────────────────────────────────────────────────

interface HowItWorksSheetProps {
  flow: FlowType;
  children: React.ReactNode;
  /** Optional coverage data — when provided, surfaces a second "Coverage" tab. */
  coverage?: CoverageData | null;
  coverageDays?: number;
}

export function HowItWorksSheet({
  flow,
  children,
  coverage,
  coverageDays = 7,
}: HowItWorksSheetProps) {
  const team = getTeam(flow);
  const hasCoverage = coverage !== undefined;

  return (
    <Sheet>
      <SheetTrigger render={<Button variant="ghost" size="icon" />}>
        {children}
      </SheetTrigger>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-full sm:max-w-md overflow-y-auto"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2">
          <SheetTitle>{team.title}</SheetTitle>
          <div className="flex items-center gap-1">
            <CopyButton />
            <SheetClose render={<Button variant="ghost" size="icon-sm" />}>
              <X className="h-4 w-4" />
            </SheetClose>
          </div>
        </div>

        {/* Content */}
        <div className="px-4 pb-6">
          {hasCoverage ? (
            <Tabs defaultValue="how">
              <TabsList>
                <TabsTrigger value="how">How it works</TabsTrigger>
                <TabsTrigger value="coverage">Coverage</TabsTrigger>
              </TabsList>
              <TabsContent value="how" className="pt-4">
                <TeamSheetContent team={team} />
              </TabsContent>
              <TabsContent value="coverage" className="pt-4">
                <CoverageTab data={coverage ?? null} days={coverageDays} />
              </TabsContent>
            </Tabs>
          ) : (
            <TeamSheetContent team={team} />
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
