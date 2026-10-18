import { useEffect, useState } from "react";
import type { EntryState } from "../App";
import { entryMeta } from "../lib/search";
import { CandidateList } from "./CandidateList";
import { SearchLinks } from "./SearchLinks";

export function ResolveQueue({
  items,
  onResolve,
  onAccept,
  onSetDoi,
  onMarkNoDoi,
  onClose,
}: {
  items: EntryState[];
  onResolve: (id: string) => void;
  onAccept: (id: string, doi: string) => void;
  onSetDoi: (id: string, doi: string) => void;
  onMarkNoDoi: (id: string) => void;
  onClose: () => void;
}) {
  // Snapshot the queue order once (entries lacking a DOI), then read live state
  // for each id from the full list — so marked/resolved entries stay trackable.
  const [queueIds] = useState(() =>
    items.filter((e) => !e.doi && !e.markedNoDoi).map((e) => e.id)
  );
  const [idx, setIdx] = useState(0);
  const [manual, setManual] = useState("");

  const byId = new Map(items.map((e) => [e.id, e]));
  const currentId = queueIds[idx];
  const current = byId.get(currentId);
  const resolved = queueIds.filter((id) => {
    const e = byId.get(id);
    return e && (e.doi || e.markedNoDoi);
  }).length;

  // Lazily kick off a lookup the first time we land on an unresolved entry.
  useEffect(() => {
    if (current && !current.doi && !current.markedNoDoi && !current.candidates && !current.resolving) {
      onResolve(current.id);
    }
    setManual("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  const next = () => setIdx((i) => Math.min(i + 1, queueIds.length - 1));
  const prev = () => setIdx((i) => Math.max(i - 1, 0));
  const atEnd = idx >= queueIds.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div
        className="flex max-h-[85vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl dark:bg-slate-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
          <h2 className="font-semibold">Resolve missing DOIs</h2>
          <span className="text-sm text-slate-500">
            {queueIds.length === 0 ? "nothing to resolve" : `${idx + 1} of ${queueIds.length} · ${resolved} resolved`}
          </span>
          <button
            onClick={onClose}
            className="ml-auto rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            Done
          </button>
        </div>

        {queueIds.length > 0 && (
          <div className="h-1 w-full bg-slate-100 dark:bg-slate-800">
            <div
              className="h-1 bg-emerald-500 transition-all"
              style={{ width: `${(resolved / queueIds.length) * 100}%` }}
            />
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-4">
          {!current ? (
            <p className="py-10 text-center text-sm text-slate-500">Nothing left to resolve. 🎉</p>
          ) : (
            <CurrentEntry
              entry={current}
              manual={manual}
              setManual={setManual}
              onResolve={() => onResolve(current.id)}
              onAccept={(doi) => {
                onAccept(current.id, doi);
                if (!atEnd) next();
              }}
              onAddManual={(doi) => {
                onSetDoi(current.id, doi);
                if (!atEnd) next();
              }}
              onMark={() => {
                onMarkNoDoi(current.id);
                if (!atEnd) next();
              }}
            />
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          <button
            onClick={prev}
            disabled={idx === 0}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            ← Prev
          </button>
          <button
            onClick={next}
            disabled={atEnd}
            className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 disabled:opacity-40 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Skip →
          </button>
          <span className="ml-auto text-xs text-slate-500">
            Accept a match, add a DOI, or mark “no DOI” to advance.
          </span>
        </div>
      </div>
    </div>
  );
}

function CurrentEntry({
  entry,
  manual,
  setManual,
  onResolve,
  onAccept,
  onAddManual,
  onMark,
}: {
  entry: EntryState;
  manual: string;
  setManual: (v: string) => void;
  onResolve: () => void;
  onAccept: (doi: string) => void;
  onAddManual: (doi: string) => void;
  onMark: () => void;
}) {
  const meta = entryMeta(entry.original);
  const done = entry.doi || entry.markedNoDoi;

  return (
    <div className="space-y-3">
      <div>
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold">{entry.original.citationKey}</span>
          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase text-slate-500 dark:bg-slate-800">
            {entry.original.type}
          </span>
        </div>
        <p className="mt-1 text-sm font-medium">{meta.title || "(no title)"}</p>
        <p className="text-xs text-slate-500">{[meta.author, meta.year].filter(Boolean).join(" · ")}</p>
      </div>

      {done ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-300">
          {entry.doi ? `DOI set: ${entry.doi}` : "Marked as having no DOI."}
        </p>
      ) : (
        <>
          <CandidateList candidates={entry.candidates} resolving={entry.resolving} onAccept={onAccept} />

          {!entry.resolving && entry.candidates && entry.candidates.length === 0 && (
            <button
              onClick={onResolve}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Search again
            </button>
          )}

          <div className="flex gap-2">
            <input
              value={manual}
              onChange={(e) => setManual(e.target.value)}
              placeholder="…or paste a DOI"
              className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950"
            />
            <button
              onClick={() => onAddManual(manual)}
              disabled={!manual.trim()}
              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
            >
              Add
            </button>
            <button
              onClick={onMark}
              className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              No DOI
            </button>
          </div>

          <SearchLinks entry={entry.original} />
        </>
      )}
    </div>
  );
}
