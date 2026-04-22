/**
 * migrate-universe-canonical.ts
 *
 * Session A backfill — rewrite every Signal and AgentConfig row's universe
 * arrays through the canonical normalizers so the DB holds exactly one
 * vocabulary going forward.
 *
 * Safe to run multiple times (idempotent). Reads every row, applies the
 * normalizers, writes back only if the normalized value differs from what's
 * stored, and prints a per-value report of unmatched inputs so the alias
 * table can be extended.
 *
 * Run with:
 *   npx tsx scripts/migrate-universe-canonical.ts            # dry run
 *   npx tsx scripts/migrate-universe-canonical.ts --apply    # write changes
 *
 * The migration is intentionally split from the merge — user runs it manually
 * after reviewing the dry-run output.
 */

import { prisma } from "@/lib/prisma";
import {
  normalizeSector,
  normalizeIndustry,
  normalizeTheme,
} from "@/lib/universe/canonical";

interface MigrationStats {
  signalsScanned: number;
  signalsUpdated: number;
  configsScanned: number;
  configsUpdated: number;
  unmappedSectors: Map<string, number>;
  unmappedIndustries: Map<string, number>;
  unmappedThemes: Map<string, number>;
}

function bump(map: Map<string, number>, key: string) {
  map.set(key, (map.get(key) ?? 0) + 1);
}

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * Normalize an array and also record every raw value the normalizer couldn't
 * map, so the operator can review them before re-running with more aliases.
 */
function normalizeWithAudit<T extends string>(
  raw: readonly string[],
  normalize: (v: string) => T | null,
  unmapped: Map<string, number>,
): T[] {
  const seen = new Set<T>();
  const out: T[] = [];
  for (const v of raw) {
    const canon = normalize(v);
    if (canon) {
      if (!seen.has(canon)) {
        seen.add(canon);
        out.push(canon);
      }
    } else if (v && v.trim()) {
      bump(unmapped, v.trim());
    }
  }
  return out;
}

/** Theme-specific version of normalizeWithAudit (theme normalizer returns string | null). */
function normalizeThemesWithAudit(
  raw: readonly string[],
  unmapped: Map<string, number>,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const v of raw) {
    const canon = normalizeTheme(v);
    if (canon) {
      if (!seen.has(canon)) {
        seen.add(canon);
        out.push(canon);
      }
    } else if (v && v.trim()) {
      bump(unmapped, v.trim());
    }
  }
  return out;
}

async function migrateSignals(apply: boolean, stats: MigrationStats) {
  console.log("\n── Signals ────────────────────────────────────────────────");
  const BATCH = 500;
  let cursor: string | undefined;
  while (true) {
    const rows = await prisma.signal.findMany({
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      orderBy: { id: "asc" },
      take: BATCH,
      select: { id: true, sectors: true, industries: true, themes: true },
    });
    if (rows.length === 0) break;

    for (const row of rows) {
      stats.signalsScanned++;
      const canonSectors = normalizeWithAudit(
        row.sectors,
        normalizeSector,
        stats.unmappedSectors,
      );
      const canonIndustries = normalizeWithAudit(
        row.industries,
        normalizeIndustry,
        stats.unmappedIndustries,
      );
      const canonThemes = normalizeThemesWithAudit(
        row.themes,
        stats.unmappedThemes,
      );

      const changed =
        !arraysEqual(row.sectors, canonSectors) ||
        !arraysEqual(row.industries, canonIndustries) ||
        !arraysEqual(row.themes, canonThemes);

      if (!changed) continue;
      stats.signalsUpdated++;
      if (apply) {
        await prisma.signal.update({
          where: { id: row.id },
          data: {
            sectors: canonSectors,
            industries: canonIndustries,
            themes: canonThemes,
          },
        });
      }
    }

    cursor = rows[rows.length - 1].id;
    process.stdout.write(
      `  scanned=${stats.signalsScanned} updated=${stats.signalsUpdated}\r`,
    );
  }
  console.log(
    `\n  signals scanned=${stats.signalsScanned} updated=${stats.signalsUpdated}`,
  );
}

async function migrateAgentConfigs(apply: boolean, stats: MigrationStats) {
  console.log("\n── AgentConfigs ──────────────────────────────────────────");
  const configs = await prisma.agentConfig.findMany({
    select: { id: true, sectors: true, industries: true, themes: true },
  });

  for (const c of configs) {
    stats.configsScanned++;
    const canonSectors = normalizeWithAudit(
      c.sectors,
      normalizeSector,
      stats.unmappedSectors,
    );
    const canonIndustries = normalizeWithAudit(
      c.industries,
      normalizeIndustry,
      stats.unmappedIndustries,
    );
    const canonThemes = normalizeThemesWithAudit(
      c.themes,
      stats.unmappedThemes,
    );

    const changed =
      !arraysEqual(c.sectors, canonSectors) ||
      !arraysEqual(c.industries, canonIndustries) ||
      !arraysEqual(c.themes, canonThemes);

    if (!changed) continue;
    stats.configsUpdated++;
    if (apply) {
      await prisma.agentConfig.update({
        where: { id: c.id },
        data: {
          sectors: canonSectors,
          industries: canonIndustries,
          themes: canonThemes,
        },
      });
    }
  }

  console.log(
    `  configs scanned=${stats.configsScanned} updated=${stats.configsUpdated}`,
  );
}

function reportUnmapped(label: string, map: Map<string, number>) {
  if (map.size === 0) {
    console.log(`  ${label}: all values mapped`);
    return;
  }
  const entries = [...map.entries()].sort((a, b) => b[1] - a[1]);
  console.log(`  ${label}: ${map.size} distinct unmapped value(s):`);
  for (const [raw, count] of entries) {
    console.log(`    ${count.toString().padStart(5)}  ${JSON.stringify(raw)}`);
  }
}

async function main() {
  const apply = process.argv.includes("--apply");
  console.log(
    apply
      ? "Universe canonicalization — APPLY MODE (writes will be made)"
      : "Universe canonicalization — DRY RUN (no writes; pass --apply to commit)",
  );

  const stats: MigrationStats = {
    signalsScanned: 0,
    signalsUpdated: 0,
    configsScanned: 0,
    configsUpdated: 0,
    unmappedSectors: new Map(),
    unmappedIndustries: new Map(),
    unmappedThemes: new Map(),
  };

  await migrateSignals(apply, stats);
  await migrateAgentConfigs(apply, stats);

  console.log("\n── Unmapped values (extend the alias table if real) ─────");
  reportUnmapped("sectors", stats.unmappedSectors);
  reportUnmapped("industries", stats.unmappedIndustries);
  reportUnmapped("themes (should be empty — themes always normalize)", stats.unmappedThemes);

  console.log("\n── Summary ───────────────────────────────────────────────");
  console.log(
    `  signals:    scanned=${stats.signalsScanned} updated=${stats.signalsUpdated}`,
  );
  console.log(
    `  configs:    scanned=${stats.configsScanned} updated=${stats.configsUpdated}`,
  );
  console.log(
    `  mode:       ${apply ? "APPLIED" : "DRY RUN — re-run with --apply"}`,
  );
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
