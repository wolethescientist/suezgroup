"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ActionForm, SubmitBtn, type Action } from "@/components/form";
import { Icon } from "@/components/icons";

export type Annotation = {
  id: number;
  quote: string;
  occurrence: number;
  body: string;
  author: string;
  created_at: string;
  resolved_at: string | null;
  mine: boolean;
};

/**
 * The document, with comments pinned to the passages they are about.
 *
 * The anchor is the quoted text plus which occurrence of it was selected, not a
 * character offset: offsets do not survive an edit anywhere above them, and a
 * comment that silently slides onto a different clause is worse than one that
 * admits it has lost its place. A quote that no longer appears is shown as
 * "no longer in the text" rather than guessed at.
 *
 * Highlighting happens after render, against the DOM, because the body is
 * sanitised HTML the server owns — this must not re-serialise it.
 */
export function AnnotatedDocument({
  html,
  plain,
  memoId,
  annotations,
  addAction,
  canComment,
}: {
  html: string | null;
  plain: string;
  memoId: number;
  annotations: Annotation[];
  addAction: Action;
  canComment: boolean;
}) {
  const body = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<{ quote: string; occurrence: number } | null>(null);
  const [active, setActive] = useState<number | null>(null);

  /** Paints the highlights. Re-run whenever the comments change. */
  const paint = useCallback(() => {
    const root = body.current;
    if (!root) return;
    for (const el of root.querySelectorAll("[data-annotation]")) {
      el.replaceWith(...el.childNodes);
    }
    root.normalize();

    for (const a of annotations) {
      if (!a.quote || a.resolved_at) continue;
      const span = locate(root, a.quote, a.occurrence);
      if (!span) continue;
      wrap(root, span.start, span.end, a.id, a.resolved_at != null);
    }
  }, [annotations]);

  useEffect(paint, [paint]);

  // Scrolls to and flashes the comment's passage when its card is clicked.
  useEffect(() => {
    if (active == null) return;
    const el = body.current?.querySelector(`[data-annotation="${active}"]`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [active]);

  const onSelect = () => {
    if (!canComment) return;
    const root = body.current;
    const sel = window.getSelection();
    if (!root || !sel || sel.isCollapsed || sel.rangeCount === 0) return setDraft(null);

    const range = sel.getRangeAt(0);
    if (!root.contains(range.commonAncestorContainer)) return setDraft(null);

    const quote = range.toString().replace(/\s+/g, " ").trim();
    if (quote.length < 3) return setDraft(null);

    // Which occurrence of this wording was picked: count the ones before it.
    const before = document.createRange();
    before.setStart(root, 0);
    before.setEnd(range.startContainer, range.startOffset);
    const preceding = normalise(before.toString());
    setDraft({ quote: quote.slice(0, 600), occurrence: countOf(preceding, quote) + 1 });
  };

  const open = annotations.filter((a) => !a.resolved_at);
  const resolved = annotations.filter((a) => a.resolved_at);

  return (
    <div className="grid gap-5 xl:grid-cols-[1fr_minmax(0,17rem)]">
      <div>
        <div
          ref={body}
          onMouseUp={onSelect}
          onKeyUp={onSelect}
          className="doc-body text-[15px] leading-relaxed font-medium"
          {...(html
            ? { dangerouslySetInnerHTML: { __html: html } }
            : { children: <p className="whitespace-pre-wrap">{plain}</p> })}
        />

        {draft && (
          <div className="mt-4 rounded-xl border border-brand-200 bg-brand-50/60 p-4">
            <p className="mb-2 text-[11px] font-bold tracking-wide text-brand-800 uppercase">
              Commenting on this passage
            </p>
            <blockquote className="mb-3 border-l-2 border-brand-300 pl-3 text-sm font-medium text-ink-soft italic">
              “{draft.quote.length > 220 ? `${draft.quote.slice(0, 220)}…` : draft.quote}”
            </blockquote>
            <ActionForm action={addAction} className="grid gap-2" reset>
              <input type="hidden" name="memo_id" value={memoId} />
              <input type="hidden" name="quote" value={draft.quote} />
              <input type="hidden" name="occurrence" value={draft.occurrence} />
              <textarea name="body" rows={3} required className="field" placeholder="What needs changing here?" />
              <div className="flex gap-2">
                <SubmitBtn>Add comment</SubmitBtn>
                <button
                  type="button"
                  onClick={() => setDraft(null)}
                  className="rounded-xl px-3 py-2 text-xs font-bold text-ink-soft hover:bg-canvas"
                >
                  Cancel
                </button>
              </div>
            </ActionForm>
          </div>
        )}

        {canComment && !draft && annotations.length === 0 && (
          <p className="mt-4 flex items-center gap-2 text-xs font-medium text-ink-soft">
            <Icon name="quote" className="h-3.5 w-3.5" />
            Select any passage to comment on it.
          </p>
        )}
      </div>

      <aside className="grid content-start gap-2">
        <p className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">
          Comments {open.length > 0 && <span className="text-brand-700">({open.length} open)</span>}
        </p>

        {annotations.length === 0 && (
          <p className="text-xs font-medium text-ink-soft">
            None yet. {canComment ? "Select a passage in the document to start one." : ""}
          </p>
        )}

        {[...open, ...resolved].map((a) => (
          <button
            key={a.id}
            type="button"
            id={`annotation-${a.id}`}
            onClick={() => setActive(a.id)}
            className={`rounded-xl border p-3 text-left transition ${
              a.resolved_at
                ? "border-line bg-canvas/60 opacity-70"
                : active === a.id
                  ? "border-brand-300 bg-brand-50"
                  : "border-line bg-surface hover:border-brand-200"
            }`}
          >
            {a.quote && (
              <span className="mb-1.5 block truncate border-l-2 border-line pl-2 text-[11px] font-medium text-ink-soft italic">
                “{a.quote}”
              </span>
            )}
            <span className="block text-sm font-medium">{a.body}</span>
            <span className="mt-1 block text-[11px] font-semibold text-ink-soft">
              {a.author} · {new Date(a.created_at).toLocaleDateString()}
              {a.resolved_at && " · resolved"}
            </span>
          </button>
        ))}
      </aside>
    </div>
  );
}

/* ------------------------------------------------------------- DOM helpers */

const normalise = (s: string) => s.replace(/\s+/g, " ");

function countOf(haystack: string, needle: string) {
  if (!needle) return 0;
  let n = 0;
  let i = haystack.indexOf(needle);
  while (i !== -1) {
    n += 1;
    i = haystack.indexOf(needle, i + needle.length);
  }
  return n;
}

/**
 * Where the nth occurrence of `quote` sits, as offsets into the element's text.
 *
 * Offsets are into the *normalised* text, and `wrap` walks the real text nodes
 * with the same normalisation, so the two agree about where a run of
 * whitespace counts as one character.
 */
function locate(root: HTMLElement, quote: string, occurrence: number) {
  const text = normalise(root.textContent ?? "");
  const needle = normalise(quote);
  let index = -1;
  for (let n = 0; n < Math.max(1, occurrence); n += 1) {
    index = text.indexOf(needle, index + (n === 0 ? 0 : needle.length));
    if (index === -1) return null;
  }
  return { start: index, end: index + needle.length };
}

/** Wraps [start, end) of the element's normalised text in highlight spans. */
function wrap(root: HTMLElement, start: number, end: number, id: number, resolved: boolean) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let seen = 0;
  // Carried across nodes: a run of whitespace that spans a tag boundary
  // collapses to one space in textContent too, so the mapping must agree.
  let previousWasSpace = false;
  const pieces: { node: Text; from: number; to: number }[] = [];

  for (let node = walker.nextNode() as Text | null; node; node = walker.nextNode() as Text | null) {
    const raw = node.data;
    // Map each character of this node onto its position in the normalised text.
    const positions: number[] = [];
    for (let i = 0; i < raw.length; i += 1) {
      const isSpace = /\s/.test(raw[i]);
      if (isSpace && previousWasSpace) {
        positions.push(-1); // collapsed away by normalisation
        continue;
      }
      positions.push(seen);
      seen += 1;
      previousWasSpace = isSpace;
    }

    const from = positions.findIndex((p) => p >= start && p < end);
    if (from === -1) continue;
    let to = from;
    for (let i = from; i < positions.length; i += 1) {
      if (positions[i] !== -1 && positions[i] >= end) break;
      to = i + 1;
    }
    pieces.push({ node, from, to });
  }

  for (const piece of pieces.reverse()) {
    const range = document.createRange();
    range.setStart(piece.node, piece.from);
    range.setEnd(piece.node, Math.min(piece.to, piece.node.data.length));
    const span = document.createElement("span");
    span.dataset.annotation = String(id);
    span.className = resolved
      ? "rounded bg-line/50 px-0.5"
      : "rounded bg-amber-100 px-0.5 ring-1 ring-amber-300/70 ring-inset";
    try {
      range.surroundContents(span);
    } catch {
      // A range that straddles an element boundary cannot be surrounded. The
      // comment still shows in the margin; only the highlight is skipped.
    }
  }
}
