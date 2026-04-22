"use client";

import { useState } from "react";
import { BriefCard } from "@/components/intelligence/brief-card";
import { SkeletonCardStack } from "@/components/domain/skeleton-card";
import { BriefDetailDialog } from "@/components/intelligence/brief-detail";
import { normalizeIntelBrief } from "@/components/intelligence/brief-types";
import type { UnifiedBrief } from "@/components/intelligence/brief-types";
import type { MorningBrief } from "./types";

// ── Brief Cards Grid ────────────────────────────────────────────────────────
// Used on /intelligence Briefs tab. Takes raw MorningBrief[], normalizes, renders.

interface BriefCardsProps {
  briefs: MorningBrief[];
}

export function BriefCards({ briefs }: BriefCardsProps) {
  const [selected, setSelected] = useState<UnifiedBrief | null>(null);

  if (briefs.length === 0) {
    return (
      <SkeletonCardStack
        count={2}
        title="No briefs yet"
        subtitle="Morning briefs are generated at 7:45 AM ET for each analyst. Post-run standups appear after every research session."
      />
    );
  }

  const unified = briefs.map(normalizeIntelBrief);

  return (
    <>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {unified.map((b) => (
          <BriefCard key={b.id} brief={b} onClick={() => setSelected(b)} />
        ))}
      </div>

      <BriefDetailDialog
        brief={selected}
        open={!!selected}
        onOpenChange={(open) => !open && setSelected(null)}
      />
    </>
  );
}
