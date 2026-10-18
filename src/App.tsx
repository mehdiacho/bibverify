import { useMemo, useState } from "react";
import {
  parseBibtex,
  serializeBib,
  serializeEntry,
  extractDoi,
  cleanDoi,
  type BibEntry,
} from "./lib/bibtex";
import { diffEntries, mergeEntry, type Choice, type FieldDiff, type MergeOptions } from "./lib/diff";
import { fetchBibtexForDoi, mapWithConcurrency } from "./lib/api";
import { resolveDoi, type DoiCandidate } from "./lib/resolve";
import { entryMeta } from "./lib/search";
import { EntryCard } from "./components/EntryCard";
import { ResolveQueue } from "./components/ResolveQueue";
import { SAMPLE_BIB } from "./sample";

export type Status = "no-doi" | "ready" | "loading" | "verified" | "error";

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
  // Reverse-lookup state for entries without a DOI.
  candidates?: DoiCandidate[];
  resolving?: boolean;
  markedNoDoi?: boolean;
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

type Filter = "all" | "changed" | "no-doi" | "errors";

export interface ExportOptions extends MergeOptions {
  protectCaps: boolean;
}

export default function App() {
  const [raw, setRaw] = useState("");
  const [sourceText, setSourceText] = useState("");
  const [entries, setEntries] = useState<EntryState[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [filter, setFilter] = useState<Filter>("all");
  const [showQueue, setShowQueue] = useState(false);
  const [options, setOptions] = useState<ExportOptions>({ keepTitles: true, protectCaps: false, latexSafe: true });

  function handleParse(text: string) {
    setSourceText(text);
    setEntries(parseBibtex(text).map(toState));
  }

  function patch(id: string, updater: (e: EntryState) => EntryState) {
    setEntries((prev) => prev.map((e) => (e.id === id ? updater(e) : e)));
  }

  async function runVerify(id: string, doi: string) {
    patch(id, (e) => ({ ...e, status: "loading", error: undefined }));
    const result = await fetchBibtexForDoi(doi);
    if (!result.ok || !result.bibtex) {
      patch(id, (e) => ({ ...e, status: "error", error: result.error || "Lookup failed" }));
      // A "not found" almost always means a wrong DOI — immediately look up the
      // correct one by title so the error card can offer it.
      if (result.kind === "not-found") resolveEntry(id);
      return;
    }
    const fetched = parseBibtex(result.bibtex)[0];
    if (!fetched) {
      patch(id, (e) => ({ ...e, status: "error", error: "Could not parse registry response" }));
      return;
    }
    patch(id, (e) => ({
      ...e,
      status: "verified",
      fetched,
      diffs: diffEntries(e.original, fetched),
      source: result.source,
      candidates: undefined,
      expanded: true,
    }));
  }

  function verifyEntry(target: EntryState) {
    return target.doi ? runVerify(target.id, target.doi) : Promise.resolve();
  }

  async function verifyAll() {
    const todo = entries.filter((e) => e.doi && e.status !== "verified");
    if (todo.length === 0) return;
    setVerifying(true);
    setProgress({ done: 0, total: todo.length });
    let done = 0;
    await mapWithConcurrency(todo, 4, async (entry) => {
      await verifyEntry(entry);
      setProgress({ done: ++done, total: todo.length });
    });
    setVerifying(false);
  }

  // --- Missing-DOI resolution -------------------------------------------------

  async function resolveEntry(id: string) {
    const target = entries.find((e) => e.id === id);
    if (!target) return;
    const meta = entryMeta(target.original);
    if (!meta.title) {
      patch(id, (e) => ({ ...e, candidates: [] }));
      return;
    }
    patch(id, (e) => ({ ...e, resolving: true }));
    const r = await resolveDoi(meta.title, meta.author, meta.year);
    patch(id, (e) => ({ ...e, resolving: false, candidates: r.ok ? r.candidates ?? [] : [] }));
  }

  function setDoi(id: string, doi: string) {
    const clean = doi.trim() ? cleanDoi(doi) : "";
    patch(id, (e) => ({
      ...e,
      doi: clean || null,
      status: clean ? "ready" : "no-doi",
    }));
  }

  function acceptCandidate(id: string, doi: string) {
    patch(id, (e) => ({ ...e, doi, candidates: undefined, markedNoDoi: false }));
    runVerify(id, doi);
  }

  function markNoDoi(id: string, value: boolean) {
    patch(id, (e) => ({ ...e, markedNoDoi: value }));
  }

  async function autoFindMissing() {
    const todo = entries.filter(
      (e) => !e.doi && !e.markedNoDoi && !e.candidates && !e.resolving && entryMeta(e.original).title
    );
    if (todo.length === 0) return;
    await mapWithConcurrency(todo, 4, async (e) => resolveEntry(e.id));
  }

  async function acceptAllConfident() {
    const todo = entries.filter((e) => !e.doi && e.candidates?.[0]?.confident);
    await mapWithConcurrency(todo, 4, async (e) => {
      const doi = e.candidates![0].doi;
      patch(e.id, (s) => ({ ...s, doi, candidates: undefined, markedNoDoi: false }));
      await runVerify(e.id, doi);
    });
  }

  function applyBulk(text: string): number {
    const byKey = new Map(entries.map((e) => [e.original.citationKey.toLowerCase(), e.id]));
    let applied = 0;
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*(\S+)\s*[,;:=\t]+\s*(10\.\S+)\s*$/) || line.match(/^\s*(\S+)\s+(10\.\S+)\s*$/);
      if (!m) continue;
      const id = byKey.get(m[1].toLowerCase());
      if (!id) continue;
      const doi = cleanDoi(m[2]);
      patch(id, (e) => ({ ...e, doi, candidates: undefined, markedNoDoi: false }));
      runVerify(id, doi);
      applied++;
    }
    return applied;
  }

  // --- Choices / merge / export ----------------------------------------------

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

  const mergedOf = (e: EntryState): BibEntry =>
    e.status === "verified" && e.diffs ? mergeEntry(e.original, e.diffs, e.choices, options) : e.original;

  const serOpts = { protectTitleCaps: options.protectCaps, latexSafe: options.latexSafe };

  /** Will this entry's serialized output actually differ from the original?
   *  Compares both sides in the SAME serialized form, so formatting is ignored
   *  and only genuine value changes (that survive latex-safe encoding) count —
   *  keeping the "Changed" badge exactly in sync with what the download writes. */
  function entryChanged(e: EntryState): boolean {
    if (!(e.status === "verified" && e.diffs)) return false;
    const merged = mergeEntry(e.original, e.diffs, e.choices, options);
    return serializeEntry(merged, serOpts) !== serializeEntry(e.original, serOpts);
  }

  /** Serialized text for an entry. Rewritten with the merged result if changed.
   *  When LaTeX-safe is on we also re-serialize *unchanged* entries so their own
   *  special chars (underscores, &amp;, en-dashes, …) get fixed too — otherwise
   *  they'd pass through verbatim and break the build. */
  function entryText(e: EntryState): string {
    if (entryChanged(e)) return serializeEntry(mergedOf(e), serOpts);
    if (options.latexSafe) return serializeEntry(e.original, serOpts);
    return e.original.raw;
  }

  /**
   * Find-and-replace: keep the original file (header, comments, numbering,
   * ordering, spacing) and splice in only the entries that actually changed.
   */
  function buildFullOutput(): string {
    if (!sourceText) return serializeBib(entries.map(mergedOf), { protectTitleCaps: options.protectCaps, latexSafe: options.latexSafe });
    let out = sourceText;
    const repls = entries
      .filter((e) => entryChanged(e) || options.latexSafe)
      .map((e) => ({ start: e.original.start, end: e.original.end, text: entryText(e) }))
      .sort((a, b) => b.start - a.start); // splice from the end so offsets stay valid
    for (const r of repls) out = out.slice(0, r.start) + r.text + out.slice(r.end);
    return out;
  }

  /** A standalone subset (for filtered export): each entry rewritten-or-verbatim. */
  function buildSubsetOutput(list: EntryState[]): string {
    return list.map(entryText).join("\n\n") + "\n";
  }

  function download(content: string, filename: string) {
    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function copyAll() {
    await navigator.clipboard.writeText(buildFullOutput());
  }

  /** Paste an official BibTeX citation for an entry that has no DOI. */
  function applyCitation(id: string, text: string): boolean {
    const parsed = parseBibtex(text)[0];
    const target = entries.find((e) => e.id === id);
    if (!parsed || !target) return false;
    const diffs = diffEntries(target.original, parsed);
    patch(id, (e) => ({
      ...e,
      status: "verified",
      fetched: parsed,
      diffs,
      source: "pasted citation",
      candidates: undefined,
      markedNoDoi: false,
      expanded: true,
      doi: extractDoi(parsed) ?? e.doi,
    }));
    return true;
  }

  const stats = useMemo(() => {
    const s = { total: entries.length, withDoi: 0, noDoi: 0, verified: 0, changed: 0, errors: 0, confident: 0, marked: 0 };
    for (const e of entries) {
      if (e.doi) s.withDoi++;
      else if (e.markedNoDoi) s.marked++;
      else s.noDoi++;
      if (e.status === "verified") s.verified++;
      if (e.status === "error") s.errors++;
      // "Changed" = will actually be modified on export (respects your options),
      // not merely "the registry differs" — so the count matches the download.
      if (entryChanged(e)) s.changed++;
      if (!e.doi && !e.markedNoDoi && e.candidates?.[0]?.confident) s.confident++;
    }
    return s;
  }, [entries, options]);

  const visible = entries.filter((e) => {
    if (filter === "no-doi") return !e.doi;
    if (filter === "errors") return e.status === "error";
    if (filter === "changed") return entryChanged(e);
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
            except the DOIs and titles being looked up.
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
              options={options}
              setOptions={setOptions}
              onVerifyAll={verifyAll}
              onAutoFind={autoFindMissing}
              onAcceptConfident={acceptAllConfident}
              onOpenQueue={() => setShowQueue(true)}
              onDownloadAll={() => download(buildFullOutput(), "references.verified.bib")}
              onDownloadFiltered={() => download(buildSubsetOutput(visible), `references.${filter}.bib`)}
              onCopy={copyAll}
              onBulk={applyBulk}
              onReset={() => {
                setEntries([]);
                setRaw("");
                setSourceText("");
              }}
            />
            <div className="mt-4 space-y-3">
              {visible.map((e) => (
                <EntryCard
                  key={e.id}
                  state={e}
                  options={options}
                  willChange={entryChanged(e)}
                  onVerify={() => verifyEntry(e)}
                  onResolve={() => resolveEntry(e.id)}
                  onAccept={(doi) => acceptCandidate(e.id, doi)}
                  onSetDoi={(doi) => setDoi(e.id, doi)}
                  onMarkNoDoi={(v) => markNoDoi(e.id, v)}
                  onApplyCitation={(text) => applyCitation(e.id, text)}
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

      {showQueue && (
        <ResolveQueue
          items={entries}
          onResolve={resolveEntry}
          onAccept={acceptCandidate}
          onSetDoi={setDoi}
          onMarkNoDoi={(id) => markNoDoi(id, true)}
          onClose={() => setShowQueue(false)}
        />
      )}
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
  options,
  setOptions,
  onVerifyAll,
  onAutoFind,
  onAcceptConfident,
  onOpenQueue,
  onDownloadAll,
  onDownloadFiltered,
  onCopy,
  onBulk,
  onReset,
}: {
  stats: { total: number; withDoi: number; noDoi: number; verified: number; changed: number; errors: number; confident: number; marked: number };
  verifying: boolean;
  progress: { done: number; total: number };
  filter: Filter;
  setFilter: (f: Filter) => void;
  options: ExportOptions;
  setOptions: (updater: (o: ExportOptions) => ExportOptions) => void;
  onVerifyAll: () => void;
  onAutoFind: () => void;
  onAcceptConfident: () => void;
  onOpenQueue: () => void;
  onDownloadAll: () => void;
  onDownloadFiltered: () => void;
  onCopy: () => void;
  onBulk: (text: string) => number;
  onReset: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkMsg, setBulkMsg] = useState("");

  const filters: Array<[Filter, string, number]> = [
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
          {verifying ? `Verifying ${progress.done}/${progress.total}…` : `Verify all (${stats.withDoi})`}
        </button>

        {stats.noDoi > 0 && (
          <>
            <button
              onClick={onAutoFind}
              className="rounded-lg bg-violet-600 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-500"
            >
              Auto-find missing ({stats.noDoi})
            </button>
            <button
              onClick={onOpenQueue}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
            >
              Resolve queue
            </button>
          </>
        )}
        {stats.confident > 0 && (
          <button
            onClick={onAcceptConfident}
            className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500"
          >
            Accept {stats.confident} confident
          </button>
        )}

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            onClick={() => setShowBulk((v) => !v)}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            Paste DOIs
          </button>
          <button
            onClick={onDownloadAll}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Download .bib
          </button>
          <button
            onClick={async () => {
              await onCopy();
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
            className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            {copied ? "Copied!" : "Copy all"}
          </button>
          <button
            onClick={onReset}
            className="rounded-lg px-3 py-2 text-sm text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            Start over
          </button>
        </div>
      </div>

      {showBulk && (
        <div className="mt-3 rounded-lg border border-slate-200 p-2 dark:border-slate-700">
          <p className="mb-1 text-xs text-slate-500">
            One per line: <code>citationKey, 10.xxxx/yyyy</code> (comma, tab, or space separated).
          </p>
          <textarea
            value={bulkText}
            onChange={(e) => setBulkText(e.target.value)}
            spellCheck={false}
            rows={4}
            className="w-full resize-y rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950"
            placeholder={"knuth1984, 10.5555/12345\nsmith2020 10.1000/abcd"}
          />
          <div className="mt-1 flex items-center gap-2">
            <button
              onClick={() => {
                const n = onBulk(bulkText);
                setBulkMsg(`Applied ${n} DOI${n === 1 ? "" : "s"}.`);
                if (n > 0) setBulkText("");
              }}
              className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
            >
              Apply
            </button>
            {bulkMsg && <span className="text-xs text-slate-500">{bulkMsg}</span>}
          </div>
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-400">
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={!!options.keepTitles}
            onChange={(e) => setOptions((o) => ({ ...o, keepTitles: e.target.checked }))}
          />
          Keep my titles
        </label>
        <label className="flex cursor-pointer items-center gap-1.5">
          <input
            type="checkbox"
            checked={options.protectCaps}
            onChange={(e) => setOptions((o) => ({ ...o, protectCaps: e.target.checked }))}
          />
          Protect title caps <span className="text-slate-400">{`{{…}}`}</span>
        </label>
        <label className="flex cursor-pointer items-center gap-1.5" title="Convert Unicode & special characters to LaTeX escapes (pdfLaTeX/BibTeX compatible)">
          <input
            type="checkbox"
            checked={!!options.latexSafe}
            onChange={(e) => setOptions((o) => ({ ...o, latexSafe: e.target.checked }))}
          />
          LaTeX-safe output
        </label>
        <span className="text-slate-400">Original file layout &amp; citation keys are always preserved.</span>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1">
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
        {filter !== "all" && (
          <button
            onClick={onDownloadFiltered}
            className="rounded-full border border-slate-300 px-3 py-1 text-xs font-medium hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            ↓ Export these
          </button>
        )}
        <span className="ml-auto self-center text-xs text-slate-500">
          {stats.verified} verified{stats.marked ? ` · ${stats.marked} no-DOI` : ""}
        </span>
      </div>
    </div>
  );
}
