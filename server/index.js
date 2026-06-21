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
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
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
        return res.status(404).json({
          ok: false,
          error: `Not found (crossref: ${e1.message}; doi.org: ${e2.message})`,
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
