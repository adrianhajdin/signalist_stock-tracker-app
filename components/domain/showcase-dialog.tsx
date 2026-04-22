"use client";

import { type ReactNode } from "react";
import {
  Dialog,
  DialogContent,
  DialogClose,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { X } from "lucide-react";
import { RunPreview } from "@/components/domain/run-preview";
import { IntelligencePreview } from "@/components/domain/intelligence-preview";
import { BuilderPreview } from "@/components/domain/builder-preview";

// ── Showcase Dialog (reusable shell) ─────────────────────────────────────────

export function ShowcaseDialog({
  open,
  onOpenChange,
  preview,
  title,
  subtitle,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  preview: ReactNode;
  title: string;
  subtitle: string;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl p-0 gap-0 overflow-hidden" showCloseButton={false}>
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">{subtitle}</DialogDescription>

        {/* White close button — always visible over dark Silk backgrounds */}
        <DialogClose className="absolute top-3 right-3 z-10 rounded-full p-1.5 text-white/80 hover:text-white hover:bg-white/10 transition-colors">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogClose>

        <div className="overflow-hidden w-full">{preview}</div>

        <div className="p-6 space-y-2">
          <h2 className="text-lg font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            {subtitle}
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Pre-built dialogs ────────────────────────────────────────────────────────

export function RunShowcaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <ShowcaseDialog
      open={open}
      onOpenChange={onOpenChange}
      preview={<RunPreview className="h-[340px] rounded-none" />}
      title="Analysts research on their own"
      subtitle="Each session reads your morning intelligence, validates opportunities with live market data, writes conviction theses, and places paper trades — all autonomously."
    />
  );
}

export function IntelligenceShowcaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <ShowcaseDialog
      open={open}
      onOpenChange={onOpenChange}
      preview={<IntelligencePreview className="h-[340px] rounded-none" />}
      title="Intelligence gathers overnight"
      subtitle="Every morning, background jobs search the web, extract tracked domains, scan market movers and earnings, then synthesize everything into a personalized brief for each analyst."
    />
  );
}

export function BuilderShowcaseDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <ShowcaseDialog
      open={open}
      onOpenChange={onOpenChange}
      preview={<BuilderPreview className="h-[340px] rounded-none" />}
      title="Build analysts in conversation"
      subtitle="Describe your trading style, preferred sources, and watchlist. The AI builder researches your tickers, configures domain monitors, and creates a complete autonomous analyst."
    />
  );
}
