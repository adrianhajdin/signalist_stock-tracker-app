"use client";

/**
 * AskQuestionRenderer — renders an ask_question tool call using the
 * Tool-UI Question Flow library (https://www.tool-ui.com/docs/question-flow).
 *
 * The tool emits a payload conforming to the library's
 * SerializableProgressiveMode schema. We parse it with the library's
 * own validator, then render <QuestionFlow> in progressive mode. When
 * the user clicks Next, we append their selection as a new user
 * message via the assistant-ui thread runtime — the agent sees it as
 * the reply and continues the interview.
 *
 * When the user has already answered (replay of historical runs), we
 * render the Receipt variant of QuestionFlow showing the finalized
 * choice rather than a live pill group.
 *
 * RENDERING NOTE: this component renders QuestionFlow DIRECTLY — no
 * ToolProgress wrapper, no group header. The question itself is the
 * UI. A tool row header on top of a standalone question panel is a
 * double-header bug. If parsing fails we fall back to a bare text
 * line, not a progress row.
 */

import { useMemo, useState } from "react";
import { useThreadRuntime } from "@assistant-ui/react";
import type { ToolResult } from "@/lib/agent/tool-result";
import { QuestionFlow } from "@/components/tool-ui/question-flow";
import { safeParseSerializableQuestionFlow } from "@/components/tool-ui/question-flow/schema";
import type { SerializableProgressiveMode } from "@/components/tool-ui/question-flow/schema";

interface Props {
  toolName: string;
  result: Extract<ToolResult, { ok: true }>;
  loading: boolean;
}

export function AskQuestionRenderer({ result }: Props) {
  const threadRuntime = useThreadRuntime();
  const [answered, setAnswered] = useState(false);
  const [chosenLabels, setChosenLabels] = useState<string[] | null>(null);

  // Validate the payload against the Question Flow library schema.
  const parsed = useMemo(
    () => safeParseSerializableQuestionFlow(result.data),
    [result.data],
  );

  // If parsing fails, fall back to a single bare text line — never
  // crash the thread on a malformed tool emission. We intentionally do
  // not re-wrap in ToolProgress; a silent one-liner is less noisy than
  // a second header stacked on top of the real question.
  if (!parsed || !("options" in parsed)) {
    return (
      <p className="text-sm text-muted-foreground">{result.summary}</p>
    );
  }

  // At this point parsed is either Progressive or Upfront — ask_question
  // only emits Progressive. Narrow the type.
  const progressive = parsed as SerializableProgressiveMode;

  const handleSelect = (optionIds: string[]) => {
    if (answered) return;
    const labels = optionIds
      .map((id) => progressive.options.find((o) => o.id === id)?.label)
      .filter((l): l is string => typeof l === "string");
    if (labels.length === 0) return;
    setChosenLabels(labels);
    setAnswered(true);
    threadRuntime.append({
      role: "user",
      content: [{ type: "text", text: labels.join(", ") }],
    });
  };

  if (answered && chosenLabels) {
    return (
      <QuestionFlow
        id={progressive.id}
        choice={{
          title: progressive.title,
          summary: [
            {
              label: "Answer",
              value: chosenLabels.join(", "),
            },
          ],
        }}
      />
    );
  }

  return (
    <QuestionFlow
      id={progressive.id}
      step={progressive.step}
      title={progressive.title}
      description={progressive.description}
      options={progressive.options}
      selectionMode={progressive.selectionMode ?? "single"}
      onSelect={handleSelect}
    />
  );
}
