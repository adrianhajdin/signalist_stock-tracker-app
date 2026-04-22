"use client";

/**
 * Reasoning — ghost variant collapsible for extended thinking blocks.
 * Matches the assistant-ui ghost variant style.
 */

import { useState, type ReactNode } from "react";
import { Globe, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface ReasoningProps {
  children: ReactNode;
  defaultOpen?: boolean;
}

export function Reasoning({ children, defaultOpen = false }: ReasoningProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="my-1">
      <button
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors py-1"
        onClick={() => setOpen((o) => !o)}
      >
        <Globe className="size-3.5 shrink-0" />
        <span>Reasoning</span>
        <ChevronDown
          className={cn("size-3.5 shrink-0 transition-transform duration-200", open && "rotate-180")}
        />
      </button>
      {open && (
        <div className="ml-5 mt-0.5 text-xs text-muted-foreground leading-relaxed whitespace-pre-wrap border-l border-border/40 pl-3 py-1">
          {children}
        </div>
      )}
    </div>
  );
}
