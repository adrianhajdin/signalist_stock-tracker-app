"use client";

import { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { RESEARCH_MODEL_OPTIONS } from "@/lib/agent/modes";

const MODEL_PREF_KEY = "hindsight_research_model";
const DEFAULT_MODEL = "gpt-4o";

export function ModelPreferenceForm() {
  const [selectedModel, setSelectedModel] = useState<string>(DEFAULT_MODEL);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem(MODEL_PREF_KEY);
    const valid = RESEARCH_MODEL_OPTIONS.some((o) => o.value === stored);
    setSelectedModel(valid && stored ? stored : DEFAULT_MODEL);
    setMounted(true);
  }, []);

  function handleChange(value: string) {
    setSelectedModel(value);
    localStorage.setItem(MODEL_PREF_KEY, value);
  }

  if (!mounted) return null;

  const current = RESEARCH_MODEL_OPTIONS.find((o) => o.value === selectedModel);

  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between gap-4">
          <div className="space-y-0.5">
            <Label className="text-sm">Default research model</Label>
            <p className="text-xs text-muted-foreground">
              Used when starting a new analyst run. Can be changed per-run in the chat composer.
            </p>
          </div>
          <Select value={selectedModel} onValueChange={(v) => v && handleChange(v)} disabled={!mounted}>
            <SelectTrigger className="w-44 shrink-0">
              <SelectValue>{current?.label ?? selectedModel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {RESEARCH_MODEL_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </CardContent>
    </Card>
  );
}
