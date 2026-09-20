/**
 * Turns editor output into HTML that is safe to store and re-render.
 *
 * ponytail: documents used to be plain text in a <textarea>, so there was
 * nothing to sanitise. Now that they are composed in a rich editor, the body is
 * attacker-controlled HTML that gets written to the database and rendered back
 * to every recipient — a stored XSS, and on a page that also carries the
 * signature register.
 *
 * The rule here is *rebuild, never filter*. Nothing from the input is ever
 * copied through to the output: tags are re-emitted from an allowlist, their
 * attributes are re-emitted from an allowlist, and every text node is escaped.
 * A blocklist of "dangerous" tags would be a losing game; this way an input we
 * never anticipated can only ever become escaped text.
 *
 * No relative imports: this module is loaded by the test runner and the
 * migration under --experimental-strip-types, which cannot resolve them.
 */

/** Ceiling on a stored document, generous for prose and far below a DoS. */
export const MAX_BODY_HTML = 200_000;

/**
 * Tags kept, and what they are emitted as. The value is the canonical name, so
 * <b> and <strong> cannot produce two different shapes of the same document.
 */
const ALLOWED: Record<string, string> = {
  p: "p", br: "br", hr: "hr",
  strong: "strong", b: "strong",
  em: "em", i: "em",
  u: "u",
  s: "s", strike: "s", del: "s",
  h1: "h1", h2: "h2", h3: "h3",
  ul: "ul", ol: "ol", li: "li",
  blockquote: "blockquote",
  a: "a",
  sub: "sub", sup: "sup",
  // A word processor produces tables, and a memo with a schedule in it needs
  // one. Emitted from the allowlist like everything else.
  table: "table", thead: "thead", tbody: "tbody", tfoot: "tbody",
  tr: "tr", td: "td", th: "th", caption: "caption",
  // The carrier for font, size and colour. <font> is what some browsers still
  // emit for foreColor; it is normalised to a span so one document shape comes out.
  span: "span", font: "span",
  div: "p",
};

/** Emitted without a closing tag, and never pushed onto the open-element stack. */
const VOID = new Set(["br", "hr"]);

/**
 * Blocks that cannot appear inside a paragraph.
 *
 * execCommand routinely emits `<p><ul>...</ul></p>`, which no HTML parser
 * accepts — a browser silently closes the paragraph first. Doing the same here
 * means what is stored is what a browser would have made of it, rather than
 * markup that renders differently depending on who re-parses it.
 */
const BLOCK = new Set([
  "p", "h1", "h2", "h3", "ul", "ol", "blockquote", "hr",
  "table", "thead", "tbody", "tr", "td", "th", "caption",
]);

/**
 * Dropped along with everything inside them.
 *
 * For every other unknown tag the tag is dropped but its text is kept, which is
 * what you want for a stray <div> from a paste. For these, keeping the contents
 * would mean printing the body of a script into the document.
 */
const DROP_CONTENTS = [
  "script", "style", "iframe", "object", "embed", "svg", "math",
  "template", "noscript", "frame", "frameset", "applet", "link", "meta", "title", "head",
];

/* ------------------------------------------------------------------ styles */
/**
 * Inline styles, rebuilt rather than filtered.
 *
 * ponytail: the toolbar offered bold, lists and alignment, so alignment was the
 * only style worth keeping. A word processor offers fonts, sizes, colours,
 * highlighting, indentation and line spacing, and a document that loses all of
 * them on save is not a word processor. Every declaration below is parsed into
 * a value this module produces itself — nothing from the input reaches the
 * output, so `expression(...)`, `url(javascript:…)` and the rest have nowhere
 * to land.
 */
const ALIGNABLE = new Set(["p", "h1", "h2", "h3", "li", "blockquote", "td", "th", "caption"]);
const ALIGNMENTS = new Set(["left", "center", "right", "justify"]);

/** Blocks that may also carry indentation and line spacing. */
const SPACED = new Set(["p", "h1", "h2", "h3", "li", "blockquote", "td", "th"]);

/**
 * The faces the editor offers. An allowlist rather than a syntax check: a font
 * stack is a string that ends up inside a CSS declaration, and the set of fonts
 * a document may use is a decision, not a parsing problem.
 */
export const FONT_STACKS: Record<string, string> = {
  Sans: "ui-sans-serif, system-ui, sans-serif",
  Serif: "Georgia, 'Times New Roman', serif",
  Mono: "ui-monospace, 'SFMono-Regular', Menlo, monospace",
  Arial: "Arial, Helvetica, sans-serif",
  "Times New Roman": "'Times New Roman', Times, serif",
  Georgia: "Georgia, serif",
  Calibri: "Calibri, Candara, Segoe, sans-serif",
  Garamond: "Garamond, 'Palatino Linotype', serif",
  "Courier New": "'Courier New', Courier, monospace",
};
const FONT_VALUES = new Set(Object.values(FONT_STACKS));

/** Point sizes, the unit a document is actually specified in. */
export const FONT_SIZES = [8, 9, 10, 11, 12, 14, 16, 18, 20, 24, 28, 32, 36, 48, 72];

export const LINE_HEIGHTS = [1, 1.15, 1.5, 2];

/** Indent steps, in the same 40px execCommand uses. */
const MAX_INDENT = 8;

/** #rgb, #rrggbb or rgb()/rgba() — re-emitted as a hex string we build ourselves. */
function readColour(raw: string): string | null {
  const v = raw.trim().toLowerCase();
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(v);
  if (hex) {
    const h = hex[1];
    return `#${h.length === 3 ? [...h].map((c) => c + c).join("") : h}`;
  }
  const rgb = /^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*(?:,\s*[\d.]+\s*)?\)$/.exec(v);
  if (rgb) {
    const parts = [rgb[1], rgb[2], rgb[3]].map((n) => Math.min(255, Math.max(0, Number(n))));
    if (parts.some((n) => !Number.isFinite(n))) return null;
    return `#${parts.map((n) => n.toString(16).padStart(2, "0")).join("")}`;
  }
  if (v === "transparent" || v === "inherit") return null;
  // A small set of names, because "red" is what a person types and a browser emits.
  return /^[a-z]{3,20}$/.test(v) && NAMED_COLOURS.has(v) ? v : null;
}

const NAMED_COLOURS = new Set([
  "black", "white", "red", "green", "blue", "yellow", "orange", "purple",
  "grey", "gray", "silver", "maroon", "navy", "teal", "olive", "lime",
  "aqua", "fuchsia", "pink", "brown",
]);

/** Splits a style attribute into declarations, tolerating the usual junk. */
function declarations(style: string) {
  const out: Record<string, string> = {};
  for (const bit of style.split(";")) {
    const at = bit.indexOf(":");
    if (at === -1) continue;
    out[bit.slice(0, at).trim().toLowerCase()] = bit.slice(at + 1).trim();
  }
  return out;
}

/** Rebuilds the style attribute a tag is allowed to keep. */
function keepStyle(tag: string, style: string): string | null {
  const d = declarations(style);
  const bits: string[] = [];

  if (ALIGNABLE.has(tag)) {
    const align = d["text-align"]?.toLowerCase();
    if (align && ALIGNMENTS.has(align)) bits.push(`text-align:${align}`);
  }

  if (SPACED.has(tag)) {
    // execCommand indents in 40px steps; anything else is snapped to one.
    const indent = /^(\d+(?:\.\d+)?)px$/.exec(d["margin-left"] ?? "");
    if (indent) {
      const steps = Math.min(MAX_INDENT, Math.round(Number(indent[1]) / 40));
      if (steps > 0) bits.push(`margin-left:${steps * 40}px`);
    }
    const lh = Number(d["line-height"]);
    if (Number.isFinite(lh) && lh >= 1 && lh <= 3) bits.push(`line-height:${Math.round(lh * 100) / 100}`);
  }

  if (tag === "span") {
    const family = d["font-family"]?.replace(/\s+/g, " ").trim();
    if (family && FONT_VALUES.has(family)) bits.push(`font-family:${family}`);

    const size = /^(\d+(?:\.\d+)?)pt$/.exec(d["font-size"] ?? "");
    if (size) {
      const pt = Math.round(Number(size[1]));
      if (FONT_SIZES.includes(pt)) bits.push(`font-size:${pt}pt`);
    }

    const colour = d["color"] ? readColour(d["color"]) : null;
    if (colour) bits.push(`color:${colour}`);

    const background = d["background-color"] ? readColour(d["background-color"]) : null;
    if (background) bits.push(`background-color:${background}`);
  }

  return bits.length ? bits.join(";") : null;
}

/** A link may only go somewhere a link can safely go — javascript: and data: are the point of this. */
const SAFE_HREF = /^(https?:\/\/|mailto:|tel:|\/)/i;

const NAMED: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  ldquo: "“", rdquo: "”", lsquo: "‘", rsquo: "’",
  ndash: "–", mdash: "—", hellip: "…", middot: "·", bull: "•",
};

/** Entities in, characters out — so escaping afterwards cannot double-encode. */
function decodeEntities(s: string) {
  return s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (whole, body: string) => {
    if (body[0] === "#") {
      const hex = body[1] === "x" || body[1] === "X";
      const code = hex ? parseInt(body.slice(2), 16) : parseInt(body.slice(1), 10);
      // Control characters are how a payload hides a colon inside "java&#0;script:".
      if (!Number.isFinite(code) || code < 32 || code === 127 || code > 0x10ffff) return "";
      return String.fromCodePoint(code);
    }
    return NAMED[body.toLowerCase()] ?? whole;
  });
}

const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const escapeAttr = (s: string) => escapeText(s).replace(/"/g, "&quot;");

/** Pulls name="value" pairs out of a start tag, tolerating quoting styles and junk. */
function readAttrs(source: string) {
  const out: Record<string, string> = {};
  const re = /([a-zA-Z_:][-a-zA-Z0-9_:.]*)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(source))) {
    const value = m[3] ?? m[4] ?? m[5] ?? "";
    out[m[1].toLowerCase()] = decodeEntities(value).trim();
  }
  return out;
}

/** The attributes a given tag is allowed to keep, already escaped for output. */
function keepAttrs(tag: string, raw: Record<string, string>) {
  const bits: string[] = [];

  if (tag === "a") {
    // Strip whitespace and control characters before testing, so a colon split
    // across a newline ("java\nscript:x") is judged as the one word it becomes.
    const flat = (raw.href ?? "").replace(/[\u0000-\u0020]+/g, "");
    if (!SAFE_HREF.test(flat)) return null; // an unusable link is dropped, its text kept
    bits.push(`href="${escapeAttr(flat)}"`);
    // A document is read inside the portal; its links should not reach back at it.
    bits.push('target="_blank"', 'rel="noopener noreferrer nofollow"');
  }

  if (tag === "td" || tag === "th") {
    for (const span of ["colspan", "rowspan"] as const) {
      const n = Number(raw[span]);
      if (Number.isInteger(n) && n > 1 && n <= 40) bits.push(`${span}="${n}"`);
    }
  }

  // <font color="#..."> is normalised into the span's style, so one document
  // shape comes out whatever the browser put in.
  const style = raw.style ?? (raw.color ? `color:${raw.color}` : "");
  if (style) {
    const kept = keepStyle(tag, style);
    if (kept) bits.push(`style="${escapeAttr(kept)}"`);
  }

  // A span carrying nothing is noise; dropping the tag keeps its words.
  if (tag === "span" && bits.length === 0) return null;

  return bits;
}

/**
 * Sanitises a document body.
 *
 * Returns "" for anything with no visible content, so an empty editor and an
 * editor holding `<p><br></p>` are the same thing to the caller.
 */
export function sanitizeHtml(dirty: string): string {
  if (!dirty) return "";
  let input = dirty.slice(0, MAX_BODY_HTML);

  // Comments and declarations first: <!-- --> can otherwise hide a tag boundary.
  input = input.replace(/<!--[\s\S]*?-->/g, "").replace(/<![\s\S]*?>/g, "").replace(/<\?[\s\S]*?\?>/g, "");

  // Elements whose contents are not text. Unclosed ones swallow the rest, deliberately.
  for (const tag of DROP_CONTENTS) {
    input = input.replace(new RegExp(`<${tag}\\b[\\s\\S]*?(?:</${tag}\\s*>|$)`, "gi"), "");
  }

  const out: string[] = [];
  const open: string[] = [];
  const TAG = /<\s*(\/)?\s*([a-zA-Z][a-zA-Z0-9]*)((?:"[^"]*"|'[^']*'|[^>])*?)\/?\s*>/g;

  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = TAG.exec(input))) {
    const text = input.slice(last, m.index);
    if (text) out.push(escapeText(decodeEntities(text)));
    last = TAG.lastIndex;

    const [, closing, rawName, rawAttrs] = m;
    const tag = ALLOWED[rawName.toLowerCase()];
    if (!tag) continue; // unknown tag vanishes; the text it wrapped survives

    if (closing) {
      const at = open.lastIndexOf(tag);
      if (at === -1) continue; // a closer with no opener is noise
      // Close anything left open inside it, so the output is always balanced.
      while (open.length > at) out.push(`</${open.pop()}>`);
      continue;
    }

    if (VOID.has(tag)) {
      out.push(`<${tag}>`);
      continue;
    }

    // HTML5 implicit close, applied before the tag is opened.
    if (BLOCK.has(tag)) while (open[open.length - 1] === "p") out.push(`</${open.pop()}>`);
    if (tag === "li") {
      while (open[open.length - 1] === "p") out.push(`</${open.pop()}>`);
      if (open[open.length - 1] === "li") out.push(`</${open.pop()}>`);
    }
    // Table structure, closed the way a parser would: a new cell ends the last
    // one, a new row ends the last row and its cell.
    if (tag === "td" || tag === "th") {
      while (open[open.length - 1] === "td" || open[open.length - 1] === "th") out.push(`</${open.pop()}>`);
    }
    if (tag === "tr") {
      while (["td", "th", "tr"].includes(open[open.length - 1])) out.push(`</${open.pop()}>`);
    }
    if (tag === "thead" || tag === "tbody") {
      while (["td", "th", "tr", "thead", "tbody"].includes(open[open.length - 1])) out.push(`</${open.pop()}>`);
    }

    const attrs = keepAttrs(tag, readAttrs(rawAttrs ?? ""));
    if (attrs === null) continue; // e.g. a javascript: link — drop the tag, keep the words
    out.push(attrs.length ? `<${tag} ${attrs.join(" ")}>` : `<${tag}>`);
    open.push(tag);
  }

  const tail = input.slice(last);
  if (tail) out.push(escapeText(decodeEntities(tail)));
  while (open.length) out.push(`</${open.pop()}>`);

  // Implicitly closing a paragraph can leave a truly empty one behind. A blank
  // line the author typed is `<p><br></p>`, so `<p></p>` was never theirs.
  let html = out.join("");
  for (let pass = 0; pass < 4; pass++) {
    const shorter = html
      .replace(/<(p|h1|h2|h3|blockquote)>\s*<\/\1>/g, "")
      .replace(/<span(?: [^>]*)?>\s*<\/span>/g, "");
    if (shorter === html) break;
    html = shorter;
  }

  // A body of nothing but empty paragraphs is nothing. A rule or a line break is content.
  // A table with nothing written in it is still a table the author drew.
  return htmlToText(html) || /<(br|hr)>|<table/.test(html) ? html : "";
}

/**
 * The plain-text rendition of a body.
 *
 * `memos.body` stays plain text and keeps feeding search, the list previews and
 * the CSV export; only `memos.body_html` carries the formatting. Without this,
 * searching for "strong" would match every document that contains bold text.
 */
export function htmlToText(html: string): string {
  if (!html) return "";
  return decodeEntities(
    html
      .replace(/<\s*br\s*\/?\s*>/gi, "\n")
      .replace(/<\s*hr\s*\/?\s*>/gi, "\n---\n")
      .replace(/<\s*li\b[^>]*>/gi, "\n• ")
      .replace(/<\s*\/\s*(td|th)\s*>/gi, "\t")
      .replace(/<\s*\/\s*(tr|caption)\s*>/gi, "\n")
      .replace(/<\s*\/\s*(p|h1|h2|h3|ul|ol|blockquote|table)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[^\S\n\t]+/g, " ")
    .replace(/\t+/g, "\t")
    .replace(/\t*\n/g, "\n")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when a body has no words in it — an editor left holding only empty paragraphs. */
export const isBlankHtml = (html: string) => htmlToText(html).replace(/[•\-\s]/g, "") === "";
