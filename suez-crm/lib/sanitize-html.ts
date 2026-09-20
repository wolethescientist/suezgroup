/**
 * Turns editor output into HTML that is safe to store and re-render.
 *
 * ponytail: quote terms used to be plain text in a <textarea>, so there was
 * nothing to sanitise. Now that they are composed in a rich editor, the terms
 * are attacker-controlled HTML that gets written to the database and rendered
 * back on a page a rep prints and sends to a customer — a stored XSS on the
 * document that carries the company's prices.
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
const BLOCK = new Set(["p", "h1", "h2", "h3", "ul", "ol", "blockquote", "hr"]);

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

/** Alignment is the one piece of styling the toolbar offers, so it is the only one kept. */
const ALIGNABLE = new Set(["p", "h1", "h2", "h3", "li", "blockquote"]);
const ALIGNMENTS = new Set(["left", "center", "right", "justify"]);

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

  if (ALIGNABLE.has(tag) && raw.style) {
    const align = /(?:^|;)\s*text-align\s*:\s*([a-z]+)/i.exec(raw.style)?.[1]?.toLowerCase();
    if (align && ALIGNMENTS.has(align)) bits.push(`style="text-align:${align}"`);
  }

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
    const shorter = html.replace(/<(p|h1|h2|h3|blockquote)>\s*<\/\1>/g, "");
    if (shorter === html) break;
    html = shorter;
  }

  // A body of nothing but empty paragraphs is nothing. A rule or a line break is content.
  return htmlToText(html) || /<(br|hr)>/.test(html) ? html : "";
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
      .replace(/<\s*\/\s*(p|h1|h2|h3|ul|ol|blockquote)\s*>/gi, "\n")
      .replace(/<[^>]*>/g, ""),
  )
    .replace(/[^\S\n]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** True when a body has no words in it — an editor left holding only empty paragraphs. */
export const isBlankHtml = (html: string) => htmlToText(html).replace(/[•\-\s]/g, "") === "";
