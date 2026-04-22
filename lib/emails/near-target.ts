// ─── Near Target email template ───────────────────────────────────────────────

export interface NearTargetData {
  ticker: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  targetPrice: number;
  progressPct: number; // 0–100 e.g. 85 means 85% of the way to target
  unrealizedPnl: number;
  unrealizedPnlPct: number;
  tradeId: string;
}

export function nearTargetHtml(d: NearTargetData): string {
  const pnlSign = d.unrealizedPnl >= 0 ? "+" : "";
  const progressBar = Math.round(d.progressPct);

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f9fafb;">
  <div style="max-width:560px;margin:32px auto;padding:0 16px;">

    <!-- Header -->
    <div style="margin-bottom:24px;">
      <p style="margin:0;font-size:12px;font-weight:500;letter-spacing:0.05em;text-transform:uppercase;color:#6b7280;">Hindsight Agent</p>
      <h1 style="margin:8px 0 0;font-size:22px;font-weight:600;color:#f9fafb;">
        🎯 ${d.ticker} is ${progressBar}% to target
      </h1>
    </div>

    <!-- Stats card -->
    <div style="background:#111827;border:1px solid #1f2937;border-radius:8px;padding:20px;margin-bottom:16px;">
      <table style="width:100%;border-collapse:collapse;">
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">Entry</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;color:#f9fafb;font-variant-numeric:tabular-nums;">$${d.entryPrice.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">Current</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;color:#f9fafb;font-variant-numeric:tabular-nums;">$${d.currentPrice.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">Target</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;color:#51b857;font-variant-numeric:tabular-nums;">$${d.targetPrice.toFixed(2)}</td>
        </tr>
        <tr>
          <td style="padding:6px 0;font-size:13px;color:#6b7280;">Unrealized P&amp;L</td>
          <td style="padding:6px 0;font-size:13px;font-weight:600;text-align:right;color:#51b857;font-variant-numeric:tabular-nums;">${pnlSign}$${d.unrealizedPnl.toFixed(2)} (${pnlSign}${d.unrealizedPnlPct.toFixed(1)}%)</td>
        </tr>
      </table>

      <!-- Progress bar -->
      <div style="margin-top:16px;">
        <div style="display:flex;justify-content:space-between;margin-bottom:6px;">
          <span style="font-size:12px;color:#6b7280;">Progress to target</span>
          <span style="font-size:12px;font-weight:600;color:#51b857;">${progressBar}%</span>
        </div>
        <div style="background:#1f2937;border-radius:4px;height:6px;overflow:hidden;">
          <div style="background:#51b857;height:100%;width:${Math.min(progressBar, 100)}%;border-radius:4px;"></div>
        </div>
      </div>
    </div>

    <p style="margin:0 0 16px;font-size:13px;color:#9ca3af;">
      The agent is monitoring this position closely. It will auto-close when the target is reached.
    </p>

    <!-- Footer -->
    <p style="margin:0;font-size:12px;color:#6b7280;">
      This is an automated message from your Hindsight trading agent.
    </p>
  </div>
</body>
</html>`;
}
