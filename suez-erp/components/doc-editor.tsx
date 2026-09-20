"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";
import { FONT_SIZES, FONT_STACKS, LINE_HEIGHTS } from "@/lib/sanitize-html";

/**
 * The document body editor — a word processor for memos, circulars, policies
 * and reports.
 *
 * ponytail: bodies were composed in a <textarea> and rendered with
 * whitespace-pre-wrap, so a policy could not carry a heading, a numbered clause
 * or a bold defined term. That was fixed with bold/lists/alignment; this goes
 * the rest of the way, because what people mean by "make it like Word" is the
 * page, the fonts, the sizes, the colours, the tables and the ruler — not four
 * more toolbar buttons.
 *
 * `document.execCommand` is deprecated and still the only formatting API every
 * browser implements. The alternative is a document model of our own or a large
 * dependency; neither is worth it here. Where execCommand has no command for
 * what is wanted (point sizes, line spacing, tables) the DOM is edited
 * directly, always inside the editable region so the browser keeps the undo
 * stack.
 *
 * Nothing here trusts what it produces — the server sanitises the HTML on the
 * way in (lib/sanitize-html.ts), and the allowlist there is the same list of
 * fonts, sizes and colours this offers. That is where the security lives.
 */

type Cmd = { icon: IconName; title: string; cmd: string; arg?: string; key?: string };

const HISTORY: Cmd[] = [
  { icon: "undo", title: "Undo", cmd: "undo", key: "Z" },
  { icon: "redo", title: "Redo", cmd: "redo" },
];

const INLINE: Cmd[] = [
  { icon: "bold", title: "Bold", cmd: "bold", key: "B" },
  { icon: "italic", title: "Italic", cmd: "italic", key: "I" },
  { icon: "underline", title: "Underline", cmd: "underline", key: "U" },
  { icon: "strikethrough", title: "Strikethrough", cmd: "strikeThrough" },
  { icon: "superscript", title: "Superscript", cmd: "superscript" },
  { icon: "subscript", title: "Subscript", cmd: "subscript" },
];

const BLOCKS: Cmd[] = [
  { icon: "list-bullet", title: "Bulleted list", cmd: "insertUnorderedList" },
  { icon: "list-number", title: "Numbered list", cmd: "insertOrderedList" },
  { icon: "quote", title: "Quote", cmd: "formatBlock", arg: "blockquote" },
  { icon: "outdent", title: "Decrease indent", cmd: "outdent" },
  { icon: "indent", title: "Increase indent", cmd: "indent" },
];

const ALIGN: Cmd[] = [
  { icon: "align-left", title: "Align left", cmd: "justifyLeft" },
  { icon: "align-center", title: "Centre", cmd: "justifyCenter" },
  { icon: "align-right", title: "Align right", cmd: "justifyRight" },
  { icon: "align-justify", title: "Justify", cmd: "justifyFull" },
];

const STYLES = [
  { label: "Body text", tag: "p" },
  { label: "Heading 1", tag: "h1" },
  { label: "Heading 2", tag: "h2" },
  { label: "Heading 3", tag: "h3" },
];

/** Offered as swatches. Kept short: a palette is a decision, not a colour picker. */
const TEXT_COLOURS = ["#191a2c", "#4b4c63", "#b4590b", "#b91c1c", "#15803d", "#1d4ed8", "#7e22ce", "#ffffff"];
const HIGHLIGHTS = ["#fef08a", "#bbf7d0", "#bfdbfe", "#fbcfe8", "#fed7aa", "#e5e7eb"];

export function DocEditor({
  name,
  defaultValue = "",
  placeholder = "Write the document…",
  minHeight = "22rem",
  /** Rendered flush on the letterhead, without the editor's own frame. */
  bare = false,
  onDirty,
}: {
  name: string;
  defaultValue?: string;
  placeholder?: string;
  minHeight?: string;
  bare?: boolean;
  onDirty?: (dirty: boolean) => void;
}) {
  const area = useRef<HTMLDivElement>(null);
  const id = useId();
  /**
   * The submitted value lives in state, not in a ref written by hand.
   *
   * ponytail: this used to write `field.current.value` imperatively on every
   * keystroke. React re-applies `defaultValue` to an uncontrolled input when it
   * re-renders — a hidden input has no user-interaction dirty flag to protect
   * it — so any re-render of the surrounding form silently emptied the field
   * and the document saved with a blank body. Letting React own the value
   * removes the race entirely.
   *
   * Re-rendering per keystroke is safe here: React renders the editable div
   * with no children, so it never touches what the caret is sitting in.
   */
  const [html, setHtml] = useState(defaultValue);
  const [active, setActive] = useState<Record<string, boolean>>({});
  const [pageView, setPageView] = useState(!bare);
  const [panel, setPanel] = useState<"none" | "colour" | "highlight" | "find" | "table">("none");
  const empty = !stripped(html);

  /** Mirrors the editable region into the value the form submits. */
  const sync = useCallback(() => {
    const next = area.current?.innerHTML ?? "";
    setHtml(next);
    onDirty?.(next !== defaultValue);
  }, [defaultValue, onDirty]);

  // The initial value is written imperatively, once. React must not own this
  // subtree: re-rendering contenteditable from props destroys the caret.
  useEffect(() => {
    if (area.current && !area.current.innerHTML) {
      area.current.innerHTML = defaultValue || "<p><br></p>";
      setHtml(area.current.innerHTML);
    }
  }, [defaultValue]);

  /**
   * Ask the browser for CSS, not for <font> tags.
   *
   * With styleWithCSS off, foreColor emits `<font color>` and the sanitiser has
   * to normalise it. With it on, every command emits a styled span, which is
   * the shape the allowlist is written against. Both are handled, but agreeing
   * with the sanitiser here means the document does not change shape on save.
   */
  useEffect(() => {
    try {
      document.execCommand("styleWithCSS", false, "true");
      document.execCommand("defaultParagraphSeparator", false, "p");
    } catch {
      /* older engines: the defaults are close enough */
    }
  }, []);

  const focusArea = () => area.current?.focus();

  const exec = (cmd: string, arg?: string) => {
    focusArea();
    document.execCommand(cmd, false, arg);
    sync();
    refreshActive();
  };

  /** Lights up the buttons that apply where the caret is, the way a toolbar should. */
  const refreshActive = useCallback(() => {
    const state: Record<string, boolean> = {};
    for (const c of [...INLINE, ...BLOCKS, ...ALIGN]) {
      try {
        state[c.cmd] = document.queryCommandState(c.cmd);
      } catch {
        state[c.cmd] = false;
      }
    }
    setActive(state);
  }, []);

  /**
   * Wraps the selection in a styled span.
   *
   * execCommand has no command for a point size or for anything else the CSS
   * allowlist permits but the API predates, so the range is wrapped directly.
   * `surroundContents` refuses a range that straddles an element boundary, in
   * which case the contents are extracted and re-inserted, which always works.
   */
  const styleSelection = (declarations: Partial<CSSStyleDeclaration>) => {
    focusArea();
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0 || selection.isCollapsed) return;
    const range = selection.getRangeAt(0);
    if (!area.current?.contains(range.commonAncestorContainer)) return;

    const span = document.createElement("span");
    Object.assign(span.style, declarations);
    try {
      range.surroundContents(span);
    } catch {
      span.appendChild(range.extractContents());
      range.insertNode(span);
    }

    selection.removeAllRanges();
    const after = document.createRange();
    after.selectNodeContents(span);
    selection.addRange(after);
    sync();
  };

  /** Applies a declaration to every block the selection touches. */
  const styleBlocks = (declarations: Partial<CSSStyleDeclaration>) => {
    focusArea();
    const root = area.current;
    const selection = window.getSelection();
    if (!root || !selection || selection.rangeCount === 0) return;
    const range = selection.getRangeAt(0);

    const blocks = [...root.querySelectorAll<HTMLElement>("p,h1,h2,h3,li,blockquote,td,th")].filter((el) =>
      range.intersectsNode(el),
    );
    // A caret sitting in a document with no block wrapper still gets the change.
    const targets = blocks.length ? blocks : [root];
    for (const el of targets) Object.assign(el.style, declarations);
    sync();
  };

  const insertHtml = (markup: string) => {
    focusArea();
    document.execCommand("insertHTML", false, markup);
    sync();
  };

  const insertTable = (rows: number, cols: number, header: boolean) => {
    const head = header
      ? `<thead><tr>${Array.from({ length: cols }, (_, i) => `<th>Column ${i + 1}</th>`).join("")}</tr></thead>`
      : "";
    const bodyRows = Array.from(
      { length: Math.max(1, rows - (header ? 1 : 0)) },
      () => `<tr>${Array.from({ length: cols }, () => "<td><br></td>").join("")}</tr>`,
    ).join("");
    insertHtml(`<table>${head}<tbody>${bodyRows}</tbody></table><p><br></p>`);
    setPanel("none");
  };

  /** The table the caret is inside, if any — for adding a row or a column. */
  const currentTable = () => {
    const node = window.getSelection()?.anchorNode ?? null;
    const el = node instanceof Element ? node : node?.parentElement;
    const table = el?.closest("table") ?? null;
    return area.current?.contains(table) ? table : null;
  };

  const addRow = () => {
    const table = currentTable();
    const body = table?.querySelector("tbody") ?? table;
    const last = body?.querySelector("tr:last-child");
    if (!body || !last) return;
    const row = document.createElement("tr");
    row.innerHTML = Array.from({ length: last.children.length }, () => "<td><br></td>").join("");
    body.appendChild(row);
    sync();
  };

  const addColumn = () => {
    const table = currentTable();
    if (!table) return;
    for (const row of table.querySelectorAll("tr")) {
      const cell = document.createElement(row.querySelector("th") ? "th" : "td");
      cell.innerHTML = "<br>";
      row.appendChild(cell);
    }
    sync();
  };

  const deleteRow = () => {
    const node = window.getSelection()?.anchorNode ?? null;
    const el = node instanceof Element ? node : node?.parentElement;
    const row = el?.closest("tr");
    if (!row || !area.current?.contains(row)) return;
    // Removing the only row would leave a table with nothing in it and no way
    // to get a row back, so the last one stays.
    if ((row.parentElement?.children.length ?? 0) <= 1) return;
    row.remove();
    sync();
  };

  /**
   * Pasting from Word or a web page brings fonts, colours and often a whole
   * stylesheet. The server would strip most of it anyway; stripping it here
   * means what you see pasted is what will be stored.
   */
  const onPaste = (e: React.ClipboardEvent) => {
    e.preventDefault();
    const text = e.clipboardData.getData("text/plain");
    document.execCommand("insertText", false, text);
    sync();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (!(e.metaKey || e.ctrlKey)) return;
    if (e.key.toLowerCase() === "f") {
      e.preventDefault();
      setPanel((p) => (p === "find" ? "none" : "find"));
      return;
    }
    const hit = INLINE.find((c) => c.key && c.key.toLowerCase() === e.key.toLowerCase());
    if (hit) {
      e.preventDefault();
      exec(hit.cmd);
    }
  };

  const words = useMemo(() => {
    const text = stripped(html);
    return { words: text ? text.split(/\s+/).length : 0, characters: text.length };
  }, [html]);

  const select = "h-8 rounded-lg border border-line bg-surface px-1.5 text-xs font-bold text-ink-soft";

  return (
    <div className={bare ? "" : "overflow-hidden rounded-xl border border-line bg-surface"}>
      <div
        className={`sticky top-0 z-10 flex flex-wrap items-center gap-1.5 border-b border-line bg-canvas/95 px-2 py-1.5 backdrop-blur print:hidden ${
          bare ? "rounded-t-xl border-x border-t" : ""
        }`}
      >
        <Group items={HISTORY} active={active} exec={exec} />

        <select
          aria-label="Paragraph style"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            exec("formatBlock", e.target.value);
            e.target.selectedIndex = 0;
          }}
          className={select}
          defaultValue=""
        >
          <option value="" disabled>Style</option>
          {STYLES.map((s) => (
            <option key={s.tag} value={s.tag}>{s.label}</option>
          ))}
        </select>

        <select
          aria-label="Font"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) styleSelection({ fontFamily: e.target.value });
            e.target.selectedIndex = 0;
          }}
          className={select}
          defaultValue=""
        >
          <option value="" disabled>Font</option>
          {Object.entries(FONT_STACKS).map(([label, stack]) => (
            <option key={label} value={stack} style={{ fontFamily: stack }}>{label}</option>
          ))}
        </select>

        <select
          aria-label="Font size"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) styleSelection({ fontSize: `${e.target.value}pt` });
            e.target.selectedIndex = 0;
          }}
          className={select}
          defaultValue=""
        >
          <option value="" disabled>Size</option>
          {FONT_SIZES.map((pt) => (
            <option key={pt} value={pt}>{pt}</option>
          ))}
        </select>

        <Group items={INLINE} active={active} exec={exec} />

        <div className="flex items-center gap-0.5 border-r border-line pr-1.5">
          <Tool icon="text-colour" title="Text colour" on={panel === "colour"} onClick={() => setPanel((p) => (p === "colour" ? "none" : "colour"))} />
          <Tool icon="highlight" title="Highlight" on={panel === "highlight"} onClick={() => setPanel((p) => (p === "highlight" ? "none" : "highlight"))} />
        </div>

        <Group items={BLOCKS} active={active} exec={exec} />
        <Group items={ALIGN} active={active} exec={exec} />

        <select
          aria-label="Line spacing"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            if (e.target.value) styleBlocks({ lineHeight: e.target.value });
            e.target.selectedIndex = 0;
          }}
          className={select}
          defaultValue=""
        >
          <option value="" disabled>Spacing</option>
          {LINE_HEIGHTS.map((lh) => (
            <option key={lh} value={lh}>{lh.toFixed(2).replace(/\.?0+$/, "")}</option>
          ))}
        </select>

        <div className="flex items-center gap-0.5 border-r border-line pr-1.5">
          <Tool icon="table" title="Table" on={panel === "table"} onClick={() => setPanel((p) => (p === "table" ? "none" : "table"))} />
          <Tool icon="horizontal-rule" title="Insert a horizontal rule" onClick={() => exec("insertHorizontalRule")} />
          <Tool
            icon="link"
            title="Insert link"
            onClick={() => {
              // A modal dialog would block the extension's event loop; the
              // browser's own prompt keeps the caret and stays inside the page.
              const url = area.current?.ownerDocument.defaultView?.prompt("Link address", "https://");
              if (url) exec("createLink", url);
            }}
          />
          <Tool
            icon="eraser"
            title="Clear formatting"
            onClick={() => {
              exec("removeFormat");
              exec("formatBlock", "p");
            }}
          />
        </div>

        <div className="flex items-center gap-0.5">
          <Tool icon="find" title="Find and replace (⌘F)" on={panel === "find"} onClick={() => setPanel((p) => (p === "find" ? "none" : "find"))} />
          <Tool icon="print" title={pageView ? "Plain view" : "Page view"} on={pageView} onClick={() => setPageView((v) => !v)} />
        </div>
      </div>

      {panel === "colour" && (
        <Swatches
          label="Text colour"
          colours={TEXT_COLOURS}
          onPick={(c) => {
            exec("foreColor", c);
            setPanel("none");
          }}
          onClear={() => {
            exec("foreColor", "#191a2c");
            setPanel("none");
          }}
        />
      )}

      {panel === "highlight" && (
        <Swatches
          label="Highlight"
          colours={HIGHLIGHTS}
          onPick={(c) => {
            exec("hiliteColor", c);
            setPanel("none");
          }}
          onClear={() => {
            exec("hiliteColor", "transparent");
            setPanel("none");
          }}
        />
      )}

      {panel === "table" && <TablePanel onInsert={insertTable} onAddRow={addRow} onAddColumn={addColumn} onDeleteRow={deleteRow} />}

      {panel === "find" && <FindReplace area={area} onChanged={sync} onClose={() => setPanel("none")} />}

      <div className={`relative ${pageView ? "bg-canvas/70 px-3 py-5" : ""}`}>
        {empty && (
          <p
            className={`pointer-events-none absolute text-sm font-medium text-ink-soft/60 ${
              pageView ? "left-[calc(50%-10.5cm+2.54cm+0.75rem)] top-[calc(1.25rem+2.54cm)] max-[24cm]:left-[calc(1.4cm+1.5rem)]" : "px-4 py-3"
            }`}
          >
            {placeholder}
          </p>
        )}
        <div
          ref={area}
          id={id}
          contentEditable
          suppressContentEditableWarning
          role="textbox"
          aria-multiline="true"
          aria-label="Document body"
          onInput={sync}
          onBlur={sync}
          onPaste={onPaste}
          onKeyDown={onKeyDown}
          onKeyUp={refreshActive}
          onMouseUp={refreshActive}
          style={{ minHeight: pageView ? undefined : minHeight }}
          className={`doc-body w-full text-[15px] leading-relaxed font-medium outline-none ${
            pageView
              ? "doc-page"
              : `px-4 py-3 ${bare ? "rounded-b-xl border-x border-b border-line bg-surface" : ""}`
          }`}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-canvas/60 px-3 py-1.5 text-[11px] font-bold text-ink-soft print:hidden">
        <span>
          {words.words} word{words.words === 1 ? "" : "s"} · {words.characters} character
          {words.characters === 1 ? "" : "s"}
        </span>
        <span>{pageView ? "A4 · 2.54cm margins" : "Plain view"}</span>
      </div>

      {/* What the form submits. The editable div is not a form control. */}
      <input type="hidden" name={name} value={html} readOnly />
    </div>
  );
}

/**
 * A group of toolbar buttons, and a single one.
 *
 * ponytail: both of these were declared inside DocEditor. A component declared
 * in a render body is a *new component type* on every render, so React threw
 * the whole toolbar away and rebuilt it on every keystroke — the editor
 * re-renders per character to keep the hidden input in step. That is wasteful,
 * it loses any focus or pressed state the buttons hold, and it is the reason
 * the toolbar's element identities changed underneath anything watching them.
 */
function Group({
  items,
  active,
  exec,
}: {
  items: Cmd[];
  active: Record<string, boolean>;
  exec: (cmd: string, arg?: string) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 border-r border-line pr-1.5 last:border-0 last:pr-0">
      {items.map((c) => (
        <button
          key={c.cmd + (c.arg ?? "")}
          type="button"
          title={c.key ? `${c.title} (⌘${c.key})` : c.title}
          aria-label={c.title}
          aria-pressed={!!active[c.cmd]}
          // Keep the caret where it is: focus must not leave the editable region.
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => exec(c.cmd, c.arg)}
          className={`grid h-8 w-8 place-items-center rounded-lg transition ${
            active[c.cmd] ? "bg-brand-100 text-brand-800" : "text-ink-soft hover:bg-canvas hover:text-ink"
          }`}
        >
          <Icon name={c.icon} className="h-4 w-4" />
        </button>
      ))}
    </div>
  );
}

function Tool({
  icon,
  title,
  onClick,
  on = false,
}: {
  icon: IconName;
  title: string;
  onClick: () => void;
  on?: boolean;
}) {
  return (
    <button
      type="button"
      title={title}
      aria-label={title}
      aria-pressed={on}
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`grid h-8 w-8 place-items-center rounded-lg transition ${
        on ? "bg-brand-100 text-brand-800" : "text-ink-soft hover:bg-canvas hover:text-ink"
      }`}
    >
      <Icon name={icon} className="h-4 w-4" />
    </button>
  );
}

function Swatches({
  label,
  colours,
  onPick,
  onClear,
}: {
  label: string;
  colours: string[];
  onPick: (colour: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 print:hidden">
      <span className="text-[11px] font-bold tracking-wide text-ink-soft uppercase">{label}</span>
      {colours.map((c) => (
        <button
          key={c}
          type="button"
          title={c}
          aria-label={`${label} ${c}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => onPick(c)}
          style={{ background: c }}
          className="h-6 w-6 rounded-md ring-1 ring-line ring-inset transition hover:scale-110"
        />
      ))}
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={onClear}
        className="rounded-lg px-2 py-1 text-[11px] font-bold text-ink-soft hover:bg-canvas hover:text-ink"
      >
        Remove
      </button>
    </div>
  );
}

function TablePanel({
  onInsert,
  onAddRow,
  onAddColumn,
  onDeleteRow,
}: {
  onInsert: (rows: number, cols: number, header: boolean) => void;
  onAddRow: () => void;
  onAddColumn: () => void;
  onDeleteRow: () => void;
}) {
  const [rows, setRows] = useState(3);
  const [cols, setCols] = useState(3);
  const [header, setHeader] = useState(true);

  return (
    <div className="flex flex-wrap items-end gap-3 border-b border-line bg-surface px-3 py-2 print:hidden">
      <label className="grid gap-0.5 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
        Rows
        <input
          type="number"
          min={1}
          max={30}
          value={rows}
          onChange={(e) => setRows(Math.min(30, Math.max(1, Number(e.target.value) || 1)))}
          className="h-8 w-16 rounded-lg border border-line px-2 text-xs font-bold text-ink"
        />
      </label>
      <label className="grid gap-0.5 text-[11px] font-bold tracking-wide text-ink-soft uppercase">
        Columns
        <input
          type="number"
          min={1}
          max={10}
          value={cols}
          onChange={(e) => setCols(Math.min(10, Math.max(1, Number(e.target.value) || 1)))}
          className="h-8 w-16 rounded-lg border border-line px-2 text-xs font-bold text-ink"
        />
      </label>
      <label className="flex items-center gap-1.5 pb-1.5 text-xs font-bold text-ink-soft">
        <input type="checkbox" checked={header} onChange={(e) => setHeader(e.target.checked)} className="h-4 w-4 accent-brand-600" />
        Header row
      </label>
      <button
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onInsert(rows, cols, header)}
        className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-bold text-on-brand hover:bg-brand-700"
      >
        Insert table
      </button>
      <span className="ml-auto flex gap-1">
        {[
          ["Add row", onAddRow],
          ["Add column", onAddColumn],
          ["Delete row", onDeleteRow],
        ].map(([label, fn]) => (
          <button
            key={label as string}
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={fn as () => void}
            className="h-8 rounded-lg bg-canvas px-2.5 text-[11px] font-bold text-ink-soft hover:bg-line/40 hover:text-ink"
          >
            {label as string}
          </button>
        ))}
      </span>
    </div>
  );
}

/**
 * Find and replace, over the editable region's text nodes.
 *
 * Deliberately not `window.find()`: that scrolls the whole page, matches the
 * interface around the document as well as the document, and cannot replace.
 */
function FindReplace({
  area,
  onChanged,
  onClose,
}: {
  area: React.RefObject<HTMLDivElement | null>;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [needle, setNeedle] = useState("");
  const [replacement, setReplacement] = useState("");
  const [note, setNote] = useState<string | null>(null);

  const count = () => {
    const text = area.current?.textContent ?? "";
    if (!needle) return 0;
    return text.split(needle).length - 1;
  };

  const replaceAll = () => {
    const root = area.current;
    if (!root || !needle) return;
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    let replaced = 0;
    const nodes: Text[] = [];
    for (let n = walker.nextNode() as Text | null; n; n = walker.nextNode() as Text | null) nodes.push(n);
    for (const node of nodes) {
      if (!node.data.includes(needle)) continue;
      replaced += node.data.split(needle).length - 1;
      node.data = node.data.split(needle).join(replacement);
    }
    onChanged();
    setNote(replaced ? `Replaced ${replaced} occurrence${replaced === 1 ? "" : "s"}.` : "Nothing matched.");
  };

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2 print:hidden">
      <input
        autoFocus
        value={needle}
        onChange={(e) => {
          setNeedle(e.target.value);
          setNote(null);
        }}
        placeholder="Find…"
        className="h-8 w-40 rounded-lg border border-line px-2 text-xs font-bold text-ink"
      />
      <input
        value={replacement}
        onChange={(e) => setReplacement(e.target.value)}
        placeholder="Replace with…"
        className="h-8 w-40 rounded-lg border border-line px-2 text-xs font-bold text-ink"
      />
      <button
        type="button"
        onClick={replaceAll}
        disabled={!needle}
        className="h-8 rounded-lg bg-brand-600 px-3 text-xs font-bold text-on-brand disabled:opacity-40"
      >
        Replace all
      </button>
      <span className="text-[11px] font-bold text-ink-soft">
        {note ?? (needle ? `${count()} match${count() === 1 ? "" : "es"}` : "")}
      </span>
      <button type="button" onClick={onClose} className="ml-auto rounded-lg px-2 py-1 text-[11px] font-bold text-ink-soft hover:bg-canvas">
        Close
      </button>
    </div>
  );
}

/** Visible text only — used to decide whether the placeholder should show. */
function stripped(html: string) {
  return html
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}
