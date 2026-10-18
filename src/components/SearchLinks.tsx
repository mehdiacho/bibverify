import { useState } from "react";
import type { BibEntry } from "../lib/bibtex";
import { searchUrls, formatCitation } from "../lib/search";

export function SearchLinks({ entry }: { entry: BibEntry }) {
  const [copied, setCopied] = useState(false);
  const urls = searchUrls(entry);

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-slate-500">Search:</span>
      {Object.entries(urls).map(([name, url]) => (
        <a
          key={name}
          href={url}
          target="_blank"
          rel="noreferrer noopener"
          className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {name}
        </a>
      ))}
      <button
        onClick={async () => {
          await navigator.clipboard.writeText(formatCitation(entry));
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        className="rounded border border-slate-300 px-2 py-0.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
      >
        {copied ? "Copied!" : "Copy citation"}
      </button>
    </div>
  );
}
