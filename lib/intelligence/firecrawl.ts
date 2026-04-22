// ── Firecrawl API Client ─────────────────────────────────────────────────────
// Extracts clean markdown content from web pages using the Firecrawl API.
// Used by intelligence jobs to fetch full article content for artifact storage.

const FIRECRAWL_BASE_URL = "https://api.firecrawl.dev/v1";
const CONCURRENCY_LIMIT = 3;

export interface ExtractedPage {
  url: string;
  title: string;
  markdown: string;
  publishedAt?: string;
  wordCount: number;
}

interface FirecrawlScrapeResponse {
  success: boolean;
  data?: {
    markdown?: string;
    metadata?: {
      title?: string;
      publishedTime?: string;
      ogTitle?: string;
      [key: string]: unknown;
    };
  };
  error?: string;
}

function getApiKey(): string {
  const key = process.env.FIRECRAWL_API_KEY;
  if (!key) {
    throw new Error("FIRECRAWL_API_KEY environment variable is not set");
  }
  return key;
}

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

/**
 * Extract clean markdown content from a single URL via Firecrawl.
 * Throws on network errors, auth failures, or missing data.
 */
export async function extractPage(url: string): Promise<ExtractedPage> {
  const apiKey = getApiKey();

  const response = await fetch(`${FIRECRAWL_BASE_URL}/scrape`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      url,
      formats: ["markdown"],
    }),
  });

  if (response.status === 429) {
    throw new Error(`Firecrawl rate limit hit for ${url}`);
  }

  if (!response.ok) {
    const body = await response.text().catch(() => "unknown");
    throw new Error(
      `Firecrawl scrape failed (${response.status}) for ${url}: ${body}`
    );
  }

  const result: FirecrawlScrapeResponse = await response.json();

  if (!result.success || !result.data?.markdown) {
    throw new Error(
      `Firecrawl returned no content for ${url}: ${result.error ?? "empty response"}`
    );
  }

  const markdown = result.data.markdown;
  const metadata = result.data.metadata ?? {};
  const title = metadata.title || metadata.ogTitle || url;

  return {
    url,
    title,
    markdown,
    publishedAt: metadata.publishedTime,
    wordCount: countWords(markdown),
  };
}

/**
 * Extract content from multiple URLs with a concurrency limit.
 * Skips individual failures (logs warnings) and returns successful extractions.
 */
export async function extractPages(urls: string[]): Promise<ExtractedPage[]> {
  const results: ExtractedPage[] = [];
  const queue = [...urls];

  async function worker() {
    while (queue.length > 0) {
      const url = queue.shift();
      if (!url) break;

      try {
        const page = await extractPage(url);
        results.push(page);
      } catch (error) {
        console.warn(
          `[firecrawl] Failed to extract ${url}:`,
          error instanceof Error ? error.message : error
        );
      }
    }
  }

  // Run workers up to concurrency limit
  const workers = Array.from(
    { length: Math.min(CONCURRENCY_LIMIT, urls.length) },
    () => worker()
  );
  await Promise.all(workers);

  return results;
}
