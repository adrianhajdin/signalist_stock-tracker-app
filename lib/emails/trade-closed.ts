// ─── Trade Closed email template (WIN + LOSS) ─────────────────────────────────

export interface TradeClosedData {
  ticker: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  closePrice: number;
  realizedPnl: number;
  realizedPnlPct: number;
  outcome: "WIN" | "LOSS" | "BREAKEVEN";
  closeReason: string;
  daysHeld: number;
  tradeId: string;
}

export function tradeClosedHtml(d: TradeClosedData): string {
  const isWin = d.outcome === "WIN";
  const isBreakeven = d.outcome === "BREAKEVEN";
  const pnlColor = isWin ? "#51b857" : isBreakeven ? "#f59e0b" : "#ff6d87";
  const pnlSign = d.realizedPnl >= 0 ? "+" : "";

  const outcomeEmoji = isWin ? "✅" : isBreakeven ? "↔️" : "⛔";
  const outcomeLabel = isWin ? "WIN" : isBreakeven ? "BREAKEVEN" : "LOSS";

  const reasonLabels: Record<string, string> = {
    TARGET: "Price target reached",
    STOP: "Stop loss hit",
    TIME: "Time exit",
    MANUAL: "Manually closed",
  };
  const reasonLabel = reasonLabels[d.closeReason] ?? d.closeReason;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f9fafb;">
  <div style="max-width:560px;margin:32px auto;padding:0 16px;">

    <!-- Header -->
    <div style="margin-bottom:24px;">
      <p style="margin:0;font-size:12px;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Hindsight Agent</p>
      <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;color:#f9fafb;">
        ${outcomeEmoji} ${d.ticker} closed — ${outcomeLabel}
      </h1>
    </div>

    <!-- Stats card -->
    <div style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:20px;margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">Direction</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;color:#f9fafb;">${d.direction === "LONG" ? "📈 Long" : "📉 Short"}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">Entry</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;color:#f9fafb;font-variant-numeric:tabular-nums;">$${d.entryPrice.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">Exit</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;color:#f9fafb;font-variant-numeric:tabular-nums;">$${d.closePrice.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">Realized P&amp;L</td>
          <td style="padding:6px 0;font-size:15px;font-weight:700;text-align:right;color:${pnlColor};font-variant-numeric:tabular-nums;">${pnlSign}$${d.realizedPnl.toFixed(2)} (${pnlSign}${d.realizedPnlPct.toFixed(1)}%)</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">Days held</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;color:#f9fafb;font-variant-numeric:tabular-nums;">${d.daysHeld}d</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">Close reason</td>
          <td style="padding:6px 0;font-size:13px;text-align:right;color:#f9fafb;">${reasonLabel}</td>
        </tr>
      </table>
    </div>

    <p style="margin:0 0 16px;font-size:13px;color:#9ca3af;">
      ${
        isWin
          ? "The agent logged this as a WIN and will use it to refine future research."
          : isBreakeven
            ? "The agent closed this position near breakeven."
            : "The agent logged this as a LOSS. A post-trade evaluation will run shortly."
      }
    </p>

    <!-- Footer -->
    <p style="margin:0;font-size:12px;color:#6b7280;">
      This is an automated message from your Hindsight trading agent.
    </p>
  </div>
</body>
</html>`;
}
