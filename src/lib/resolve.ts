export interface DoiCandidate {
  doi: string;
  title: string;
  authors: string;
  year: number | null;
  source: string;
  /** Title-similarity score, 0..1. */
  match: number;
  confident: boolean;
}

export interface ResolveResult {
  ok: boolean;
  candidates?: DoiCandidate[];
  error?: string;
}

/** Ask the backend to find candidate DOIs from a title/author/year. */
export async function resolveDoi(
  title: string,
  author: string,
  year: string
): Promise<ResolveResult> {
  const params = new URLSearchParams({ title });
  if (author) params.set("author", author);
  if (year) params.set("year", year);
  try {
    const res = await fetch(`/api/resolve?${params.toString()}`);
    return (await res.json()) as ResolveResult;
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Network error" };
  }
}
