import type { BibEntry } from "./bibtex";
import { getField } from "./bibtex";

export interface EntryMeta {
  title: string;
  author: string;
  year: string;
}

export function entryMeta(entry: BibEntry): EntryMeta {
  return {
    title: (getField(entry, "title") || "").replace(/[{}]/g, "").trim(),
    author: (getField(entry, "author") || "").trim(),
    year: (getField(entry, "year") || "").trim(),
  };
}

/** Surname of the first author, for compact search queries. */
export function firstAuthor(author: string): string {
  const first = author.split(/\s+and\s+/i)[0] || "";
  return (first.includes(",") ? first.split(",")[0] : first.split(/\s+/).pop() || "").trim();
}

export function searchQuery(entry: BibEntry): string {
  const { title, author, year } = entryMeta(entry);
  return [title && `"${title}"`, firstAuthor(author), year].filter(Boolean).join(" ");
}

export function searchUrls(entry: BibEntry): Record<string, string> {
  const q = encodeURIComponent(searchQuery(entry));
  const titleOnly = encodeURIComponent(entryMeta(entry).title);
  return {
    Google: `https://www.google.com/search?q=${q}`,
    Scholar: `https://scholar.google.com/scholar?q=${q}`,
    CrossRef: `https://search.crossref.org/?q=${q}&from_ui=yes`,
    OpenAlex: `https://openalex.org/works?search=${titleOnly}`,
  };
}

export function formatCitation(entry: BibEntry): string {
  const { title, author, year } = entryMeta(entry);
  return [author, year && `(${year})`, title].filter(Boolean).join(". ");
}
