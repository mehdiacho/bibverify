import { useMemo, useState } from "react";
import {
  parseBibtex,
  serializeBib,
  extractDoi,
  type BibEntry,
} from "./lib/bibtex";
import { diffEntries, mergeEntry, type Choice, type FieldDiff } from "./lib/diff";
import { fetchBibtexForDoi, mapWithConcurrency } from "./lib/api";
import { EntryCard } from "./components/EntryCard";
import { SAMPLE_BIB } from "./sample";

export type Status =
  | "no-doi"
  | "ready"
  | "loading"
  | "verified"
  | "error";

export interface EntryState {
  id: string;
  original: BibEntry;
  doi: string | null;
  status: Status;
  fetched?: BibEntry;
  diffs?: FieldDiff[];
  source?: string;
  error?: string;
  choices: Record<string, Choice>;
  expanded: boolean;
}

let uid = 0;
const nextId = () => `e${uid++}`;

function toState(entry: BibEntry): EntryState {
  const doi = extractDoi(entry);
  return {
    id: nextId(),
    original: entry,
    doi,
    status: doi ? "ready" : "no-doi",
    choices: {},
    expanded: false,
  };
}

export default function App() {
  const [raw, setRaw] = useState("");
  const [entries, setEntries] = useState<EntryState[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [filter, setFilter] = useState<"all" | "changed" | "no-doi" | "errors">("all");

  function handleParse(text: string) {
    const parsed = parseBibtex(text);
    setEntries(parsed.map(toState));
  }

  function patch(id: string, updater: (e: EntryState) => EntryState) {
    setEntries((prev) => prev.map((e) => (e.id === id ? updater(e) : e)));
  }

  async function verifyEntry(target: EntryState) {
    if (!target.doi) return;
    patch(target.id, (e) => ({ ...e, status: "loading", error: undefined }));
    const result = await fetchBibtexForDoi(target.doi);
    if (!result.ok || !result.bibtex) {
      patch(target.id, (e) => ({ ...e, status: "error", error: result.error || "Lookup failed" }));
      return;
    }
    const fetched = parseBibtex(result.bibtex)[0];
    if (!fetched) {
      patch(target.id, (e) => ({ ...e, status: "error", error: "Could not parse registry response" }));
      return;
    }
    const diffs = diffEntries(target.original, fetched);
    patch(target.id, (e) => ({
      ...e,
      status: "verified",
      fetched,
      diffs,
      source: result.source,
      expanded: true,
    }));
  }

  async function verifyAll() {
    const todo = entries.filter((e) => e.doi && e.status !== "verified");
    if (todo.length === 0) return;
    setVerifying(true);
    setProgress({ done: 0, total: todo.length });
    let done = 0;
    await mapWithConcurrency(todo, 4, async (entry) => {
      await verifyEntry(entry);
      done += 1;
      setProgress({ done, total: todo.length });
    });
    setVerifying(false);
  }

  function setDoi(id: string, doi: string) {
    patch(id, (e) => ({
      ...e,
      doi: doi.trim() || null,
      status: doi.trim() ? "ready" : "no-doi",
    }));
  }

  function setChoice(id: string, lowerKey: string, choice: Choice) {
    patch(id, (e) => ({ ...e, choices: { ...e.choices, [lowerKey]: choice } }));
  }

  function setAllChoices(id: string, choice: Choice | "reset") {
    patch(id, (e) => {
      if (!e.diffs) return e;
      if (choice === "reset") return { ...e, choices: {} };
      const next: Record<string, Choice> = {};
      for (const d of e.diffs) next[d.key.toLowerCase()] = choice;
      return { ...e, choices: next };
    });
  }

  function toggleExpanded(id: string) {
    patch(id, (e) => ({ ...e, expanded: !e.expanded }));
  }

  const merged = useMemo(
    () =>
      entries.map((e) =>
        e.status === "verified" && e.diffs
          ? mergeEntry(e.original, e.diffs, e.choices)
          : e.original
      ),
    [entries]
  );

  function download() {
    const blob = new Blob([serializeBib(merged)], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "references.verified.bib";
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyAll() {
    await navigator.clipboard.writeText(serializeBib(merged));
  }

  const stats = useMemo(() => {
    const s = { total: entries.length, withDoi: 0, noDoi: 0, verified: 0, changed: 0, errors: 0 };
    for (const e of entries) {
      if (e.doi) s.withDoi++;
      else s.noDoi++;
      if (e.status === "verified") s.verified++;
      if (e.status === "error") s.errors++;
      if (e.diffs && e.diffs.some((d) => d.status === "changed" || d.status === "added")) s.changed++;
    }
    return s;
  }, [entries]);

  const visible = entries.filter((e) => {
    if (filter === "no-doi") return !e.doi;
    if (filter === "errors") return e.status === "error";
    if (filter === "changed")
      return e.diffs?.some((d) => d.status === "changed" || d.status === "added");
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-5xl px-4 py-8">
        <header className="mb-6">
          <h1 className="text-2xl font-bold tracking-tight">
            Bib<span className="text-indigo-600 dark:text-indigo-400">Verify</span>
          </h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Paste a <code className="rounded bg-slate-200 px-1 dark:bg-slate-800">.bib</code> file
            and check every entry against the official DOI registry. Nothing leaves your browser
            except the DOIs being looked up.
          </p>
        </header>

        {entries.length === 0 ? (
          <InputPanel raw={raw} setRaw={setRaw} onParse={handleParse} />
        ) : (
          <>
            <Toolbar
              stats={stats}
              verifying={verifying}
              progress={progress}
              filter={filter}
              setFilter={setFilter}
              onVerifyAll={verifyAll}
              onDownload={download}
              onCopy={copyAll}
              onReset={() => {
                setEntries([]);
                setRaw("");
              }}
            />
            <div className="mt-4 space-y-3">
              {visible.map((e) => (
                <EntryCard
                  key={e.id}
                  state={e}
                  onVerify={() => verifyEntry(e)}
                  onSetDoi={(doi) => setDoi(e.id, doi)}
                  onSetChoice={(k, c) => setChoice(e.id, k, c)}
                  onSetAll={(c) => setAllChoices(e.id, c)}
                  onToggle={() => toggleExpanded(e.id)}
                />
              ))}
              {visible.length === 0 && (
                <p className="py-10 text-center text-sm text-slate-500">
                  No entries match this filter.
                </p>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function InputPanel({
  raw,
  setRaw,
  onParse,
}: {
  raw: string;
  setRaw: (v: string) => void;
  onParse: (text: string) => void;
}) {
  const [dragging, setDragging] = useState(false);

  async function onFile(file: File) {
    const text = await file.text();
    setRaw(text);
    onParse(text);
  }

  return (
    <div
      className={`rounded-xl border-2 border-dashed bg-white p-4 shadow-sm transition dark:bg-slate-900 ${
        dragging ? "border-indigo-500 bg-indigo-50 dark:bg-indigo-950/30" : "border-slate-300 dark:border-slate-700"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFile(file);
      }}
    >
      <textarea
        value={raw}
        onChange={(e) => setRaw(e.target.value)}
        placeholder="Paste your BibTeX here, drop a .bib file, or load the sample…"
        spellCheck={false}
        className="h-72 w-full resize-y rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-xs outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950"
      />
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button
          onClick={() => onParse(raw)}
          disabled={!raw.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Parse entries
        </button>
        <label className="cursor-pointer rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800">
          Upload .bib
          <input
            type="file"
            accept=".bib,.txt,text/plain"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onFile(f);
            }}
          />
        </label>
        <button
          onClick={() => {
            setRaw(SAMPLE_BIB);
            onParse(SAMPLE_BIB);
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Load sample
        </button>
      </div>
    </div>
  );
}

function Toolbar({
  stats,
  verifying,
  progress,
  filter,
  setFilter,
  onVerifyAll,
  onDownload,
  onCopy,
  onReset,
}: {
  stats: { total: number; withDoi: number; noDoi: number; verified: number; changed: number; errors: number };
  verifying: boolean;
  progress: { done: number; total: number };
  filter: "all" | "changed" | "no-doi" | "errors";
  setFilter: (f: "all" | "changed" | "no-doi" | "errors") => void;
  onVerifyAll: () => void;
  onDownload: () => void;
  onCopy: () => void;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const filters: Array<[typeof filter, string, number]> = [
    ["all", "All", stats.total],
    ["changed", "Changed", stats.changed],
    ["no-doi", "No DOI", stats.noDoi],
    ["errors", "Errors", stats.errors],
  ];

  return (
    <div className="sticky top-0 z-10 rounded-xl border border-slate-200 bg-white/90 p-3 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/90">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onVerifyAll}
          disabled={verifying || stats.withDoi === 0}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          {verifying
            ? `Verifying ${progress.done}/${progress.total}…`
            : `Verify all (${stats.withDoi})`}
        </button>
        <button
          onClick={onDownload}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Download .bib
        </button>
        <button
          onClick={async () => {
            await onCopy();
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          {copied ? "Copied!" : "Copy all"}
        </button>
        <button
          onClick={onReset}
          className="ml-auto rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
        >
          Start over
        </button>
      </div>

      <div className="mt-3 flex flex-wrap gap-1">
        {filters.map(([key, label, count]) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-full px-3 py-1 text-xs font-medium transition ${
              filter === key
                ? "bg-indigo-600 text-white"
                : "bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
            }`}
          >
            {label} <span className="opacity-60">{count}</span>
          </button>
        ))}
        <span className="ml-auto self-center text-xs text-slate-500">
          {stats.verified} verified
        </span>
      </div>
    </div>
  );
}
