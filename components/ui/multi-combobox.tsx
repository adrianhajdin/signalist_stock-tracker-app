"use client";

import { useState, type ReactNode } from "react";
import { ChevronsUpDown, X } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";

// ── MultiCombobox ───────────────────────────────────────────────────────────
// Multi-select combobox where the selected values render as chips INSIDE the
// trigger. Overflow collapses to a "+N more" chip (visible chip count is
// capped at `maxVisible`). Click the trigger to open a searchable Command
// list; selected items toggle off, unselected toggle on. Each chip has an
// inline × to remove without opening the popover.
//
// Options are always a fixed canonical list — this component is only for
// enumerated fields (Sectors, Industries). Free-text collections use the
// separate ChipListEditor.

interface MultiComboboxProps {
  values: string[];
  options: readonly string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  /** Label above the combobox in the Command group header. */
  groupLabel?: string;
  /** How many chips to render before collapsing the rest into "+N more". */
  maxVisible?: number;
  /** Render an option label (defaults to the raw value). */
  renderOption?: (value: string) => ReactNode;
  disabled?: boolean;
  className?: string;
}

export function MultiCombobox({
  values,
  options,
  onChange,
  placeholder = "Select…",
  groupLabel,
  maxVisible = 4,
  renderOption,
  disabled,
  className,
}: MultiComboboxProps) {
  const [open, setOpen] = useState(false);

  const toggle = (v: string) =>
    onChange(
      values.includes(v) ? values.filter((x) => x !== v) : [...values, v],
    );

  const remove = (v: string, e: React.MouseEvent) => {
    // Don't open the popover when clicking the chip's × button.
    e.preventDefault();
    e.stopPropagation();
    onChange(values.filter((x) => x !== v));
  };

  const visible = values.slice(0, maxVisible);
  const overflow = values.length - visible.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn(
              "h-auto min-h-9 justify-between gap-2 py-1.5 font-normal",
              className,
            )}
          />
        }
      >
        <div className="flex flex-1 flex-wrap items-center gap-1 min-w-0">
          {values.length === 0 && (
            <span className="text-muted-foreground">{placeholder}</span>
          )}
          {visible.map((v) => (
            <Badge
              key={v}
              variant="secondary"
              className="gap-1 font-normal"
            >
              <span>{renderOption ? renderOption(v) : v}</span>
              <span
                role="button"
                aria-label={`Remove ${v}`}
                onClick={(e) => remove(v, e)}
                onPointerDown={(e) => e.stopPropagation()}
                className="inline-flex items-center justify-center rounded-sm opacity-70 hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </span>
            </Badge>
          ))}
          {overflow > 0 && (
            <Badge variant="secondary" className="font-normal">
              +{overflow} more
            </Badge>
          )}
        </div>
        <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-[var(--radix-popover-trigger-width)] p-0"
      >
        <Command>
          <CommandInput placeholder="Search…" />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup heading={groupLabel}>
              {options.map((opt) => (
                <CommandItem
                  key={opt}
                  value={opt}
                  data-checked={values.includes(opt) ? "true" : undefined}
                  onSelect={() => toggle(opt)}
                >
                  {renderOption ? renderOption(opt) : opt}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
