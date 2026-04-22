"use client";

import { cn } from "@/lib/utils";

/**
 * Skeleton preview card — looks like content that hasn't loaded yet.
 * Border, grid layout: square placeholder left, skeleton text rows right.
 * Shimmer animation across the whole thing.
 */
export function SkeletonCard({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        "rounded-xl border overflow-hidden relative",
        className,
      )}
    >
      {/* Shimmer overlay */}
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_2s_infinite] bg-gradient-to-r from-transparent via-foreground/[0.03] to-transparent z-10 pointer-events-none" />

      <div className="grid grid-cols-[auto_1fr] gap-4 p-4">
        {/* Left: square placeholder */}
        <div className="w-16 h-16 rounded-lg bg-muted" />

        {/* Right: skeleton text rows */}
        <div className="space-y-2.5 py-1">
          <div className="flex items-center gap-2">
            <div className="h-2.5 w-24 rounded bg-muted" />
            <div className="h-2.5 w-12 rounded bg-muted/60" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-32 rounded bg-muted/70" />
            <div className="h-2 w-16 rounded bg-muted/50" />
            <div className="h-2 w-10 rounded bg-muted/40" />
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 w-20 rounded bg-muted/60" />
            <div className="h-2 w-28 rounded bg-muted/50" />
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Stack of skeleton cards with text overlay and fading opacity.
 */
export function SkeletonCardStack({
  count = 3,
  title,
  subtitle,
  className,
}: {
  count?: number;
  title?: string;
  subtitle?: string;
  className?: string;
}) {
  const opacities = [1, 0.6, 0.35, 0.2, 0.1];

  return (
    <div className={cn("relative", className)}>
      <div className="space-y-3">
        {Array.from({ length: count }).map((_, i) => (
          <div key={i} style={{ opacity: opacities[i] ?? 0.1 }}>
            <SkeletonCard />
          </div>
        ))}
      </div>

      {/* Text overlay — centered on the stack */}
      {(title || subtitle) && (
        <div className="absolute inset-0 flex flex-col items-center justify-center z-20 pointer-events-none">
          {title && <p className="text-base font-medium">{title}</p>}
          {subtitle && (
            <p className="text-sm text-muted-foreground text-center max-w-sm mt-1">
              {subtitle}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
