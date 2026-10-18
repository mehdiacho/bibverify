import type { DoiCandidate } from "../lib/resolve";

export function CandidateList({
  candidates,
  resolving,
  onAccept,
}: {
  candidates: DoiCandidate[] | undefined;
  resolving: boolean | undefined;
  onAccept: (doi: string) => void;
}) {
  if (resolving) {
    return <p className="text-sm text-slate-500">Searching CrossRef &amp; OpenAlex…</p>;
  }
  if (!candidates) return null;
  if (candidates.length === 0) {
    return (
      <p className="text-sm text-slate-500">
        No matches found. Try an external search below, or paste the DOI manually.
      </p>
    );
  }
  return (
    <ul className="space-y-1.5">
      {candidates.map((c) => (
        <li
          key={c.doi}
          className="flex items-start gap-2 rounded-lg border border-slate-200 p-2 dark:border-slate-700"
        >
          <ConfidenceBadge match={c.match} confident={c.confident} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium break-words">{c.title || "(untitled)"}</p>
            <p className="text-xs text-slate-500 break-words">
              {[c.authors, c.year].filter(Boolean).join(" · ")}
            </p>
            <p className="text-[11px] text-slate-400 break-words">
              {c.source} · <code>{c.doi}</code>
            </p>
          </div>
          <button
            onClick={() => onAccept(c.doi)}
            className="shrink-0 rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
          >
            Use
          </button>
        </li>
      ))}
    </ul>
  );
}

function ConfidenceBadge({ match, confident }: { match: number; confident: boolean }) {
  const pct = Math.round(match * 100);
  const color = confident
    ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
    : match >= 0.6
    ? "bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300"
    : "bg-slate-100 text-slate-500 dark:bg-slate-800";
  return (
    <span
      className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold tabular-nums ${color}`}
      title={confident ? "High-confidence title match" : "Review before accepting"}
    >
      {pct}%
    </span>
  );
}
