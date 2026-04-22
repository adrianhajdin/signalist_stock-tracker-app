/**
 * AnalystBadge — THE one way to reference an analyst everywhere in the app.
 *
 * Muted bg, muted foreground text, mono font. Optional icon slot.
 */

interface AnalystBadgeProps {
  name: string;
  icon?: React.ReactNode;
}

export function AnalystBadge({ name, icon }: AnalystBadgeProps) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-muted px-2 py-0.5 text-xs font-mono text-muted-foreground">
      {icon}
      {name}
    </span>
  );
}
