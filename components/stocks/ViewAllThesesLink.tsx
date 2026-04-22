"use client";

import { ArrowRight } from "lucide-react";

export function ViewAllThesesLink({ count }: { count: number }) {
  return (
    <button
      className="text-xs text-muted-foreground hover:text-foreground transition-colors flex items-center gap-1"
      onClick={() => {
        const tabTrigger = document.querySelector('[data-value="theses"]') as HTMLElement;
        tabTrigger?.click();
      }}
    >
      View all {count} analyses <ArrowRight className="h-3 w-3" />
    </button>
  );
}
