export interface DoiResult {
  ok: boolean;
  bibtex?: string;
  source?: string;
  error?: string;
  doi?: string;
}

/** Ask the proxy backend for the canonical BibTeX of a DOI. */
export async function fetchBibtexForDoi(doi: string): Promise<DoiResult> {
  try {
    const res = await fetch(`/api/doi?doi=${encodeURIComponent(doi)}`);
    const data = (await res.json()) as DoiResult;
    return data;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}

/** Run async work over a list with a bounded number of concurrent tasks. */
export async function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  worker: (item: T, index: number) => Promise<void>
): Promise<void> {
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      await worker(items[index], index);
    }
  });
  await Promise.all(runners);
}
