// Plain HTML email template for the weekly digest.
// Kept as a function so it can be unit-tested without a React renderer.

export interface DigestTrade {
  ticker: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  closePrice: number;
  realizedPnl: number;
  pnlPct: number;
  outcome: string;
  daysHeld: number;
}

export interface DigestOpenTrade {
  ticker: string;
  direction: "LONG" | "SHORT";
  entryPrice: number;
  currentPrice: number;
  unrealizedPnl: number;
  pnlPct: number;
}

export interface WeeklyDigestData {
  weekOf: string; // e.g. "Mar 3 – Mar 8, 2026"
  runsThisWeek: number;
  thesesGenerated: number;
  tradesPlaced: number;
  closedTrades: DigestTrade[];
  openTrades: DigestOpenTrade[];
  winRate: number | null; // 0–1
  totalRealizedPnl: number;
  agentInsight: string;
  noActivity: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function pnlColor(val: number) {
  return val >= 0 ? "#51b857" : "#ff6d87";
}

function fmt(n: number, decimals = 2) {
  const abs = Math.abs(n).toFixed(decimals);
  return n >= 0 ? `+$${abs}` : `-$${abs}`;
}

function fmtPct(n: number) {
  return `${n >= 0 ? "+" : ""}${n.toFixed(2)}%`;
}

function tradeRows(trades: DigestTrade[]) {
  if (trades.length === 0) return "<tr><td colspan='6' style='padding:12px;text-align:center;color:#6b7280;font-size:13px;'>No closed trades this week.</td></tr>";
  return trades
    .map(
      (t) => `
    <tr style="border-top:1px solid #1f2937;">
      <td style="padding:10px 12px;font-weight:600;color:#f9fafb;">${t.ticker}</td>
      <td style="padding:10px 12px;color:${t.direction === "LONG" ? "#60a5fa" : "#f59e0b"};">${t.direction}</td>
      <td style="padding:10px 12px;color:#9ca3af;font-variant-numeric:tabular-nums;">$${t.entryPrice.toFixed(2)}</td>
      <td style="padding:10px 12px;color:#9ca3af;font-variant-numeric:tabular-nums;">$${t.closePrice.toFixed(2)}</td>
      <td style="padding:10px 12px;color:${pnlColor(t.realizedPnl)};font-weight:600;font-variant-numeric:tabular-nums;">${fmtPct(t.pnlPct)}</td>
      <td style="padding:10px 12px;color:#9ca3af;">${t.daysHeld}d</td>
    </tr>`
    )
    .join("");
}

function openRows(trades: DigestOpenTrade[]) {
  if (trades.length === 0) return "<tr><td colspan='5' style='padding:12px;text-align:center;color:#6b7280;font-size:13px;'>No open positions.</td></tr>";
  return trades
    .map(
      (t) => `
    <tr style="border-top:1px solid #1f2937;">
      <td style="padding:10px 12px;font-weight:600;color:#f9fafb;">${t.ticker}</td>
      <td style="padding:10px 12px;color:${t.direction === "LONG" ? "#60a5fa" : "#f59e0b"};">${t.direction}</td>
      <td style="padding:10px 12px;color:#9ca3af;font-variant-numeric:tabular-nums;">$${t.entryPrice.toFixed(2)}</td>
      <td style="padding:10px 12px;color:#9ca3af;font-variant-numeric:tabular-nums;">$${t.currentPrice.toFixed(2)}</td>
      <td style="padding:10px 12px;color:${pnlColor(t.unrealizedPnl)};font-weight:600;font-variant-numeric:tabular-nums;">${fmtPct(t.pnlPct)}</td>
    </tr>`
    )
    .join("");
}

// ─── Template ─────────────────────────────────────────────────────────────────

export function buildWeeklyDigestHtml(d: WeeklyDigestData): string {
  const winRateStr =
    d.winRate != null ? `${(d.winRate * 100).toFixed(0)}%` : "—";

  const noActivityBody = `
    <p style="color:#9ca3af;font-size:15px;line-height:1.6;margin:0 0 24px;">
      No trading activity this week. The agent will run again Monday at 8 AM ET.
    </p>`;

  const activityBody = `
    <!-- Stats row -->
    <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;">
      <tr>
        ${[
          ["Research Runs", String(d.runsThisWeek)],
          ["Theses Generated", String(d.thesesGenerated)],
          ["Trades Placed", String(d.tradesPlaced)],
          ["Win Rate", winRateStr],
          ["Realized P&L", fmt(d.totalRealizedPnl)],
        ]
          .map(
            ([label, val]) => `
          <td style="padding:14px;background:#111827;border-radius:8px;text-align:center;width:20%;">
            <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;margin-bottom:6px;">${label}</div>
            <div style="font-size:18px;font-weight:700;color:${label === "Realized P&L" ? pnlColor(d.totalRealizedPnl) : "#f9fafb"};font-variant-numeric:tabular-nums;">${val}</div>
          </td>
          <td width="8"></td>`
          )
          .join("")}
      </tr>
    </table>

    <!-- Closed trades -->
    <h2 style="font-size:15px;font-weight:600;color:#f9fafb;margin:0 0 10px;">Closed Trades</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;background:#111827;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#1f2937;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Ticker</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Dir</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Entry</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Exit</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Return</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Held</th>
        </tr>
      </thead>
      <tbody>${tradeRows(d.closedTrades)}</tbody>
    </table>

    <!-- Open positions -->
    <h2 style="font-size:15px;font-weight:600;color:#f9fafb;margin:0 0 10px;">Open Positions</h2>
    <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;margin-bottom:28px;background:#111827;border-radius:8px;overflow:hidden;">
      <thead>
        <tr style="background:#1f2937;">
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Ticker</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Dir</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Entry</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Current</th>
          <th style="padding:10px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6b7280;font-weight:500;">Unrealized</th>
        </tr>
      </thead>
      <tbody>${openRows(d.openTrades)}</tbody>
    </table>

    <!-- Agent insight -->
    <div style="background:#111827;border-left:3px solid #6366f1;border-radius:0 8px 8px 0;padding:16px 20px;margin-bottom:28px;">
      <div style="font-size:11px;text-transform:uppercase;letter-spacing:.06em;color:#6366f1;font-weight:600;margin-bottom:8px;">Agent Insight</div>
      <p style="color:#d1d5db;font-size:14px;line-height:1.65;margin:0;">${d.agentInsight}</p>
    </div>`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Hindsight Weekly Digest</title>
</head>
<body style="margin:0;padding:0;background:#030712;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0">
    <tr>
      <td align="center" style="padding:40px 16px;">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;">

          <!-- Header -->
          <tr>
            <td style="padding-bottom:28px;">
              <div style="font-size:11px;text-transform:uppercase;letter-spacing:.1em;color:#6b7280;margin-bottom:6px;">Hindsight Agent</div>
              <h1 style="margin:0;font-size:22px;font-weight:700;color:#f9fafb;">Weekly Digest</h1>
              <div style="font-size:13px;color:#6b7280;margin-top:4px;">${d.weekOf}</div>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td>
              ${d.noActivity ? noActivityBody : activityBody}
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="padding-top:28px;border-top:1px solid #1f2937;">
              <p style="font-size:12px;color:#4b5563;margin:0;">
                The agent will run again Monday at 8 AM ET. &nbsp;·&nbsp;
                <a href="https://hindsight-stocks.vercel.app" style="color:#6366f1;text-decoration:none;">Open Hindsight</a>
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}
