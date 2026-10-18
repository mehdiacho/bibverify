import express from "express";
import path from "node:path";
import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();

const PORT = process.env.PORT || 8787;
// CrossRef asks that you identify yourself; a mailto puts you in the "polite" pool.
const MAILTO = process.env.CROSSREF_MAILTO || "anonymous@example.com";
const UA = `BibVerify/0.1 (https://github.com/; mailto:${MAILTO})`;

// Simple in-memory cache so repeated lookups during a session are instant.
const cache = new Map();

function cleanDoi(raw) {
  if (!raw) return "";
  return String(raw)
    .trim()
    .replace(/\\([%&#_$])/g, "$1") // undo LaTeX-safe URL escaping
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .replace(/%3c/gi, "<")
    .replace(/%3e/gi, ">")
    .trim();
}

async function fetchBibtex(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/x-bibtex" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const text = (await res.text()).trim();
  if (!text.startsWith("@")) throw new Error("response was not BibTeX");
  return text;
}

app.get("/api/doi", async (req, res) => {
  const doi = cleanDoi(req.query.doi);
  if (!doi || !/^10\./.test(doi)) {
    return res.status(400).json({ ok: false, error: "Invalid or missing DOI", doi });
  }
  if (cache.has(doi)) {
    return res.json({ ok: true, bibtex: cache.get(doi), source: "cache", doi });
  }

  const crossrefUrl = `https://api.crossref.org/works/${encodeURIComponent(
    doi
  )}/transform/application/x-bibtex`;
  const doiOrgUrl = `https://doi.org/${doi.split("/").map(encodeURIComponent).join("/")}`;

  try {
    let bibtex, source;
    try {
      bibtex = await fetchBibtex(crossrefUrl);
      source = "crossref";
    } catch (e1) {
      // Fall back to DOI.org content negotiation (covers DataCite, mEDRA, etc.).
      try {
        bibtex = await fetchBibtex(doiOrgUrl);
        source = "doi.org";
      } catch (e2) {
        // If BOTH the CrossRef API and doi.org (the authoritative resolver)
        // return 404, the DOI simply isn't registered — almost always a wrong
        // or hallucinated DOI rather than a transient failure.
        const both404 = /\b404\b/.test(e1.message) && /\b404\b/.test(e2.message);
        return res.status(404).json({
          ok: false,
          kind: both404 ? "not-found" : "lookup-error",
          error: both404
            ? "This DOI isn’t registered at doi.org or CrossRef — it’s likely incorrect."
            : `Lookup failed (crossref: ${e1.message}; doi.org: ${e2.message})`,
          doi,
        });
      }
    }
    cache.set(doi, bibtex);
    res.json({ ok: true, bibtex, source, doi });
  } catch (e) {
    res.status(500).json({ ok: false, error: String(e?.message || e), doi });
  }
});

// ---------------------------------------------------------------------------
// Reverse lookup: find a DOI from title / author / year when an entry has none.
// ---------------------------------------------------------------------------

function norm(s) {
  return (s || "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Sørensen–Dice coefficient on character bigrams: a normalized 0..1 similarity.
function diceSimilarity(a, b) {
  a = norm(a);
  b = norm(b);
  if (!a || !b) return 0;
  if (a === b) return 1;
  if (a.length < 2 || b.length < 2) return 0;
  const bigrams = new Map();
  for (let i = 0; i < a.length - 1; i++) {
    const g = a.slice(i, i + 2);
    bigrams.set(g, (bigrams.get(g) || 0) + 1);
  }
  let intersection = 0;
  for (let i = 0; i < b.length - 1; i++) {
    const g = b.slice(i, i + 2);
    const c = bigrams.get(g) || 0;
    if (c > 0) {
      bigrams.set(g, c - 1);
      intersection++;
    }
  }
  return (2 * intersection) / (a.length - 1 + (b.length - 1));
}

function crossrefAuthors(arr) {
  if (!Array.isArray(arr)) return "";
  return arr
    .map((a) => [a.family, a.given].filter(Boolean).join(", "))
    .filter(Boolean)
    .join(" and ");
}

async function searchCrossref(title, author, year) {
  const q = [title, author].filter(Boolean).join(" ");
  const params = new URLSearchParams({
    rows: "5",
    select: "DOI,title,author,issued,score",
    "query.bibliographic": q,
  });
  const url = `https://api.crossref.org/works?${params.toString()}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`crossref ${res.status}`);
  const data = await res.json();
  return (data.message?.items || []).map((it) => ({
    doi: it.DOI,
    title: Array.isArray(it.title) ? it.title[0] : it.title || "",
    authors: crossrefAuthors(it.author),
    year: it.issued?.["date-parts"]?.[0]?.[0] ?? null,
    source: "crossref",
  }));
}

async function searchOpenAlex(title, author, year) {
  const params = new URLSearchParams({
    per_page: "5",
    search: title,
    mailto: MAILTO,
    select: "id,doi,title,publication_year,authorships",
  });
  const url = `https://api.openalex.org/works?${params.toString()}`;
  const res = await fetch(url, { headers: { "User-Agent": UA } });
  if (!res.ok) throw new Error(`openalex ${res.status}`);
  const data = await res.json();
  return (data.results || [])
    .filter((w) => w.doi)
    .map((w) => ({
      doi: cleanDoi(w.doi),
      title: w.title || "",
      authors: (w.authorships || [])
        .map((a) => a.author?.display_name)
        .filter(Boolean)
        .join(" and "),
      year: w.publication_year ?? null,
      source: "openalex",
    }));
}

app.get("/api/resolve", async (req, res) => {
  const title = (req.query.title || "").toString().trim();
  const author = (req.query.author || "").toString().trim();
  const year = (req.query.year || "").toString().trim();
  if (!title) return res.status(400).json({ ok: false, error: "Missing title" });

  const settled = await Promise.allSettled([
    searchCrossref(title, author, year),
    searchOpenAlex(title, author, year),
  ]);
  const raw = [];
  for (const s of settled) if (s.status === "fulfilled") raw.push(...s.value);

  // Score each candidate by title similarity, with small year/author boosts.
  const yearNum = year ? parseInt(year, 10) : null;
  const seen = new Set();
  const candidates = [];
  for (const c of raw) {
    if (!c.doi || seen.has(c.doi.toLowerCase())) continue;
    seen.add(c.doi.toLowerCase());
    let match = diceSimilarity(title, c.title);
    if (yearNum && c.year) {
      const diff = Math.abs(yearNum - c.year);
      if (diff === 0) match = Math.min(1, match + 0.05);
      else if (diff > 1) match = Math.max(0, match - 0.1);
    }
    candidates.push({
      ...c,
      match: Math.round(match * 100) / 100,
      confident: match >= 0.85 && (!yearNum || !c.year || Math.abs(yearNum - c.year) <= 1),
    });
  }
  candidates.sort((a, b) => b.match - a.match);

  res.json({ ok: true, query: { title, author, year }, candidates: candidates.slice(0, 6) });
});

// In production, serve the built client and let the SPA handle routing.
const dist = path.join(__dirname, "..", "dist");
if (existsSync(dist)) {
  app.use(express.static(dist));
  app.use((req, res, next) => {
    if (req.method === "GET" && !req.path.startsWith("/api")) {
      return res.sendFile(path.join(dist, "index.html"));
    }
    next();
  });
}

app.listen(PORT, () => {
  console.log(`BibVerify proxy listening on http://localhost:${PORT}`);
});
