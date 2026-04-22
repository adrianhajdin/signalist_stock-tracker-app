"use client";

import { ThesisRow } from "@/components/ui/thesis-row";
import type { ThesisRowData } from "@/components/ui/thesis-row";

interface StockThesesListProps {
  theses: ThesisRowData[];
}

export function StockThesesList({ theses }: StockThesesListProps) {
  if (theses.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-muted-foreground">No previous research yet.</p>
        <p className="text-xs text-muted-foreground mt-1">Click Research to get started.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {theses.map((t) => (
        <ThesisRow key={t.id} thesis={t} showTicker={false} />
      ))}
    </div>
  );
}
