"use client";

import {
  forwardRef,
  useImperativeHandle,
  useState,
  useEffect,
  useRef,
  type ComponentType,
} from "react";
import { createPortal } from "react-dom";
import { StockLogo } from "@/components/StockLogo";

// ── Types ──────────────────────────────────────────────────────────────────

export interface TickerItem {
  symbol: string;
  name: string;
}

export interface CommandItem {
  name: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  template: string;
}

export type SuggestionItem = TickerItem | CommandItem;

export interface SuggestionListProps {
  char: "@" | "/";
  items: SuggestionItem[];
  command: (props: { id: string; label: string }) => void;
  clientRect: (() => DOMRect | null) | null;
}

export interface SuggestionListHandle {
  onKeyDown: (event: KeyboardEvent) => boolean;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function isTickerItem(item: SuggestionItem): item is TickerItem {
  return "symbol" in item;
}

// ── Component ──────────────────────────────────────────────────────────────

export const SuggestionList = forwardRef<SuggestionListHandle, SuggestionListProps>(
  function SuggestionList({ char, items, command, clientRect }, ref) {
    const [selectedIndex, setSelectedIndex] = useState(0);
    const [mounted, setMounted] = useState(false);

    // Stable refs so imperative handle never has stale closures
    const selectedIndexRef = useRef(0);
    const itemsRef = useRef(items);
    const commandRef = useRef(command);

    useEffect(() => { setMounted(true); }, []);

    useEffect(() => {
      setSelectedIndex(0);
      selectedIndexRef.current = 0;
    }, [items]);

    useEffect(() => { selectedIndexRef.current = selectedIndex; }, [selectedIndex]);
    useEffect(() => { itemsRef.current = items; }, [items]);
    useEffect(() => { commandRef.current = command; }, [command]);

    const selectItem = (index: number) => {
      const item = itemsRef.current[index];
      if (!item) return;
      if (isTickerItem(item)) {
        commandRef.current({ id: item.symbol, label: item.name });
      } else {
        commandRef.current({ id: item.name, label: item.label });
      }
    };

    useImperativeHandle(ref, () => ({
      onKeyDown(event: KeyboardEvent): boolean {
        const len = itemsRef.current.length;
        if (len === 0) return false;

        if (event.key === "ArrowUp") {
          setSelectedIndex((i) => {
            const next = (i - 1 + len) % len;
            selectedIndexRef.current = next;
            return next;
          });
          return true;
        }
        if (event.key === "ArrowDown") {
          setSelectedIndex((i) => {
            const next = (i + 1) % len;
            selectedIndexRef.current = next;
            return next;
          });
          return true;
        }
        if (event.key === "Enter") {
          selectItem(selectedIndexRef.current);
          return true;
        }
        return false;
      },
    }));

    const rect = clientRect?.();
    if (!rect || !mounted) return null;

    const popup = (
      <div
        style={{
          position: "fixed",
          top: rect.bottom + 6,
          left: rect.left,
          zIndex: 9999,
        }}
        className="bg-popover text-popover-foreground border border-border rounded-md shadow-lg min-w-52 w-64 py-1 overflow-hidden"
      >
        {items.length === 0 ? (
          <div className="px-3 py-2 text-sm text-muted-foreground">
            {char === "@" ? "No stocks found." : "No commands found."}
          </div>
        ) : (
          items.map((item, index) => {
            const isSelected = index === selectedIndex;
            const rowClass = [
              "w-full flex items-center gap-2 px-3 py-1.5 text-sm cursor-pointer text-left transition-colors",
              isSelected ? "bg-accent text-accent-foreground" : "hover:bg-accent/50",
            ].join(" ");

            if (isTickerItem(item)) {
              return (
                <button
                  key={item.symbol}
                  type="button"
                  className={rowClass}
                  onMouseEnter={() => setSelectedIndex(index)}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    selectItem(index);
                  }}
                >
                  <StockLogo ticker={item.symbol} size="sm" className="size-4 shrink-0" />
                  <span className="font-medium tabular-nums">{item.symbol}</span>
                  <span className="text-muted-foreground truncate text-xs flex-1 min-w-0">
                    {item.name}
                  </span>
                </button>
              );
            }

            const Icon = item.icon;
            return (
              <button
                key={item.name}
                type="button"
                className={rowClass}
                onMouseEnter={() => setSelectedIndex(index)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  selectItem(index);
                }}
              >
                <Icon className="size-4 shrink-0 text-muted-foreground" />
                <span>{item.label}</span>
              </button>
            );
          })
        )}
      </div>
    );

    return createPortal(popup, document.body);
  },
);

SuggestionList.displayName = "SuggestionList";
