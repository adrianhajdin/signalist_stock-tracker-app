/**
 * SourceAvatars — overlapping circle stack for data sources.
 *
 * Shows up to 3 source icons with negative margin overlap + a count label.
 * Used in brief cards, finding cards, anywhere provenance is shown.
 */

interface SourceAvatarsProps {
  sources: Array<{
    icon: React.ReactNode;
  }>;
  count?: number;
  label?: string;
}

export function SourceAvatars({ sources, count, label }: SourceAvatarsProps) {
  const visible = sources.slice(0, 3);
  const total = count ?? sources.length;

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="flex items-center -space-x-1.5">
        {visible.map((s, i) => (
          <span
            key={i}
            className="h-5 w-5 rounded-full bg-muted border-2 border-background flex items-center justify-center shrink-0"
            style={{ zIndex: visible.length - i }}
          >
            {s.icon}
          </span>
        ))}
      </span>
      <span className="text-xs text-muted-foreground">
        {label ?? `${total} source${total !== 1 ? "s" : ""}`}
      </span>
    </span>
  );
}
