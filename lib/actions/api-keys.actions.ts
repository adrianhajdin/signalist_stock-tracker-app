"use server";

import { prisma } from "@/lib/prisma";
import { createClient } from "@/lib/supabase/server";
import { encryptAndPack, unpackAndDecrypt } from "@/lib/crypto";
import { getAccount, type AlpacaCredentials } from "@/lib/alpaca";
import { revalidatePath } from "next/cache";

// ─── Auth helper ──────────────────────────────────────────────────────────────

async function getServerUserId(): Promise<string> {
  const supabase = await createClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) throw new Error("Not authenticated");
  return user.id;
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type ApiKeyStatus = {
  hasKey: boolean;
  provider: string;
  keyHint: string | null;
  verified: boolean;
  verifiedAt: string | null;
  paperMode: boolean;
  label: string | null;
};

export type SaveApiKeyInput = {
  provider: "ALPACA";
  apiKey: string;
  apiSecret: string;
  label?: string;
  paperMode?: boolean;
  baseUrl?: string;
};

// ─── Get API key status (no secrets returned) ─────────────────────────────────

export async function getApiKeyStatus(
  provider: string = "ALPACA"
): Promise<ApiKeyStatus> {
  const userId = await getServerUserId();
  const row = await prisma.userApiKey.findUnique({
    where: { userId_provider: { userId, provider } },
    select: {
      provider: true,
      keyHint: true,
      verified: true,
      verifiedAt: true,
      paperMode: true,
      label: true,
    },
  });

  if (!row) {
    return {
      hasKey: false,
      provider,
      keyHint: null,
      verified: false,
      verifiedAt: null,
      paperMode: true,
      label: null,
    };
  }

  return {
    hasKey: true,
    provider: row.provider,
    keyHint: row.keyHint,
    verified: row.verified,
    verifiedAt: row.verifiedAt?.toISOString() ?? null,
    paperMode: row.paperMode,
    label: row.label,
  };
}

// ─── Save (upsert) API key ───────────────────────────────────────────────────

export async function saveApiKey(
  input: SaveApiKeyInput
): Promise<{ success: boolean; verified: boolean; error?: string }> {
  try {
    const userId = await getServerUserId();

    // Encrypt the credentials
    const encryptedKey = encryptAndPack(input.apiKey);
    const encryptedSecret = encryptAndPack(input.apiSecret);
    const keyHint = `...${input.apiKey.slice(-4)}`;

    // Verify by calling getAccount with these credentials
    let verified = false;
    let verifiedAt: Date | null = null;
    const creds: AlpacaCredentials = {
      keyId: input.apiKey,
      secretKey: input.apiSecret,
      baseUrl: input.baseUrl,
    };

    try {
      await getAccount(creds);
      verified = true;
      verifiedAt = new Date();
    } catch (err) {
      // Keys saved but not verified — user can still save and fix later
      console.warn("[api-keys] Alpaca verification failed:", err instanceof Error ? err.message : err);
    }

    await prisma.userApiKey.upsert({
      where: { userId_provider: { userId, provider: input.provider } },
      create: {
        userId,
        provider: input.provider,
        label: input.label ?? null,
        encryptedKey,
        encryptedSecret,
        keyHint,
        paperMode: input.paperMode ?? true,
        baseUrl: input.baseUrl ?? null,
        verified,
        verifiedAt,
      },
      update: {
        label: input.label ?? null,
        encryptedKey,
        encryptedSecret,
        keyHint,
        paperMode: input.paperMode ?? true,
        baseUrl: input.baseUrl ?? null,
        verified,
        verifiedAt,
      },
    });

    revalidatePath("/settings");
    return { success: true, verified };
  } catch (err) {
    console.error("[api-keys] saveApiKey error:", err);
    return { success: false, verified: false, error: err instanceof Error ? err.message : "Failed to save API key" };
  }
}

// ─── Delete API key ──────────────────────────────────────────────────────────

export async function deleteApiKey(
  provider: string = "ALPACA"
): Promise<{ success: boolean; error?: string }> {
  try {
    const userId = await getServerUserId();
    await prisma.userApiKey.delete({
      where: { userId_provider: { userId, provider } },
    });
    revalidatePath("/settings");
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed to delete API key" };
  }
}

// ─── Re-verify existing key ──────────────────────────────────────────────────

export async function reverifyApiKey(
  provider: string = "ALPACA"
): Promise<{ success: boolean; verified: boolean; error?: string }> {
  try {
    const userId = await getServerUserId();
    const creds = await resolveAlpacaCredentials(userId);
    if (!creds) {
      return { success: false, verified: false, error: "No API key found" };
    }

    try {
      await getAccount(creds);
      await prisma.userApiKey.update({
        where: { userId_provider: { userId, provider } },
        data: { verified: true, verifiedAt: new Date() },
      });
      revalidatePath("/settings");
      return { success: true, verified: true };
    } catch {
      await prisma.userApiKey.update({
        where: { userId_provider: { userId, provider } },
        data: { verified: false },
      });
      revalidatePath("/settings");
      return { success: true, verified: false, error: "Alpaca rejected the credentials" };
    }
  } catch (err) {
    return { success: false, verified: false, error: err instanceof Error ? err.message : "Verification failed" };
  }
}

// ─── Resolve credentials for a user ──────────────────────────────────────────
// Used by agent routes and crons to get Alpaca creds.
// Returns null if no user key found (callers fall back to env vars).

export async function resolveAlpacaCredentials(
  userId: string
): Promise<AlpacaCredentials | null> {
  const row = await prisma.userApiKey.findUnique({
    where: { userId_provider: { userId, provider: "ALPACA" } },
    select: { encryptedKey: true, encryptedSecret: true, baseUrl: true },
  });

  if (!row) return null;

  try {
    return {
      keyId: unpackAndDecrypt(row.encryptedKey),
      secretKey: unpackAndDecrypt(row.encryptedSecret),
      baseUrl: row.baseUrl ?? undefined,
    };
  } catch (err) {
    console.error("[api-keys] Failed to decrypt credentials for user", userId, err);
    return null;
  }
}
