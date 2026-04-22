/**
 * read_artifact — migrated to defineTool().
 *
 * Reads the full extracted content of an article or document behind a signal.
 */

import { z } from "zod";
import { defineTool } from "@/lib/agent/define-tool";
import { prisma } from "@/lib/prisma";
import type { ArtifactToolData } from "@/lib/agent/tool-types";

export const readArtifact = defineTool({
  description:
    "Read the full extracted content of an article or document behind a signal. Use when a signal's headline is interesting and you want the full text. Takes an artifactId from a signal's artifactId field.",
  schema: z.object({
    artifactId: z.string().describe("The artifact ID from a signal"),
  }),
  ui: "tool-ui" as const,

  progressLabel: () => "Reading the full article behind this signal",

  execute: async ({ artifactId }) => {
    const artifact = await prisma.artifact.findUnique({ where: { id: artifactId } });

    if (!artifact) {
      return {
        summary: `Artifact ${artifactId} not found.`,
        data: { title: "", url: "", publishedAt: null, contentSummary: null, contentMarkdown: null } as ArtifactToolData,
        sources: [],
      };
    }

    const title = artifact.title ?? "Untitled";
    const url = artifact.url ?? "";
    const content = artifact.contentMarkdown?.slice(0, 4000) ?? null;
    const wordCount = content ? content.split(/\s+/).length : 0;
    let domain = "";
    try { domain = url ? new URL(url).hostname.replace(/^www\./, "") : ""; } catch { /* */ }

    return {
      summary: `${domain ? `${domain}: ` : ""}${title}${wordCount > 0 ? ` (${wordCount.toLocaleString()} words)` : ""}.`,
      data: {
        title,
        url,
        publishedAt: artifact.publishedAt?.toISOString() ?? null,
        contentSummary: artifact.contentSummary,
        contentMarkdown: content,
      } as ArtifactToolData,
      sources: url
        ? [{ provider: domain || "Firecrawl", title, url, excerpt: artifact.contentSummary ?? "" }]
        : [],
    };
  },
});
