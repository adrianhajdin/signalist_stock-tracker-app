import { cn } from "@/lib/utils";
import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

/**
 * InfoRow — the ONE component for label-left / value-right rows.
 * Matches the Trade Details Card reference design exactly.
 *
 * Usage (display):   <InfoRow label="Direction" value="LONG" />
 * Usage (edit):      <InfoRow label="Direction"><Select ... /></InfoRow>
 * Usage (no border): <InfoRow label="P&L" value="+$12" border={false} />
 * Usage (tooltip):   <InfoRow label="Min Confidence" value="70%"
 *                              tooltip="Lowest thesis confidence that can place a trade." />
 *
 * When `tooltip` is supplied we render a small info (i) icon next to the
 * label that, on hover, opens a TooltipContent with the explanation.
 * Keep tooltip copy short — one or two sentences max.
 */
export function InfoRow({
  label,
  value,
  children,
  mono = false,
  border = true,
  className,
  valueClassName,
  tooltip,
}: {
  label: string;
  value?: React.ReactNode;
  children?: React.ReactNode;
  mono?: boolean;
  border?: boolean;
  className?: string;
  valueClassName?: string;
  tooltip?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between text-sm min-h-8",
        border && "border-b border-border pb-1",
        className,
      )}
    >
      <span className="text-muted-foreground shrink-0 flex items-center gap-1">
        {label}
        {tooltip && (
          <TooltipProvider>
            <Tooltip>
              <TooltipTrigger render={<span className="cursor-help inline-flex items-center" />}>
                <Info className="h-3 w-3 text-muted-foreground/70" />
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-xs">{tooltip}</TooltipContent>
            </Tooltip>
          </TooltipProvider>
        )}
      </span>
      {children ?? (
        <span
          className={cn(
            "font-medium text-right truncate",
            mono && "tabular-nums",
            valueClassName,
          )}
        >
          {value}
        </span>
      )}
    </div>
  );
}
