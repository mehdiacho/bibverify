// Convert registry values (raw UTF-8) into LaTeX-safe text so the .bib compiles
// under the common pdfLaTeX + BibTeX toolchain, not just biber/XeLaTeX.

// Unicode -> LaTeX. Accents are brace-wrapped so they're safe inside names.
const MAP: Record<string, string> = {
  // dashes / hyphens / minus
  "‐": "-", "‑": "-", "‒": "--", "–": "--", "—": "---",
  "―": "---", "−": "-",
  // spaces
  " ": "~", " ": "~", " ": "\\,", " ": "\\,", " ": "\\,",
  // quotes
  "‘": "`", "’": "'", "“": "``", "”": "''",
  "′": "'", "″": "''", "«": "<<", "»": ">>",
  // ellipsis / bullet
  "…": "{\\ldots}", "·": "{\\textperiodcentered}",
  // ligatures / special letters
  "ß": "{\\ss}", "æ": "{\\ae}", "Æ": "{\\AE}",
  "œ": "{\\oe}", "Œ": "{\\OE}", "ø": "{\\o}", "Ø": "{\\O}",
  "å": "{\\aa}", "Å": "{\\AA}", "ł": "{\\l}", "Ł": "{\\L}",
  "ð": "{\\dh}", "þ": "{\\th}",
  // acute
  "á": "{\\'a}", "é": "{\\'e}", "í": "{\\'i}", "ó": "{\\'o}",
  "ú": "{\\'u}", "ý": "{\\'y}", "ć": "{\\'c}", "ń": "{\\'n}",
  "ś": "{\\'s}", "ź": "{\\'z}", "Á": "{\\'A}", "É": "{\\'E}",
  "Í": "{\\'I}", "Ó": "{\\'O}", "Ú": "{\\'U}",
  // grave
  "à": "{\\`a}", "è": "{\\`e}", "ì": "{\\`i}", "ò": "{\\`o}",
  "ù": "{\\`u}", "À": "{\\`A}", "È": "{\\`E}",
  // circumflex
  "â": "{\\^a}", "ê": "{\\^e}", "î": "{\\^i}", "ô": "{\\^o}",
  "û": "{\\^u}",
  // diaeresis / umlaut
  "ä": '{\\"a}', "ë": '{\\"e}', "ï": '{\\"i}', "ö": '{\\"o}',
  "ü": '{\\"u}', "ÿ": '{\\"y}', "Ä": '{\\"A}', "Ö": '{\\"O}',
  "Ü": '{\\"U}',
  // tilde
  "ñ": "{\\~n}", "ã": "{\\~a}", "õ": "{\\~o}", "Ñ": "{\\~N}",
  // caron / haček
  "č": "{\\v c}", "ž": "{\\v z}", "š": "{\\v s}", "ř": "{\\v r}",
  "ě": "{\\v e}", "Č": "{\\v C}", "Ž": "{\\v Z}", "Š": "{\\v S}",
  // cedilla / ring / breve / dot
  "ç": "{\\c c}", "Ç": "{\\c C}", "ş": "{\\c s}", "ţ": "{\\c t}",
  "ů": "{\\r u}", "ğ": "{\\u g}", "ı": "{\\i}",
};

/** Scripts pdfLaTeX cannot typeset without special packages (no ASCII form). */
const NON_LATIN = /[Ͱ-ϿЀ-ӿ֐-׿؀-ۿ܀-ݏऀ-ॿ぀-ヿ㐀-鿿가-힯]/;

export function hasNonLatinScript(s: string): boolean {
  return NON_LATIN.test(s);
}

/** Decode HTML entities the registry sometimes leaves in values (e.g. `&amp;`,
 *  and even double-encoded `&amp;amp;`). */
export function decodeEntities(input: string): string {
  let s = input;
  let prev: string;
  do {
    prev = s;
    s = s
      .replace(/&amp;/gi, "&")
      .replace(/&lt;/gi, "<")
      .replace(/&gt;/gi, ">")
      .replace(/&quot;/gi, '"')
      .replace(/&apos;/gi, "'")
      .replace(/&#0*39;/g, "'")
      .replace(/&#x0*27;/gi, "'")
      .replace(/&nbsp;/gi, " ");
  } while (s !== prev);
  return s;
}

/**
 * Make a DOI/URL value safe for pdfLaTeX while keeping it a valid, resolvable
 * identifier: percent-encode the angle brackets, then backslash-escape the
 * LaTeX-special characters (%, &, #, _, $) so none act as comment/align/math.
 * e.g. `…8:4<194>…` -> `…8:4\%3C194\%3E…` (renders the real %-encoded DOI).
 */
export function urlSafe(input: string): string {
  return decodeEntities(input)
    .replace(/</g, "%3C")
    .replace(/>/g, "%3E")
    .replace(/([%&#_$])/g, "\\$1");
}

/** Reverse urlSafe enough to recover a resolvable DOI for lookups/comparison. */
export function urlUnsafe(input: string): string {
  return input
    .replace(/\\([%&#_$])/g, "$1")
    .replace(/%3c/gi, "<")
    .replace(/%3e/gi, ">");
}

/**
 * Make a field value safe for pdfLaTeX/BibTeX: decode HTML entities, map Unicode
 * to LaTeX macros, and escape the special characters & % # _ < >. Existing
 * backslash escapes and structural braces are left intact.
 */
export function toLatexSafe(input: string): string {
  input = decodeEntities(input);
  let out = "";
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "\\") {
      // Pass an existing macro through untouched (\&, \'e, \textbf, …).
      out += c + (input[i + 1] ?? "");
      i++;
      continue;
    }
    const mapped = MAP[c];
    if (mapped !== undefined) {
      out += mapped;
      continue;
    }
    if (c === "&" || c === "%" || c === "#" || c === "_") {
      out += "\\" + c;
      continue;
    }
    if (c === "<") {
      out += "{\\textless}";
      continue;
    }
    if (c === ">") {
      out += "{\\textgreater}";
      continue;
    }
    out += c;
  }
  return out;
}
