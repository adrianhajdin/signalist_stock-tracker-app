// ── Resend Inbound Email Webhook ───────────────────────────────────────────
// Receives email.received webhooks from Resend, pulls the full body via
// resend.emails.receiving.get(), extracts structured signals with GPT-4o-mini,
// and writes them through the standard intelligence pipeline.
//
// BREAKING signals on held tickers fire an immediate agent run.

import { NextResponse } from "next/server";
import { Webhook } from "svix";
import { Resend } from "resend";
import { prisma } from "@/lib/prisma";
import { inngest } from "@/lib/inngest/client";
import {
  createSignal,
  createSignalBatch,
  completeSignalBatch,
} from "@/lib/intelligence/signals";
import { extractSignalsFromEmail } from "@/lib/intelligence/email-signal-extractor";
import { triggerUrgentRuns } from "@/lib/intelligence/urgent-trigger";
import type {
  SignalType,
  SonarSignalOutput,
} from "@/lib/intelligence/types";

type EmailReceivedWebhook = {
  type: string;
  data: {
    email_id: string;
    from: string;
    subject: string;
    created_at?: string;
    to?: string[];
  };
};

function parseSenderEmail(from: string): string {
  const match = from.match(/<([^>]+)>/);
  if (match) return match[1].trim().toLowerCase();
  return from.trim().toLowerCase();
}

function parseSenderName(from: string): string {
  const match = from.match(/^\s*"?([^"<]+?)"?\s*<[^>]+>\s*$/);
  if (match) return match[1].trim();
  return parseSenderEmail(from);
}

function inferSignalType(s: SonarSignalOutput): SignalType {
  const themes = s.themes.map((t) => t.toUpperCase());
  if (themes.some((t) => t.includes("EARNINGS"))) return "EARNINGS";
  if (themes.some((t) => t.includes("FILING") || t.includes("SEC"))) return "FILING";
  if (themes.some((t) => t.includes("OPTIONS"))) return "OPTIONS";
  if (themes.some((t) => t.includes("MACRO") || t.includes("FED") || t.includes("RATE"))) return "MACRO";
  if (themes.some((t) => t.includes("ANALYST"))) return "ANALYST_NOTE";
  return "NEWS";
}

async function findOrCreateEmailMonitor(
  senderEmail: string,
  senderName: string
) {
  // Prisma JSON-path equality is awkward across connectors; filter in JS
  // across the small EMAIL-monitor set instead.
  const all = await prisma.monitor.findMany({ where: { type: "EMAIL" } });
  const match = all.find((m) => {
    const cfg = m.config as { fromEmail?: string } | null;
    return cfg?.fromEmail?.toLowerCase() === senderEmail;
  });

  if (match) {
    await prisma.monitor.update({
      where: { id: match.id },
      data: { lastRunAt: new Date() },
    });
    return match;
  }

  return prisma.monitor.create({
    data: {
      type: "EMAIL",
      method: "auto",
      name: senderName || senderEmail,
      config: { fromEmail: senderEmail, name: senderName },
      scope: "FIRM",
      enabled: true,
      category: "MARKET",
      origin: "USER",
      lastRunAt: new Date(),
    },
  });
}

export async function POST(req: Request) {
  const secret = process.env.RESEND_WEBHOOK_SECRET;
  if (!secret) {
    console.error("[email-ingest] RESEND_WEBHOOK_SECRET not configured");
    return NextResponse.json(
      { error: "Webhook not configured" },
      { status: 500 }
    );
  }

  const payload = await req.text();
  const headers = {
    "svix-id": req.headers.get("svix-id") ?? "",
    "svix-timestamp": req.headers.get("svix-timestamp") ?? "",
    "svix-signature": req.headers.get("svix-signature") ?? "",
  };

  try {
    new Webhook(secret).verify(payload, headers);
  } catch {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const event = JSON.parse(payload) as EmailReceivedWebhook;
  if (event.type !== "email.received") {
    return NextResponse.json({ ok: true, skipped: "non-inbound-event" });
  }

  const { email_id, from, subject } = event.data;
  if (!email_id || !from) {
    return NextResponse.json({ ok: true, skipped: "missing-fields" });
  }

  const dup = await prisma.signal.findFirst({
    where: { emailMessageId: email_id },
    select: { id: true },
  });
  if (dup) {
    return NextResponse.json({ ok: true, skipped: "duplicate" });
  }

  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.error("[email-ingest] RESEND_API_KEY not configured");
    return NextResponse.json({ error: "Resend not configured" }, { status: 500 });
  }

  const resend = new Resend(apiKey);
  const fetched = await resend.emails.receiving.get(email_id);
  if (fetched.error || !fetched.data) {
    console.error("[email-ingest] Failed to fetch inbound email body:", fetched.error);
    return NextResponse.json(
      { error: "Could not fetch email body" },
      { status: 502 }
    );
  }

  const senderEmail = parseSenderEmail(from);
  const senderName = parseSenderName(from);

  const monitor = await findOrCreateEmailMonitor(senderEmail, senderName);

  const signals = await extractSignalsFromEmail({
    subject,
    fromName: senderName,
    html: fetched.data.html,
    text: fetched.data.text,
  });

  if (signals.length === 0) {
    return NextResponse.json({ ok: true, extracted: 0 });
  }

  const batchId = await createSignalBatch("EMAIL_INGEST");

  const signalIds: string[] = [];
  for (const s of signals) {
    try {
      const id = await createSignal({
        batchId,
        monitorId: monitor.id,
        type: inferSignalType(s),
        headline: s.headline,
        summary: s.summary,
        tickers: s.tickers,
        themes: s.themes,
        sectors: s.sectors,
        industries: s.industries ?? [],
        sentiment: s.sentiment,
        urgency: s.urgency,
        freshness: "TODAY",
        sourceQuality: 3,
        sourceUrls: s.sourceUrls,
        sourceNames: s.sourceNames,
        searchTool: "EMAIL_INGEST",
        searchQuery: senderEmail,
        searchContext: `Inbound email: ${subject}`,
        emailMessageId: email_id,
      });
      signalIds.push(id);
    } catch (err) {
      console.warn(
        `[email-ingest] Failed to persist signal "${s.headline}":`,
        err instanceof Error ? err.message : err
      );
    }
  }

  await completeSignalBatch(batchId);

  // Route inline so email signals appear on the dashboard immediately instead
  // of waiting for the 7:30 AM router cron. Fire-and-forget — if routing
  // fails, the morning cron will still pick these signals up.
  try {
    await inngest.send({ name: "intelligence/route-signals" });
  } catch (err) {
    console.error(
      "[email-ingest] failed to fire signal-router event:",
      err instanceof Error ? err.message : err
    );
  }

  const breakingTickers = [
    ...new Set(
      signals
        .filter((s) => s.urgency === "BREAKING")
        .flatMap((s) => s.tickers)
        .map((t) => t.toUpperCase().trim())
        .filter(Boolean)
    ),
  ];
  if (breakingTickers.length > 0) {
    try {
      await triggerUrgentRuns(breakingTickers);
    } catch (err) {
      console.error(
        "[email-ingest] triggerUrgentRuns failed:",
        err instanceof Error ? err.message : err
      );
    }
  }

  return NextResponse.json({
    ok: true,
    extracted: signalIds.length,
    batchId,
    signalIds,
  });
}
