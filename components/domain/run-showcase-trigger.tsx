"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { ShowcaseIcon } from "@/components/ui/showcase-icon";
import { RunShowcaseDialog, IntelligenceShowcaseDialog, BuilderShowcaseDialog } from "@/components/domain/showcase-dialog";

// ── Shared auto-show logic ───────────────────────────────────────────────────

function useAutoShow(key: string) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const storageKey = `hindsight-showcase-${key}`;
    if (!localStorage.getItem(storageKey)) {
      setOpen(true);
      localStorage.setItem(storageKey, "1");
    }
  }, [key]);

  return [open, setOpen] as const;
}

// ── Triggers (auto-show on first visit per session) ──────────────────────────

export function RunShowcaseTrigger() {
  const [open, setOpen] = useAutoShow("runs");
  return <RunShowcaseDialog open={open} onOpenChange={setOpen} />;
}

export function IntelligenceShowcaseTrigger() {
  const [open, setOpen] = useAutoShow("intelligence");
  return <IntelligenceShowcaseDialog open={open} onOpenChange={setOpen} />;
}

export function BuilderShowcaseTrigger() {
  const [open, setOpen] = useAutoShow("builder");
  return <BuilderShowcaseDialog open={open} onOpenChange={setOpen} />;
}

// ── Manual openers (ghost icon button with ShowcaseIcon) ─────────────────────

export function RunShowcaseButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <ShowcaseIcon className="h-4 w-4" />
      </Button>
      <RunShowcaseDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function IntelligenceShowcaseButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <ShowcaseIcon className="h-4 w-4" />
      </Button>
      <IntelligenceShowcaseDialog open={open} onOpenChange={setOpen} />
    </>
  );
}

export function BuilderShowcaseButton() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="ghost" size="icon" onClick={() => setOpen(true)}>
        <ShowcaseIcon className="h-4 w-4" />
      </Button>
      <BuilderShowcaseDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
