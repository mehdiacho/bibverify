# BibVerify

Paste a `.bib` file and verify every entry against the **official DOI registry**.
Built to clean up bibliographies where LLMs hallucinated or truncated author lists,
journal names, publishers, and page numbers.

It parses each entry, extracts the DOI, fetches the canonical BibTeX from CrossRef
(falling back to `doi.org` content negotiation for DataCite/arXiv/etc.), and shows a
field-by-field **diff** so you can accept the registry value or keep your own — then
export a clean `.bib`.

## Features

- **Smart parsing** — segments entries by `@type{…}` with full brace/quote matching, so
  nested braces and stray `@` inside field values don't break it.
- **Batch verification** — looks up every DOI concurrently (4 at a time).
- **Side-by-side diff** — per field: `same`, `changed`, `added`, or `removed`, with
  `Mine / Reg.` toggles and `Accept all` / `Keep mine` shortcuts.
- **Missing DOIs** — entries without a DOI are flagged; paste one inline to verify
  without editing your source file (or re-upload a corrected file).
- **Export** — download or copy a merged `.bib`. Your original citation keys are kept.

## Architecture

- **Frontend:** React + Vite + Tailwind (`src/`). All parsing, diffing, and merging
  happen in the browser — only the bare DOI strings are sent to the backend.
- **Backend:** a tiny Express proxy (`server/index.js`) that queries CrossRef /
  `doi.org` on your behalf (avoids CORS surprises, adds an in-memory cache, and uses
  the CrossRef "polite pool" via a mailto User-Agent).

```
src/
  lib/bibtex.ts   parser + serializer + DOI extraction
  lib/diff.ts     field diff + merge model
  lib/api.ts      client fetch + concurrency limiter
  App.tsx         state + orchestration
  components/EntryCard.tsx   per-entry diff UI
server/index.js   CrossRef / doi.org proxy
```

## Run locally

```bash
npm install
npm run dev      # client on :5173, proxy on :8787 (Vite proxies /api → :8787)
```

Open http://localhost:5173.

### Be a good CrossRef citizen

Set your email so requests use the faster "polite pool":

```bash
CROSSREF_MAILTO=you@example.com npm run dev
```

## Build / deploy

```bash
npm run build    # outputs to dist/
npm start        # Express serves dist/ AND the /api proxy on one port
```

Because it needs the proxy, deploy as a small Node service (Render, Railway, Fly,
a Vercel/Netlify function, etc.) rather than a pure static site.
