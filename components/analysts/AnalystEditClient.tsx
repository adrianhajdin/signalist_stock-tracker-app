"use client";

import { useState, useCallback } from "react";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AgentChat } from "@/components/agent/AgentChat";
import { AnalystConfigPanel } from "@/components/analysts/AnalystConfigPanel";
import type { AgentConfigData } from "@/components/domain/agent-config-card";

export function AnalystEditClient({
  analystId,
  currentConfig,
  initialMessage,
}: {
  analystId: string;
  currentConfig: Record<string, unknown>;
  initialMessage?: string;
}) {
  // Panel hidden until AI suggests changes (same behavior as builder)
  const [configData, setConfigData] = useState<AgentConfigData | null>(null);
  const [confirmHandler, setConfirmHandler] = useState<(() => void) | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const handleConfigSuggested = useCallback(
    (config: AgentConfigData, onConfirm: () => void) => {
      setConfigData(config);
      setConfirmHandler(() => onConfirm);
    },
    []
  );

  const handleApplyingChange = useCallback((applying: boolean) => {
    setIsApplying(applying);
  }, []);

  const panelOpen = configData !== null;

  return (
    <div className="relative h-[calc(100dvh-3rem)] overflow-hidden">
      {/* Back button */}
      <div className="absolute top-2 left-3 z-20 flex items-center gap-1">
        <Button variant="ghost" size="icon" render={<Link href={`/analysts/${analystId}`} />}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
      </div>

      {/* Split layout — chat shrinks, panel grows (same as builder) */}
      <div className="h-full flex">
        {/* Chat side — shrinks smoothly when panel opens */}
        <div
          className="min-h-0 transition-all duration-500 ease-out"
          style={{ flex: panelOpen ? "0 0 55%" : "1 1 100%" }}
        >
          <AgentChat
            mode="editor"
            analystId={analystId}
            currentConfig={currentConfig}
            initialPrompt={initialMessage}
            onConfigSuggested={handleConfigSuggested}
            onMutatingChange={handleApplyingChange}
          />
        </div>

        {/* Config panel — grows in from right when AI suggests changes */}
        <div
          className="min-h-0 transition-all duration-500 ease-out overflow-hidden"
          style={{
            flex: panelOpen ? "0 0 45%" : "0 0 0%",
            opacity: panelOpen ? 1 : 0,
          }}
        >
          <div className="h-full p-3 pl-0">
            {configData && (
              <AnalystConfigPanel
                config={configData}
                onConfirm={confirmHandler ?? (() => {})}
                isCreating={isApplying}
                confirmLabel="Apply Changes"
                confirmingLabel="Applying..."
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
