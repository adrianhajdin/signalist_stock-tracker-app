// ── Email Signal Extractor ─────────────────────────────────────────────────
// GPT-4o-mini extraction of structured signals from inbound newsletter emails.
//
// Resend inbound notes (Step 1 verification):
//  - The email.received webhook delivers METADATA only (email_id, from,
//    subject, to, created_at). Body is NOT included.
//  - Bodies are fetched via the dedicated inbound endpoint:
//      resend.emails.receiving.get(email_id)
//    which returns { html, text, headers, attachments, ... }. Both html
//    and text may be null — always null-check.
//  - Equivalent REST call (fallback if SDK breaks):
//      GET https://api.resend.com/emails/receiving/{id}
//      Authorization: Bearer ${RESEND_API_KEY}
//
// This module doesn't fetch the body itself — the route passes in html/text.

import OpenAI from "openai";
import type { SonarSignalOutput } from "@/lib/intelligence/types";
import { SONAR_SIGNAL_SCHEMA } from "@/lib/intelligence/types";

const SYSTEM_PROMPT = `You are a financial signal extractor. Given a newsletter or financial email, extract every distinct investable idea as a separate signal.
Rules:
- One signal per distinct idea/ticker/theme. Don't combine unrelated ideas.
- Urgency: BREAKING = price-moving news happening now; HIGH = material development with near-term impact; MEDIUM = noteworthy but not urgent; LOW = background/educational.
- Tickers: only include real exchange-listed symbols you are confident about. Empty array if none.
- Themes: use consistent tags like M&A, EARNINGS_BEAT, FDA_APPROVAL, RATE_CUT, INSIDER_BUYING, etc.
- Sentiment: from the newsletter's perspective, not your own.
- sourceNames: use the newsletter/publication name, not "email".
- sourceUrls: include any article URLs linked in the email body.
- If the email is a promotional, unsubscribe notice, or has no investable content, return an empty signals array.`;

const MAX_CONTENT_CHARS = 8000;

function stripHtml(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function buildContent(input: {
  subject: string;
  fromName: string;
  html?: string | null;
  text?: string | null;
}): string {
  const body = input.text?.trim()
    ? input.text.trim()
    : input.html
      ? stripHtml(input.html)
      : "";
  const header = `From: ${input.fromName}\nSubject: ${input.subject}\n\n`;
  const combined = header + body;
  return combined.length > MAX_CONTENT_CHARS
    ? combined.slice(0, MAX_CONTENT_CHARS)
    : combined;
}

export async function extractSignalsFromEmail(input: {
  subject: string;
  fromName: string;
  html?: string | null;
  text?: string | null;
}): Promise<SonarSignalOutput[]> {
  const content = buildContent(input);
  if (!content.trim()) return [];

  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY ?? "" });

  const response = await client.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.1,
    messages: [
      { role: "system", content: SYSTEM_PROMPT },
      { role: "user", content },
    ],
    response_format: {
      type: "json_schema",
      json_schema: {
        name: "email_signal_extraction",
        schema: SONAR_SIGNAL_SCHEMA,
      },
    } as unknown as { type: "json_object" },
  });

  const raw = response.choices[0]?.message?.content;
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as { signals?: SonarSignalOutput[] };
    return parsed.signals ?? [];
  } catch {
    console.error(
      "[email-signal-extractor] Failed to parse response:",
      raw.slice(0, 200)
    );
    return [];
  }
}
