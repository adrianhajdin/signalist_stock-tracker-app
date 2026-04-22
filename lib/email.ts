import { Resend } from "resend";

const FROM = "Hindsight Agent <agent@hindsight-stocks.vercel.app>";

// ─── Send helper (fire-and-forget safe) ──────────────────────────────────────

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string;
  subject: string;
  html: string;
}): Promise<void> {
  try {
    const resend = new Resend(process.env.RESEND_API_KEY ?? "");
    await resend.emails.send({ from: FROM, to, subject, html });
  } catch {
    // Email delivery is best-effort — never crash trade actions
  }
}

// ─── Get a user's auth email via Supabase admin ───────────────────────────────

export async function getUserEmail(userId: string): Promise<string | null> {
  try {
    const { createClient } = await import("@supabase/supabase-js");
    const admin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );
    const { data } = await admin.auth.admin.getUserById(userId);
    return data.user?.email ?? null;
  } catch {
    return null;
  }
}
