// The document body is now attacker-controlled HTML that gets stored and
// re-rendered to every recipient, so this file is the proof that it cannot
// carry script. Each case is something a real payload actually does.
import assert from "node:assert/strict";
import { htmlToText, isBlankHtml, sanitizeHtml } from "../lib/sanitize-html.ts";

/** No output from the sanitiser may ever contain a way to run code. */
function assertInert(html, why) {
  assert.ok(!/<script/i.test(html), `${why}: no <script> survives`);
  assert.ok(!/\son[a-z]+\s*=/i.test(html), `${why}: no on* handler survives — got ${html}`);
  assert.ok(!/javascript:/i.test(html), `${why}: no javascript: URL survives — got ${html}`);
  assert.ok(!/<(iframe|object|embed|svg|math|style|link|meta)\b/i.test(html), `${why}: no embedding tag survives`);
}

/* ------------------------------------------------------------- script tags */

for (const [input, why] of [
  ['<script>alert(1)</script>', "a plain script tag"],
  ['<p>before</p><script>alert(1)</script><p>after</p>', "a script between paragraphs"],
  ['<SCRIPT>alert(1)</SCRIPT>', "an upper-case script tag"],
  ['<scr<script>ipt>alert(1)</script>', "a nested-name script tag"],
  ['<script src="//evil.example/x.js"></script>', "a remote script"],
  ['<script>alert(1)', "an unclosed script — must swallow the rest"],
  ['<style>body{background:url(javascript:alert(1))}</style>', "a style block"],
  ['<iframe src="//evil.example"></iframe>', "an iframe"],
  ['<svg><script>alert(1)</script></svg>', "script hidden inside svg"],
  ['<math><mtext><script>alert(1)</script></mtext></math>', "script hidden inside math"],
  ['<!--<script>alert(1)</script>-->', "script inside a comment"],
  ['<object data="x"></object><embed src="x">', "object and embed"],
]) {
  const clean = sanitizeHtml(input);
  assertInert(clean, why);
  assert.ok(!/alert\(1\)/.test(clean), `${why}: the payload body does not survive as text either`);
}

// A script tag's *contents* must not be kept as visible text, unlike an unknown tag.
assert.equal(sanitizeHtml('<marquee>kept</marquee>'), "kept", "an unknown tag is dropped but its words stay");
assert.equal(sanitizeHtml('<script>secret</script>'), "", "a script tag takes its contents with it");

/**
 * A <div> is a paragraph, not an unknown tag.
 *
 * Contenteditable emits divs for new lines in some browsers whatever the
 * paragraph separator is set to. Dropping the tag and keeping the words ran two
 * lines of a document into one, so it is normalised to <p> instead.
 */
assert.equal(sanitizeHtml('<div>one</div><div>two</div>'), "<p>one</p><p>two</p>",
  "a div becomes a paragraph, so a line break is not silently lost");

/* ------------------------------------------------------- event handlers */

for (const [input, why] of [
  ['<p onclick="alert(1)">hi</p>', "onclick on an allowed tag"],
  ['<p OnClick="alert(1)">hi</p>', "mixed-case handler name"],
  ["<p onclick='alert(1)'>hi</p>", "single-quoted handler"],
  ["<p onclick=alert(1)>hi</p>", "unquoted handler"],
  ['<p onmouseover="alert(1)" onerror="alert(2)">hi</p>', "several handlers"],
  ['<strong onfocus="alert(1)" autofocus>hi</strong>', "handler plus a boolean attribute"],
]) {
  const clean = sanitizeHtml(input);
  assertInert(clean, why);
  assert.match(clean, /hi/, `${why}: the visible words are kept`);
}

// Attributes are re-emitted from an allowlist, so anything unlisted is simply gone.
assert.equal(sanitizeHtml('<p id="x" class="y" data-z="1">t</p>'), "<p>t</p>", "unlisted attributes are dropped");
assert.equal(sanitizeHtml('<p style="position:fixed;top:0">t</p>'), "<p>t</p>", "styling other than alignment is dropped");

/* ---------------------------------------------------------------- links */

for (const [input, why] of [
  ['<a href="javascript:alert(1)">click</a>', "a javascript: link"],
  ['<a href="JaVaScRiPt:alert(1)">click</a>', "mixed-case javascript:"],
  ['<a href="java&#115;cript:alert(1)">click</a>', "an entity-encoded scheme"],
  ['<a href="  javascript:alert(1)">click</a>', "a leading-space scheme"],
  ['<a href="data:text/html,<script>alert(1)</script>">click</a>', "a data: URL"],
  ['<a href="vbscript:msgbox(1)">click</a>', "a vbscript: URL"],
]) {
  const clean = sanitizeHtml(input);
  assertInert(clean, why);
  assert.match(clean, /click/, `${why}: the link text is kept even though the link is not`);
  assert.ok(!/<a\b/.test(clean), `${why}: the anchor itself is dropped`);
}

// A scheme broken across a newline is one word by the time a browser reads it.
assertInert(sanitizeHtml('<a href="java\nscript:alert(1)">x</a>'), "a newline inside the scheme");

const link = sanitizeHtml('<a href="https://example.com/a?b=1&c=2">site</a>');
assert.match(link, /^<a href="https:\/\/example\.com\/a\?b=1&amp;c=2"/, "a good https link survives, escaped");
assert.match(link, /rel="noopener noreferrer nofollow"/, "outbound links cannot reach back at the opener");
assert.match(link, /target="_blank"/, "outbound links open away from the portal");
assert.match(sanitizeHtml('<a href="mailto:hr@example.com">mail</a>'), /href="mailto:hr@example\.com"/, "mailto is allowed");
assert.match(sanitizeHtml('<a href="/memos/4">internal</a>'), /href="\/memos\/4"/, "an internal path is allowed");

/* ------------------------------------------------------ formatting kept */

assert.equal(sanitizeHtml("<p>Plain <strong>bold</strong> and <em>italic</em>.</p>"),
  "<p>Plain <strong>bold</strong> and <em>italic</em>.</p>", "the formatting the toolbar produces survives intact");
assert.equal(sanitizeHtml("<b>x</b><i>y</i><strike>z</strike>"), "<strong>x</strong><em>y</em><s>z</s>",
  "legacy tags are normalised so one document has one shape");
assert.equal(sanitizeHtml("<ul><li>one</li><li>two</li></ul>"), "<ul><li>one</li><li>two</li></ul>", "lists survive");
assert.equal(sanitizeHtml("<h1>Title</h1><h2>Sub</h2>"), "<h1>Title</h1><h2>Sub</h2>", "headings survive");
assert.equal(sanitizeHtml('<p style="text-align: center">mid</p>'), '<p style="text-align:center">mid</p>',
  "alignment is the one style kept, and it is re-emitted rather than copied");
assert.equal(sanitizeHtml('<p style="text-align:nonsense">x</p>'), "<p>x</p>", "an unknown alignment is dropped");
assert.equal(sanitizeHtml("<p>a<br>b</p>"), "<p>a<br>b</p>", "a line break survives and is not left open");

/* ------------------------------------------------------------- balance */

assert.equal(sanitizeHtml("<p>unclosed"), "<p>unclosed</p>", "an unclosed tag is closed for you");
assert.equal(sanitizeHtml("</p>stray"), "stray", "a closer with no opener is ignored");
assert.equal(sanitizeHtml("<p><strong>crossed</p></strong>"), "<p><strong>crossed</strong></p>",
  "mis-nested tags come back nested properly");

/* ------------------------------------------------------------- escaping */

assert.equal(sanitizeHtml("<p>5 &lt; 6 &amp; 7 &gt; 6</p>"), "<p>5 &lt; 6 &amp; 7 &gt; 6</p>",
  "already-escaped text round-trips without doubling");
assert.equal(sanitizeHtml("<p>a & b</p>"), "<p>a &amp; b</p>", "a bare ampersand is escaped");
assert.equal(sanitizeHtml("<p>2 &lt; 3</p>"), "<p>2 &lt; 3</p>", "an entity is not decoded into a live tag");

/* ------------------------------------------------ plain-text rendition */

// `memos.body` stays plain text so search, list previews and the CSV export
// keep working. Searching "strong" must not match every bold document.
assert.equal(htmlToText("<p>Plain <strong>bold</strong> text.</p>"), "Plain bold text.", "tags do not leak into the text");
assert.ok(!/strong/.test(htmlToText("<p><strong>hello</strong></p>")), "tag names never reach the search column");
assert.equal(htmlToText("<p>one</p><p>two</p>"), "one\ntwo", "paragraphs become line breaks");
assert.equal(htmlToText("<ul><li>a</li><li>b</li></ul>"), "• a\n• b", "list items keep their bullets");
assert.equal(htmlToText("<p>a<br>b</p>"), "a\nb", "a line break becomes a newline");
assert.equal(htmlToText("<p>caf&eacute; &amp; bar</p>"), "caf&eacute; & bar", "known entities decode, unknown ones stay literal");

assert.ok(isBlankHtml("<p></p>"), "an empty paragraph counts as blank");
assert.ok(isBlankHtml("<p><br></p><p>  </p>"), "an editor left holding empty lines counts as blank");
assert.ok(!isBlankHtml("<p>x</p>"), "a paragraph with a word in it is not blank");
assert.equal(sanitizeHtml("<p>   </p>"), "", "a whitespace-only body normalises to nothing");

/* ------------------------------------------------------------- capacity */

const long = "<p>" + "word ".repeat(80_000) + "</p>";
const capped = sanitizeHtml(long);
assert.ok(capped.length <= 200_000 + 64, "an oversized body is truncated rather than stored whole");
assertInert(capped, "a truncated body");

/* ------------------------------------------- what execCommand actually emits */

// The browser's own editing commands produce invalid nesting; a parser would
// close the paragraph before the list, so the stored markup must already say so.
assert.equal(
  sanitizeHtml("<p><ul><li>a</li></ul><p>tail</p></p>"),
  "<ul><li>a</li></ul><p>tail</p>",
  "a list is lifted out of the paragraph execCommand wrapped it in",
);
assert.equal(sanitizeHtml("<p>one<p>two"), "<p>one</p><p>two</p>", "a new paragraph closes the open one");
assert.equal(sanitizeHtml("<ul><li>a<li>b</ul>"), "<ul><li>a</li><li>b</li></ul>", "an unclosed list item is closed");
assert.equal(sanitizeHtml("<ul><li>a<ul><li>b</li></ul></li></ul>"),
  "<ul><li>a<ul><li>b</li></ul></li></ul>", "a genuinely nested list is left alone");
assert.equal(sanitizeHtml("<p><br></p>"), "<p><br></p>", "a blank line the author typed is kept");
assert.ok(!/<p><\/p>/.test(sanitizeHtml("<p><ul><li>a</li></ul></p>")), "no empty paragraph is left behind");

console.log("\u2713 execCommand-shape checks passed");

console.log("✓ sanitiser checks passed");

/* ------------------------------------------------- word-processor markup */

/**
 * Tables, fonts, sizes, colours, indentation and line spacing survive, because
 * a document editor that silently discards them is not one. Every value is
 * re-emitted from a value this module built, never copied from the input.
 */
{
  const table = sanitizeHtml('<table><tr><th>Item</th><td colspan="2">Two</td></tr></table>');
  assert.match(table, /<table><tbody>?|<table>/, "a table is kept");
  assert.match(table, /colspan="2"/, "a sane colspan is kept");
  assert.equal(sanitizeHtml('<td colspan="900">x</td>').includes("colspan"), false,
    "an absurd colspan is dropped");

  assert.match(
    sanitizeHtml('<p><span style="font-size:14pt">big</span></p>'),
    /font-size:14pt/,
    "a size from the offered list is kept",
  );
  assert.equal(sanitizeHtml('<p><span style="font-size:13pt">odd</span></p>').includes("font-size"), false,
    "a size that is not on the list is dropped");

  assert.match(sanitizeHtml('<p><span style="color:#ff0000">red</span></p>'), /color:#ff0000/,
    "a hex colour is kept");
  assert.match(sanitizeHtml('<p><span style="color:rgb(255, 0, 0)">red</span></p>'), /color:#ff0000/,
    "rgb() is normalised to hex we produced ourselves");
  assert.equal(sanitizeHtml('<p><span style="color:url(javascript:alert(1))">x</span></p>').includes("url("), false,
    "a colour that is not a colour is dropped");

  assert.match(sanitizeHtml('<p style="margin-left:80px">in</p>'), /margin-left:80px/, "indentation is kept");
  assert.match(sanitizeHtml('<p style="margin-left:9999px">in</p>'), /margin-left:320px/,
    "indentation is capped rather than trusted");
  assert.match(sanitizeHtml('<p style="line-height:1.5">spaced</p>'), /line-height:1\.5/, "line spacing is kept");

  assert.equal(sanitizeHtml('<p><span style="position:fixed;top:0">x</span></p>'), "<p>x</p>",
    "a span carrying only disallowed styling loses the tag and keeps the words");
  assert.match(sanitizeHtml('<font color="#00ff00">green</font>'), /<span style="color:#00ff00">green<\/span>/,
    "<font color> is normalised into a span");
}

console.log("\u2713 word-processor markup checks passed");
