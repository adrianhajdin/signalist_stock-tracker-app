"use client";

import { useState, useCallback } from "react";
import { Copy, Check, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Card } from "@/components/ui/card";
import {
  Sheet,
  SheetContent,
  SheetClose,
  SheetTitle,
} from "@/components/ui/sheet";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  WorkflowStepCard,
  FlowConnector,
  TeamSheetContent,
  ToolsRegistrySheetContent,
  SidebarOpenIcon,
} from "@/components/domain/team-card";
import {
  TEAMS,
  TOOL_REGISTRY,
  exportWorkflowAsMarkdown,
  type Team,
} from "@/lib/agent/workflow-registry";

// ── Copy button ────────────────────────────────────────────────────────────

function CopyMarkdownButton() {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(exportWorkflowAsMarkdown()).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, []);

  return (
    <Button variant="outline" size="sm" onClick={handleCopy}>
      {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
      {copied ? "Copied" : "Copy as markdown"}
    </Button>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

type SheetTarget = Team | "tools-registry" | null;

export default function AgentWorkflowPage() {
  const [activeSheet, setActiveSheet] = useState<SheetTarget>(null);

  return (
    <div className="p-6 space-y-4 max-w-xl mx-auto">
      <div className="space-y-1">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-2xl font-semibold">How Hindsight Works</h1>
          <CopyMarkdownButton />
        </div>
        <p className="text-sm text-muted-foreground">
          5 teams run in a daily loop. Open any step to see its workflow and tools.
        </p>
      </div>

      <Separator />

      {/* Team steps */}
      <div>
        {TEAMS.map((team, i) => (
          <div key={team.id}>
            <WorkflowStepCard
              team={team}
              onOpenSheet={() => setActiveSheet(team)}
            />
            {i < TEAMS.length - 1 && <FlowConnector />}
          </div>
        ))}
      </div>

      <Separator />

      {/* Tools Registry row */}
      <Card className="p-0 overflow-hidden">
        <div className="flex items-start gap-3 px-4 py-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium">Tools Registry</span>
              <Badge variant="outline" className="text-[10px]">
                {TOOL_REGISTRY.length} tools
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed mt-1">
              All tools available to agents — intelligence, research, action, and system lifecycle.
            </p>
          </div>
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger
                render={
                  <button
                    type="button"
                    onClick={() => setActiveSheet("tools-registry")}
                    className="shrink-0 p-1.5 rounded-md hover:bg-accent/50 transition-colors text-muted-foreground hover:text-foreground mt-0.5"
                  />
                }
              >
                <SidebarOpenIcon />
              </TooltipTrigger>
              <TooltipContent side="left">Browse all tools</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        </div>
      </Card>

      {/* Sheet */}
      <Sheet
        open={activeSheet !== null}
        onOpenChange={(open: boolean) => { if (!open) setActiveSheet(null); }}
      >
        <SheetContent
          side="right"
          showCloseButton={false}
          className="w-full sm:max-w-md overflow-y-auto"
        >
          {activeSheet && (
            <>
              <div className="flex items-center justify-between px-4 pt-4 pb-2">
                <SheetTitle>
                  {activeSheet === "tools-registry" ? "Tools Registry" : activeSheet.title}
                </SheetTitle>
                <SheetClose render={<Button variant="ghost" size="icon-sm" />}>
                  <X className="h-4 w-4" />
                </SheetClose>
              </div>
              <div className="px-4 pb-6">
                {activeSheet === "tools-registry" ? (
                  <ToolsRegistrySheetContent />
                ) : (
                  <TeamSheetContent team={activeSheet} />
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
