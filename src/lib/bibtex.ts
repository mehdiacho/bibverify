// A small, dependency-free BibTeX parser and serializer.
//
// The parser locates each entry by scanning for an '@' that is followed by a
// type name and an opening delimiter ('{' or '('), then walks to the matching
// closing delimiter while tracking brace depth and quoted strings so that
// nested braces (and '@' or delimiters inside field values) do not confuse it.

export interface BibField {
  key: string;
  value: string;
}

export interface BibEntry {
  type: string;
  citationKey: string;
  fields: BibField[];
  /** The exact original text of the entry, '@' through closing brace. */
  raw: string;
}

const isLetter = (c: string) => c >= "A" && c <= "Z" || c >= "a" && c <= "z";
const isSpace = (c: string) => c === " " || c === "\t" || c === "\n" || c === "\r";

export function parseBibtex(input: string): BibEntry[] {
  const entries: BibEntry[] = [];
  const n = input.length;
  let i = 0;

  while (i < n) {
    // Find the next '@'.
    while (i < n && input[i] !== "@") i++;
    if (i >= n) break;

    const atPos = i;
    i++; // consume '@'

    // Read the entry type (letters only).
    let type = "";
    while (i < n && isLetter(input[i])) {
      type += input[i];
      i++;
    }
    if (type.length === 0) {
      i = atPos + 1; // a stray '@', keep scanning
      continue;
    }

    while (i < n && isSpace(input[i])) i++;

    const open = input[i];
    if (open !== "{" && open !== "(") {
      i = atPos + 1; // '@' that does not begin an entry
      continue;
    }
    const closeChar = open === "{" ? "}" : ")";
    const bodyStart = i + 1;

    // Walk to the matching closing delimiter.
    let j = bodyStart;
    let depth = 0;
    let inQuote = false;
    let closePos = -1;
    while (j < n) {
      const c = input[j];
      if (inQuote) {
        if (c === "{") depth++;
        else if (c === "}") {
          if (depth > 0) depth--;
        } else if (c === '"' && depth === 0) inQuote = false;
      } else {
        if (c === '"' && depth === 0) inQuote = true;
        else if (c === "{") depth++;
        else if (c === "}") {
          if (depth === 0) {
            if (closeChar === "}") {
              closePos = j;
              break;
            }
          } else depth--;
        } else if (c === ")" && closeChar === ")" && depth === 0) {
          closePos = j;
          break;
        }
      }
      j++;
    }

    if (closePos === -1) break; // unterminated entry; stop to avoid looping

    const body = input.slice(bodyStart, closePos);
    const raw = input.slice(atPos, closePos + 1);
    const lowerType = type.toLowerCase();

    // Skip the non-reference entry kinds.
    if (lowerType === "comment" || lowerType === "preamble" || lowerType === "string") {
      i = closePos + 1;
      continue;
    }

    const parsed = parseEntryBody(body);
    entries.push({ type: lowerType, citationKey: parsed.citationKey, fields: parsed.fields, raw });
    i = closePos + 1;
  }

  return entries;
}

function parseEntryBody(body: string): { citationKey: string; fields: BibField[] } {
  const n = body.length;
  let i = 0;

  // Citation key: up to the first top-level comma.
  let citationKey = "";
  while (i < n && body[i] !== ",") {
    citationKey += body[i];
    i++;
  }
  citationKey = citationKey.trim();
  i++; // skip the comma (if any)

  const fields: BibField[] = [];
  while (i < n) {
    // Skip whitespace and stray commas between fields.
    while (i < n && (isSpace(body[i]) || body[i] === ",")) i++;
    if (i >= n) break;

    // Field name, up to '='.
    let key = "";
    while (i < n && body[i] !== "=" && body[i] !== ",") {
      key += body[i];
      i++;
    }
    key = key.trim();
    if (i >= n || body[i] !== "=") break; // malformed
    i++; // skip '='

    while (i < n && isSpace(body[i])) i++;

    let value = "";
    if (body[i] === "{") {
      let depth = 0;
      do {
        const c = body[i];
        if (c === "{") depth++;
        else if (c === "}") depth--;
        value += c;
        i++;
      } while (i < n && depth > 0);
      value = value.slice(1, -1); // strip outer braces
    } else if (body[i] === '"') {
      i++; // opening quote
      let depth = 0;
      while (i < n) {
        const c = body[i];
        if (c === "{") depth++;
        else if (c === "}") {
          if (depth > 0) depth--;
        } else if (c === '"' && depth === 0) {
          i++;
          break;
        }
        value += c;
        i++;
      }
    } else {
      // Bare value (number or @string macro), up to the next comma.
      while (i < n && body[i] !== ",") {
        value += body[i];
        i++;
      }
      value = value.trim();
    }

    if (key) fields.push({ key, value });
  }

  return { citationKey, fields };
}

/** Look up a field value case-insensitively. */
export function getField(entry: BibEntry, key: string): string | undefined {
  const lk = key.toLowerCase();
  return entry.fields.find((f) => f.key.toLowerCase() === lk)?.value;
}

/** Pull a normalized DOI out of an entry, if it has one. */
export function extractDoi(entry: BibEntry): string | null {
  const raw = getField(entry, "doi");
  if (raw) return cleanDoi(raw);
  // Some entries hide the DOI inside a url field.
  const url = getField(entry, "url");
  if (url) {
    const m = url.match(/(?:dx\.)?doi\.org\/(10\.\S+)/i);
    if (m) return cleanDoi(m[1]);
  }
  return null;
}

export function cleanDoi(raw: string): string {
  return raw
    .trim()
    .replace(/^https?:\/\/(dx\.)?doi\.org\//i, "")
    .replace(/^doi:\s*/i, "")
    .trim();
}

export function serializeEntry(entry: BibEntry): string {
  const pad = entry.fields.reduce((m, f) => Math.max(m, f.key.length), 0);
  const lines = entry.fields.map(
    (f) => `  ${f.key.padEnd(pad)} = {${f.value}}`
  );
  return `@${entry.type}{${entry.citationKey},\n${lines.join(",\n")}\n}`;
}

export function serializeBib(entries: BibEntry[]): string {
  return entries.map(serializeEntry).join("\n\n") + "\n";
}
