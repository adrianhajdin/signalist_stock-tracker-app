"use client";

import { useState, useRef, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { triggerResearchRun } from "@/lib/actions/research.actions";
import { toast } from "sonner";

// ---- Types ----------------------------------------------------------------

type StreamEvent =
  | { type: "thinking"; text: string }
  | { type: "token"; text: string }
  | { type: "complete"; thesis: ThesisOutput }
  | { type: "error"; text: string };

type ThesisOutput = {
  ticker: string;
  direction: "LONG" | "SHORT" | "PASS";
  entry_price: number | null;
  target_price: number | null;
  stop_loss: number | null;
  hold_duration: string;
  confidence_score: number;
  reasoning_summary: string;
  thesis_bullets: string[];
  risk_flags: string[];
  signal_types: string[];
  sector: string | null;
  model_used: string;
};

type Message =
  | { role: "user"; text: string }
  | { role: "assistant"; status: "thinking" | "streaming" | "done" | "error"; thinkingText?: string; streamedText?: string; thesis?: ThesisOutput; errorText?: string };

// ---- Component ------------------------------------------------------------

export default function ResearchChat({ userId }: { userId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const msg = input.trim();
    if (!msg || busy) return;

    setInput("");
    setBusy(true);

    // Optimistic user bubble
    setMessages((prev) => [...prev, { role: "user", text: msg }]);

    // Placeholder assistant message
    const assistantIdx = messages.length + 1;
    setMessages((prev) => [
      ...prev,
      { role: "assistant", status: "thinking", thinkingText: "Starting research..." },
    ]);

    try {
      const res = await fetch("/api/research/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: msg }),
      });

      if (!res.body) throw new Error("No response stream");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      let finalThesis: ThesisOutput | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";

        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          try {
            const event: StreamEvent = JSON.parse(line.slice(5).trim());

            if (event.type === "thinking") {
              setMessages((prev) =>
                prev.map((m, i) =>
                  i === assistantIdx
                    ? { ...m, status: "thinking", thinkingText: event.text } as Message
                    : m
                )
              );
            } else if (event.type === "token") {
              setMessages((prev) =>
                prev.map((m, i) =>
                  i === assistantIdx
                    ? {
                        ...m,
                        status: "streaming",
                        streamedText: ((m as { streamedText?: string }).streamedText ?? "") + event.text,
                      } as Message
                    : m
                )
              );
            } else if (event.type === "complete") {
              finalThesis = event.thesis;
              setMessages((prev) =>
                prev.map((m, i) =>
                  i === assistantIdx
                    ? { ...m, status: "done", thesis: event.thesis } as Message
                    : m
                )
              );
            } else if (event.type === "error") {
              setMessages((prev) =>
                prev.map((m, i) =>
                  i === assistantIdx
                    ? { ...m, status: "error", errorText: event.text } as Message
                    : m
                )
              );
            }
          } catch {
            // malformed SSE line — ignore
          }
        }
      }

      // Save completed thesis to DB
      if (finalThesis && finalThesis.direction !== "PASS" && userId) {
        try {
          await triggerResearchRun(userId, [finalThesis.ticker], "MANUAL");
        } catch {
          // non-fatal — thesis still shows
        }
      }
    } catch (err) {
      setMessages((prev) =>
        prev.map((m, i) =>
          i === assistantIdx
            ? { ...m, status: "error", errorText: err instanceof Error ? err.message : "Unknown error" } as Message
            : m
        )
      );
      toast.error("Research failed");
    } finally {
      setBusy(false);
    }
  }

  const isEmpty = messages.length === 0;

  return (
    <div className="flex flex-col gap-4">
      <ScrollArea className="h-[60vh] rounded-lg border p-4">
        {isEmpty && (
          <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
            Ask about any stock. Try: &quot;Research NVDA for a swing trade&quot;
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, i) =>
            msg.role === "user" ? (
              <div key={i} className="flex justify-end">
                <div className="bg-primary text-primary-foreground rounded-lg px-4 py-2 text-sm max-w-xs">
                  {msg.text}
                </div>
              </div>
            ) : (
              <AssistantMessage key={i} msg={msg} />
            )
          )}
        </div>

        <div ref={bottomRef} />
      </ScrollArea>

      <form onSubmit={handleSubmit} className="flex gap-2">
        <Textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              handleSubmit(e as unknown as React.FormEvent);
            }
          }}
          placeholder="Research NVDA for a swing trade..."
          className="flex-1 min-h-[44px] max-h-32 resize-none"
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          {busy ? "Researching..." : "Send"}
        </Button>
      </form>
    </div>
  );
}

// ---- Sub-components -------------------------------------------------------

function AssistantMessage({ msg }: { msg: Extract<Message, { role: "assistant" }> }) {
  if (msg.status === "thinking") {
    return (
      <div className="flex gap-2 items-center text-sm text-muted-foreground">
        <span className="animate-pulse">●</span>
        <span>{msg.thinkingText}</span>
      </div>
    );
  }

  if (msg.status === "streaming") {
    return (
      <Card className="p-4 text-sm whitespace-pre-wrap">
        {msg.streamedText}
        <span className="animate-pulse">▌</span>
      </Card>
    );
  }

  if (msg.status === "error") {
    return (
      <Card className="border-destructive p-4">
        <p className="text-sm text-destructive">
          Research failed — {msg.errorText ?? "unknown error"}. Please try again.
        </p>
      </Card>
    );
  }

  if (msg.status === "done" && msg.thesis) {
    return <ThesisCard thesis={msg.thesis} />;
  }

  return null;
}

function ThesisCard({ thesis }: { thesis: ThesisOutput }) {
  const directionColor =
    thesis.direction === "LONG"
      ? "text-emerald-500"
      : thesis.direction === "SHORT"
        ? "text-red-500"
        : "text-muted-foreground";

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg">
            {thesis.ticker}
            <span className={`ml-2 text-base font-semibold tabular-nums ${directionColor}`}>
              {thesis.direction}
            </span>
          </CardTitle>
          <div className="flex gap-2 items-center">
            <span className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
              Confidence
            </span>
            <span className={`tabular-nums font-semibold ${thesis.confidence_score >= 70 ? "text-emerald-500" : "text-red-500"}`}>
              {thesis.confidence_score}%
            </span>
          </div>
        </div>

        <div className="flex flex-wrap gap-1 mt-1">
          {thesis.signal_types.map((s) => (
            <Badge key={s} variant="secondary" className="text-xs">
              {s}
            </Badge>
          ))}
          {thesis.sector && (
            <Badge variant="outline" className="text-xs">
              {thesis.sector}
            </Badge>
          )}
          <Badge variant="outline" className="text-xs">
            {thesis.hold_duration}
          </Badge>
        </div>
      </CardHeader>

      <CardContent className="space-y-4 text-sm">
        {/* Price levels */}
        {thesis.entry_price && (
          <div className="grid grid-cols-3 gap-2 text-center">
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Entry</p>
              <p className="tabular-nums font-semibold">${thesis.entry_price.toFixed(2)}</p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Target</p>
              <p className="tabular-nums font-semibold text-emerald-500">
                {thesis.target_price ? `$${thesis.target_price.toFixed(2)}` : "—"}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Stop</p>
              <p className="tabular-nums font-semibold text-red-500">
                {thesis.stop_loss ? `$${thesis.stop_loss.toFixed(2)}` : "—"}
              </p>
            </div>
          </div>
        )}

        {/* Reasoning */}
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
            Analysis
          </p>
          <p className="text-muted-foreground leading-relaxed">{thesis.reasoning_summary}</p>
        </div>

        {/* Bullets */}
        {thesis.thesis_bullets.length > 0 && (
          <ul className="space-y-1 list-disc list-inside text-muted-foreground">
            {thesis.thesis_bullets.map((b, i) => (
              <li key={i}>{b}</li>
            ))}
          </ul>
        )}

        {/* Risks */}
        {thesis.risk_flags.length > 0 && (
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground mb-1">
              Risks
            </p>
            <ul className="space-y-1 list-disc list-inside text-red-500/80">
              {thesis.risk_flags.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        )}

        {/* PASS state */}
        {thesis.direction === "PASS" && (
          <p className="text-muted-foreground italic">
            No high-conviction trade identified. The AI suggests passing on this setup.
          </p>
        )}
      </CardContent>
    </Card>
  );
}
