import type { BibEntry, BibField } from "./bibtex";
import { hasNonLatinScript } from "./latex";

export type FieldStatus = "added" | "changed" | "removed" | "same";

export interface FieldDiff {
  /** Display key (prefers the registry's casing). */
  key: string;
  status: FieldStatus;
  original?: string;
  fetched?: string;
}

function normalize(v: string): string {
  // Ignore protective braces, percent-escapes we emit, and whitespace so that
  // {{Title}} == Title and …8:4%3C194… == …8:4<194… for comparison.
  return v
    .replace(/\\([%&#_$])/g, "$1") // \& -> &, \_ -> _, \%3C -> %3C, …
    .replace(/%3c/gi, "<")
    .replace(/%3e/gi, ">")
    .replace(/[{}]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function looseEqual(a: string, b: string): boolean {
  return normalize(a).toLowerCase() === normalize(b).toLowerCase();
}

/**
 * Compare an original entry to the registry's version. Fields appear in the
 * registry's order, with any original-only fields appended at the end.
 */
export function diffEntries(original: BibEntry, fetched: BibEntry): FieldDiff[] {
  const result: FieldDiff[] = [];
  const seen = new Set<string>();
  const origMap = new Map<string, BibField>();
  for (const f of original.fields) origMap.set(f.key.toLowerCase(), f);

  for (const f of fetched.fields) {
    const lk = f.key.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    const orig = origMap.get(lk);
    if (!orig) {
      result.push({ key: f.key, status: "added", fetched: f.value });
    } else if (looseEqual(orig.value, f.value)) {
      result.push({ key: f.key, status: "same", original: orig.value, fetched: f.value });
    } else {
      result.push({ key: f.key, status: "changed", original: orig.value, fetched: f.value });
    }
  }

  for (const f of original.fields) {
    const lk = f.key.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    result.push({ key: f.key, status: "removed", original: f.value });
  }

  return result;
}

export interface DiffSummary {
  added: number;
  changed: number;
  removed: number;
  same: number;
}

export function summarize(diffs: FieldDiff[]): DiffSummary {
  const s: DiffSummary = { added: 0, changed: 0, removed: 0, same: 0 };
  for (const d of diffs) s[d.status]++;
  return s;
}

export type Choice = "original" | "fetched";

export interface MergeOptions {
  /** Default the title field to the user's own value rather than the registry's. */
  keepTitles?: boolean;
  /** Avoid importing non-Latin registry values that pdfLaTeX can't typeset. */
  latexSafe?: boolean;
}

/** Default side for a field: take the registry value for real changes/additions,
 *  but keep the user's own text where it's equivalent or user-only (preserving
 *  their formatting, e.g. protective {{…}} braces). */
export function defaultChoice(d: FieldDiff, opts?: MergeOptions): Choice {
  if (d.status === "removed" || d.status === "same") return "original";
  // The registry sometimes records names/journals in a non-Latin script
  // (e.g. Arabic). pdfLaTeX can't typeset those, so prefer the user's value.
  if (opts?.latexSafe && d.fetched && hasNonLatinScript(d.fetched) && !(d.original && hasNonLatinScript(d.original))) {
    return "original";
  }
  if (opts?.keepTitles && d.key.toLowerCase() === "title" && d.status === "changed") {
    return "original";
  }
  return "fetched";
}

/** Build the merged entry from a set of per-field choices. */
export function mergeEntry(
  original: BibEntry,
  diffs: FieldDiff[],
  choices: Record<string, Choice>,
  opts?: MergeOptions
): BibEntry {
  const fields: BibField[] = [];
  for (const d of diffs) {
    const lk = d.key.toLowerCase();
    const choice = choices[lk] ?? defaultChoice(d, opts);
    if (choice === "fetched") {
      if (d.fetched !== undefined) fields.push({ key: d.key, value: d.fetched });
    } else {
      if (d.original !== undefined) fields.push({ key: d.key, value: d.original });
    }
  }
  return {
    type: original.type,
    citationKey: original.citationKey,
    fields,
    raw: original.raw,
    start: original.start,
    end: original.end,
  };
}
