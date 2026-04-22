"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Redo2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export function RunResearchButton({
  hasRunning,
  analystId,
}: {
  hasRunning: boolean;
  analystId?: string;
}) {
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleClick = async () => {
    setLoading(true);
    try {
      // Create a run row, then navigate to the agent UI
      const res = await fetch("/api/research/agent-run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentConfigId: analystId }),
      });

      if (!res.ok) throw new Error("Failed to create run");

      const { runId } = (await res.json()) as { runId: string };
      router.push(`/runs/${runId}`);
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to start research run",
      );
      setLoading(false);
    }
  };

  const disabled = loading || hasRunning;

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleClick}
      disabled={disabled}
    >
      {loading || hasRunning ? (
        <Loader2 className="animate-spin" />
      ) : (
        <Redo2 />
      )}
      {loading
        ? "Starting run…"
        : hasRunning
          ? "Running…"
          : "Run"}
    </Button>
  );
}
