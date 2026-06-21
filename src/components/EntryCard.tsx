import { useState } from "react";
import type { EntryState } from "../App";
import { defaultChoice, summarize, type Choice, type FieldDiff } from "../lib/diff";

export function EntryCard({
  state,
  onVerify,
  onSetDoi,
  onSetChoice,
  onSetAll,
  onToggle,
}: {
  state: EntryState;
  onVerify: () => void;
  onSetDoi: (doi: string) => void;
  onSetChoice: (lowerKey: string, choice: Choice) => void;
  onSetAll: (choice: Choice | "reset") => void;
  onToggle: () => void;
}) {
  const { original, status, diffs } = state;
  const summary = diffs ? summarize(diffs) : null;
  const hasChanges = summary ? summary.added + summary.changed > 0 : false;

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900">
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left"
      >
        <StatusDot status={status} hasChanges={hasChanges} />
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-2">
            <span className="truncate font-mono text-sm font-semibold">
              {original.citationKey || "(no key)"}
            </span>
            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-slate-500 dark:bg-slate-800">
              {original.type}
            </span>
          </div>
          <p className="truncate text-xs text-slate-500">
            {fieldPreview(original.fields)}
          </p>
        </div>
        <StatusLabel state={state} summary={summary} />
      </button>

      {state.expanded && (
        <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
          {status === "no-doi" && (
            <MissingDoi onSetDoi={onSetDoi} />
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

          {status === "loading" && (
            <p className="text-sm text-slate-500">Looking up {state.doi}…</p>
          )}

          {status === "error" && (
            <div className="space-y-2 text-sm">
              <p className="text-red-600 dark:text-red-400">{state.error}</p>
              <EditableDoi current={state.doi ?? ""} onSetDoi={onSetDoi} onRetry={onVerify} />
            </div>
          )}

          {status === "verified" && diffs && (
            <DiffTable
              diffs={diffs}
              choices={state.choices}
              source={state.source}
              onSetChoice={onSetChoice}
              onSetAll={onSetAll}
            />
          )}
        </div>
      )}
    </div>
  );
}

function fieldPreview(fields: { key: string; value: string }[]): string {
  const get = (k: string) =>
    fields.find((f) => f.key.toLowerCase() === k)?.value;
  const title = get("title");
  const author = get("author");
  const year = get("year");
  return [author, year, title].filter(Boolean).join(" · ") || "—";
}

function StatusDot({ status, hasChanges }: { status: string; hasChanges: boolean }) {
  const color =
    status === "verified"
      ? hasChanges
        ? "bg-amber-500"
        : "bg-emerald-500"
      : status === "error"
      ? "bg-red-500"
      : status === "no-doi"
      ? "bg-slate-400"
      : status === "loading"
      ? "bg-indigo-500 animate-pulse"
      : "bg-indigo-400";
  return <span className={`h-2.5 w-2.5 shrink-0 rounded-full ${color}`} />;
}

function StatusLabel({
  state,
  summary,
}: {
  state: EntryState;
  summary: ReturnType<typeof summarize> | null;
}) {
  if (state.status === "verified" && summary) {
    if (summary.added + summary.changed === 0)
      return <span className="text-xs font-medium text-emerald-600">Matches registry</span>;
    return (
      <span className="text-xs font-medium text-amber-600">
        {summary.changed} changed · {summary.added} added
      </span>
    );
  }
  if (state.status === "no-doi")
    return <span className="text-xs font-medium text-slate-400">No DOI</span>;
  if (state.status === "error")
    return <span className="text-xs font-medium text-red-500">Error</span>;
  if (state.status === "loading")
    return <span className="text-xs font-medium text-indigo-500">Loading…</span>;
  return <span className="text-xs font-medium text-indigo-400">Ready</span>;
}

function MissingDoi({ onSetDoi }: { onSetDoi: (doi: string) => void }) {
  const [val, setVal] = useState("");
  return (
    <div className="space-y-2">
      <p className="text-sm text-amber-600 dark:text-amber-400">
        This entry has no DOI. Paste one to verify it, or leave it as-is.
      </p>
      <div className="flex gap-2">
        <input
          value={val}
          onChange={(e) => setVal(e.target.value)}
          placeholder="10.xxxx/xxxxx  or  https://doi.org/…"
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
    </div>
  );
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
  onSetChoice,
  onSetAll,
}: {
  diffs: FieldDiff[];
  choices: Record<string, Choice>;
  source?: string;
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
              const choice = choices[lk] ?? defaultChoice(d);
              return (
                <DiffRow
                  key={lk}
                  diff={d}
                  choice={choice}
                  onSetChoice={(c) => onSetChoice(lk, c)}
                />
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
      <td
        className={`px-2 py-1.5 break-words ${
          choice === "original" && editable ? "font-medium" : "text-slate-400"
        }`}
      >
        {diff.original ?? <span className="italic text-slate-300">—</span>}
      </td>
      <td
        className={`px-2 py-1.5 break-words ${
          choice === "fetched" && editable ? "font-medium" : "text-slate-400"
        }`}
      >
        {diff.fetched ?? <span className="italic text-slate-300">—</span>}
      </td>
      <td className="px-2 py-1.5">
        {editable ? (
          <div className="inline-flex overflow-hidden rounded border border-slate-300 dark:border-slate-700">
            <button
              onClick={() => onSetChoice("original")}
              className={`px-1.5 py-0.5 text-[10px] ${
                choice === "original"
                  ? "bg-slate-600 text-white"
                  : "bg-white text-slate-500 dark:bg-slate-900"
              }`}
            >
              Mine
            </button>
            <button
              onClick={() => onSetChoice("fetched")}
              className={`px-1.5 py-0.5 text-[10px] ${
                choice === "fetched"
                  ? "bg-indigo-600 text-white"
                  : "bg-white text-slate-500 dark:bg-slate-900"
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
