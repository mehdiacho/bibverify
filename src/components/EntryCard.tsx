import { useState } from "react";
import type { EntryState, ExportOptions } from "../App";
import { defaultChoice, summarize, type Choice, type FieldDiff } from "../lib/diff";
import { entryMeta } from "../lib/search";
import { CandidateList } from "./CandidateList";
import { SearchLinks } from "./SearchLinks";

export function EntryCard({
  state,
  options,
  willChange,
  onVerify,
  onResolve,
  onAccept,
  onSetDoi,
  onMarkNoDoi,
  onApplyCitation,
  onSetChoice,
  onSetAll,
  onToggle,
}: {
  state: EntryState;
  options: ExportOptions;
  willChange: boolean;
  onVerify: () => void;
  onResolve: () => void;
  onAccept: (doi: string) => void;
  onSetDoi: (doi: string) => void;
  onMarkNoDoi: (value: boolean) => void;
  onApplyCitation: (text: string) => boolean;
  onSetChoice: (lowerKey: string, choice: Choice) => void;
  onSetAll: (choice: Choice | "reset") => void;
  onToggle: () => void;
}) {
  const { original, status, diffs } = state;
  const summary = diffs ? summarize(diffs) : null;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button onClick={onToggle} className="flex w-full items-center gap-3 px-4 py-3 text-left">
        <StatusDot status={status} hasChanges={willChange} marked={state.markedNoDoi} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-mono text-sm font-semibold">
              {original.citationKey || "(no key)"}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800">
              {original.type}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500">{fieldPreview(original.fields)}</p>
        </div>
        <StatusLabel state={state} summary={summary} willChange={willChange} />
      </button>

      {state.expanded && (
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          {status === "no-doi" && (
            <MissingDoiPanel
              state={state}
              onResolve={onResolve}
              onAccept={onAccept}
              onSetDoi={onSetDoi}
              onMarkNoDoi={onMarkNoDoi}
              onApplyCitation={onApplyCitation}
            />
          )}

          {status === "ready" && state.doi && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-slate-500">DOI:</span>
              <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">
                {state.doi}
              </code>
              <button
                onClick={onVerify}
                className="ml-auto rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500"
              >
                Verify
              </button>
            </div>
          )}

          {status === "loading" && <p className="text-sm text-slate-500">Looking up {state.doi}…</p>}

          {status === "error" && (
            <div className="space-y-2 text-sm">
              <FullMeta entry={original} />
              <p className="rounded-lg bg-amber-50 px-3 py-2 text-amber-700 dark:bg-amber-950/30 dark:text-amber-300">
                {state.error}
              </p>
              <div className="flex items-center gap-2">
                <span className="text-xs text-slate-500">DOI tried:</span>
                <code className="rounded bg-slate-100 px-1.5 py-0.5 text-xs dark:bg-slate-800">{state.doi}</code>
                <button
                  onClick={onResolve}
                  disabled={state.resolving}
                  className="ml-auto rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
                >
                  {state.resolving ? "Searching…" : "Find correct DOI"}
                </button>
              </div>
              <CandidateList candidates={state.candidates} resolving={state.resolving} onAccept={onAccept} />
              <EditableDoi current={state.doi ?? ""} onSetDoi={onSetDoi} onRetry={onVerify} />
              <SearchLinks entry={original} />
            </div>
          )}

          {status === "verified" && diffs && (
            <DiffTable
              diffs={diffs}
              choices={state.choices}
              source={state.source}
              options={options}
              onSetChoice={onSetChoice}
              onSetAll={onSetAll}
            />
          )}
        </div>
      )}
    </div>
  );
}

function MissingDoiPanel({
  state,
  onResolve,
  onAccept,
  onSetDoi,
  onMarkNoDoi,
  onApplyCitation,
}: {
  state: EntryState;
  onResolve: () => void;
  onAccept: (doi: string) => void;
  onSetDoi: (doi: string) => void;
  onMarkNoDoi: (value: boolean) => void;
  onApplyCitation: (text: string) => boolean;
}) {
  const [val, setVal] = useState("");

  if (state.markedNoDoi) {
    return (
      <div className="space-y-3">
        <FullMeta entry={state.original} />
        <div className="flex items-center gap-2 text-sm">
          <span className="text-slate-500">Marked as having no DOI — excluded from lookups.</span>
          <button
            onClick={() => onMarkNoDoi(false)}
            className="ml-auto rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Undo
          </button>
        </div>
        <CitationPaste onApplyCitation={onApplyCitation} />
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <FullMeta entry={state.original} />
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={onResolve}
          disabled={state.resolving}
          className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-violet-500 disabled:opacity-50"
        >
          {state.resolving ? "Searching…" : "Find DOI"}
        </button>
        <button
          onClick={() => onMarkNoDoi(true)}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          No DOI exists
        </button>
      </div>

      <CandidateList candidates={state.candidates} resolving={state.resolving} onAccept={onAccept} />

      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="…or paste a DOI: 10.xxxx/xxxxx"
          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950"
        />
        <button
          onClick={() => onSetDoi(val)}
          disabled={!val.trim()}
          className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Add DOI
        </button>
      </div>

      <CitationPaste onApplyCitation={onApplyCitation} />
      <SearchLinks entry={state.original} />
    </div>
  );
}

/** Paste an official BibTeX citation for an entry with no DOI. */
function CitationPaste({ onApplyCitation }: { onApplyCitation: (text: string) => boolean }) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [err, setErr] = useState("");

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="text-xs font-medium text-indigo-600 hover:underline dark:text-indigo-400"
      >
        Paste a citation (BibTeX) instead →
      </button>
    );
  }
  return (
    <div className="rounded-lg border border-slate-200 p-2 dark:border-slate-700">
      <p className="mb-1 text-xs text-slate-500">
        Paste the BibTeX from the publisher / source. It’s parsed and merged in standard field order.
      </p>
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        spellCheck={false}
        rows={5}
        placeholder={"@article{key,\n  title = {…},\n  author = {…},\n  ...\n}"}
        className="w-full resize-y rounded border border-slate-200 bg-slate-50 p-2 font-mono text-xs outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950"
      />
      <div className="mt-1 flex items-center gap-2">
        <button
          onClick={() => {
            const ok = onApplyCitation(text);
            if (!ok) setErr("Couldn’t parse a BibTeX entry from that text.");
            else setErr("");
          }}
          disabled={!text.trim()}
          className="rounded bg-indigo-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-indigo-500 disabled:opacity-40"
        >
          Use citation
        </button>
        <button onClick={() => setOpen(false)} className="text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200">
          Cancel
        </button>
        {err && <span className="text-xs text-red-500">{err}</span>}
      </div>
    </div>
  );
}

/** Full, wrapping title/author/year — so long names can be compared in full. */
function FullMeta({ entry }: { entry: EntryState["original"] }) {
  const m = entryMeta(entry);
  return (
    <div className="rounded-lg bg-slate-50 p-2.5 dark:bg-slate-800/40">
      <p className="text-sm font-medium break-words">{m.title || "(no title)"}</p>
      {m.author && <p className="mt-0.5 text-xs text-slate-500 break-words">{m.author}</p>}
      {m.year && <p className="mt-0.5 text-[11px] text-slate-400">{m.year}</p>}
    </div>
  );
}

function fieldPreview(fields: { key: string; value: string }[]): string {
  const get = (k: string) => fields.find((f) => f.key.toLowerCase() === k)?.value;
  return [get("author"), get("year"), get("title")].filter(Boolean).join(" · ") || "—";
}

function StatusDot({
  status,
  hasChanges,
  marked,
}: {
  status: string;
  hasChanges: boolean;
  marked?: boolean;
}) {
  const color =
    status === "verified"
      ? hasChanges
        ? "bg-amber-500"
        : "bg-emerald-500"
      : status === "error"
      ? "bg-red-500"
      : status === "no-doi"
      ? marked
        ? "bg-slate-300"
        : "bg-slate-400"
      : status === "loading"
      ? "bg-indigo-500 animate-pulse"
      : "bg-indigo-400";
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}

function StatusLabel({
  state,
  summary,
  willChange,
}: {
  state: EntryState;
  summary: ReturnType<typeof summarize> | null;
  willChange: boolean;
}) {
  if (state.status === "verified" && summary) {
    if (!willChange)
      return (
        <span className="text-xs font-medium text-emerald-600">
          {summary.added + summary.changed === 0 ? "Matches registry" : "Kept your version"}
        </span>
      );
    return (
      <span className="text-xs font-medium text-amber-600">
        {summary.changed} changed · {summary.added} added
      </span>
    );
  }
  if (state.status === "no-doi")
    return (
      <span className="text-xs font-medium text-slate-400">
        {state.markedNoDoi ? "No DOI (marked)" : state.candidates?.[0]?.confident ? "Match found" : "No DOI"}
      </span>
    );
  if (state.status === "error") return <span className="text-xs font-medium text-red-500">Error</span>;
  if (state.status === "loading") return <span className="text-xs font-medium text-indigo-500">Loading…</span>;
  return <span className="text-xs font-medium text-indigo-400">Ready</span>;
}

function EditableDoi({
  current,
  onSetDoi,
  onRetry,
}: {
  current: string;
  onSetDoi: (doi: string) => void;
  onRetry: () => void;
}) {
  const [val, setVal] = useState(current);
  return (
    <div className="flex gap-2">
      <input
        value={val}
        onChange={(e) => setVal(e.target.value)}
        className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm outline-none focus:border-indigo-400 dark:border-slate-700 dark:bg-slate-950"
      />
      <button
        onClick={() => {
          onSetDoi(val);
          onRetry();
        }}
        className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-semibold text-white hover:bg-indigo-500"
      >
        Retry
      </button>
    </div>
  );
}

function DiffTable({
  diffs,
  choices,
  source,
  options,
  onSetChoice,
  onSetAll,
}: {
  diffs: FieldDiff[];
  choices: Record<string, Choice>;
  source?: string;
  options: ExportOptions;
  onSetChoice: (lowerKey: string, choice: Choice) => void;
  onSetAll: (choice: Choice | "reset") => void;
}) {
  return (
    <div>
      <div className="mb-2 flex items-center gap-2">
        <span className="text-xs text-slate-500">
          Source: <span className="font-medium">{source}</span>
        </span>
        <div className="ml-auto flex gap-1">
          <button
            onClick={() => onSetAll("fetched")}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Accept all
          </button>
          <button
            onClick={() => onSetAll("original")}
            className="rounded border border-slate-300 px-2 py-1 text-xs hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
          >
            Keep mine
          </button>
          <button
            onClick={() => onSetAll("reset")}
            className="rounded px-2 py-1 text-xs text-slate-500 hover:text-slate-800 dark:hover:text-slate-200"
          >
            Reset
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-slate-200 dark:border-slate-800">
        <table className="w-full table-fixed text-xs">
          <thead className="bg-slate-50 text-left text-slate-500 dark:bg-slate-800/50">
            <tr>
              <th className="w-28 px-2 py-1.5 font-medium">Field</th>
              <th className="px-2 py-1.5 font-medium">Yours</th>
              <th className="px-2 py-1.5 font-medium">Registry</th>
              <th className="w-24 px-2 py-1.5 font-medium">Use</th>
            </tr>
          </thead>
          <tbody>
            {diffs.map((d) => {
              const lk = d.key.toLowerCase();
              const choice = choices[lk] ?? defaultChoice(d, options);
              return (
                <DiffRow key={lk} diff={d} choice={choice} onSetChoice={(c) => onSetChoice(lk, c)} />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function DiffRow({
  diff,
  choice,
  onSetChoice,
}: {
  diff: FieldDiff;
  choice: Choice;
  onSetChoice: (choice: Choice) => void;
}) {
  const rowBg =
    diff.status === "changed"
      ? "bg-amber-50/60 dark:bg-amber-950/20"
      : diff.status === "added"
      ? "bg-emerald-50/60 dark:bg-emerald-950/20"
      : diff.status === "removed"
      ? "bg-slate-50 dark:bg-slate-800/30"
      : "";
  const editable = diff.status !== "same";

  return (
    <tr className={`border-t border-slate-100 align-top dark:border-slate-800 ${rowBg}`}>
      <td className="px-2 py-1.5 font-mono font-medium">{diff.key}</td>
      <td className={`px-2 py-1.5 break-words ${choice === "original" && editable ? "font-medium" : "text-slate-400"}`}>
        {diff.original ?? <span className="italic text-slate-300">—</span>}
      </td>
      <td className={`px-2 py-1.5 break-words ${choice === "fetched" && editable ? "font-medium" : "text-slate-400"}`}>
        {diff.fetched ?? <span className="italic text-slate-300">—</span>}
      </td>
      <td className="px-2 py-1.5">
        {editable ? (
          <div className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-700">
            <button
              onClick={() => onSetChoice("original")}
              className={`px-1.5 py-0.5 text-[10px] ${
                choice === "original" ? "bg-slate-600 text-white" : "bg-white text-slate-500 dark:bg-slate-900"
              }`}
            >
              Mine
            </button>
            <button
              onClick={() => onSetChoice("fetched")}
              className={`px-1.5 py-0.5 text-[10px] ${
                choice === "fetched" ? "bg-indigo-600 text-white" : "bg-white text-slate-500 dark:bg-slate-900"
              }`}
            >
              Reg.
            </button>
          </div>
        ) : (
          <span className="text-[10px] text-slate-400">same</span>
        )}
      </td>
    </tr>
  );
}
