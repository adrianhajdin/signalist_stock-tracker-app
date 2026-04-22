"use client";

import { useState } from "react";
import Link from "next/link";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AlpacaKeyGate } from "@/components/settings/AlpacaKeyGate";
import { Check, ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface OnboardingStep {
  label: string;
  description: string;
  done: boolean;
  action: () => void;
}

export function OnboardingChecklist({
  hasAlpacaKey,
  hasAnalyst,
  hasCompletedRun,
  hasBrief,
}: {
  hasAlpacaKey: boolean;
  hasAnalyst: boolean;
  hasCompletedRun: boolean;
  hasBrief: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const [showAlpacaGate, setShowAlpacaGate] = useState(false);

  const steps: OnboardingStep[] = [
    {
      label: "Connect Alpaca",
      description: "Paper trading with real market prices",
      done: hasAlpacaKey,
      action: () => setShowAlpacaGate(true),
    },
    {
      label: "Create your first analyst",
      description: "Describe a strategy, we build the rest",
      done: hasAnalyst,
      action: () => { window.location.href = "/analysts"; },
    },
    {
      label: "Run your first session",
      description: "14 tools, live data, autonomous research",
      done: hasCompletedRun,
      action: () => { window.location.href = "/analysts"; },
    },
    {
      label: "Review your first brief",
      description: "See what your analyst found",
      done: hasBrief,
      action: () => { window.location.href = "/intelligence"; },
    },
  ];

  const completedCount = steps.filter((s) => s.done).length;
  const allDone = completedCount === steps.length;

  // Don't render if everything is complete
  if (allDone) return null;

  const progressPct = (completedCount / steps.length) * 100;

  return (
    <>
      {/* Alpaca modal — triggered by clicking the step */}
      {showAlpacaGate && !hasAlpacaKey && (
        <AlpacaKeyGate hasKey={false} allowSkip />
      )}

      {/* Floating bottom-right panel */}
      <div className="fixed bottom-4 right-4 left-4 sm:left-auto z-50 sm:w-80">
        <Card className="shadow-lg p-0 overflow-hidden">
          {/* Header — always visible, click to collapse */}
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/50 transition-colors"
          >
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium">Get started</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {completedCount} of {steps.length}
              </span>
            </div>
            <div className="flex items-center gap-2">
              {/* Progress bar */}
              <div className="w-16 h-1.5 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-positive transition-all duration-500"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
              {collapsed ? (
                <ChevronUp className="h-4 w-4 text-muted-foreground" />
              ) : (
                <ChevronDown className="h-4 w-4 text-muted-foreground" />
              )}
            </div>
          </button>

          {/* Steps — collapsible */}
          {!collapsed && (
            <div className="border-t">
              {steps.map((step, i) => (
                <button
                  key={step.label}
                  onClick={() => { if (!step.done) step.action(); }}
                  disabled={step.done}
                  className={cn(
                    "w-full flex items-start gap-3 px-4 py-3 text-left transition-colors",
                    !step.done && "hover:bg-muted/50 cursor-pointer",
                    i < steps.length - 1 && "border-b",
                  )}
                >
                  {/* Checkbox */}
                  <div className={cn(
                    "mt-0.5 h-4 w-4 rounded-full border flex items-center justify-center shrink-0 transition-colors",
                    step.done
                      ? "bg-positive border-positive text-positive-foreground"
                      : "border-muted-foreground/30",
                  )}>
                    {step.done && <Check className="h-2.5 w-2.5" />}
                  </div>
                  <div>
                    <p className={cn(
                      "text-sm",
                      step.done ? "text-muted-foreground line-through" : "font-medium",
                    )}>
                      {step.label}
                    </p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {step.description}
                    </p>
                  </div>
                </button>
              ))}
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
