"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { Icon, type IconName } from "@/components/icons";

/**
 * The document body editor — a word processor for quote terms.
 *
 * ponytail: terms were composed in a <textarea> and rendered with
 * whitespace-pre-wrap, so a quote could not carry a numbered payment clause or
 * a bold delivery condition — on a document a rep prints and sends to a
 * customer. Shared shape with the ERP's document editor.
 *
 * `document.execCommand` is deprecated and still the only formatting API every
 * browser implements. The alternative is a document model of our own or a large
 * dependency; neither is worth it for bold, lists and alignment. Nothing here
 * trusts what it produces — the server sanitises the HTML on the way in
 * (lib/sanitize-html.ts), which is where the security actually lives.
 */

type Cmd = { icon: IconName; title: string; cmd: string; arg?: string; key?: string };

const INLINE: Cmd[] = [
  { icon: "bold", title: "Bold", cmd: "bold", key: "B" },
  { icon: "italic", title: "Italic", cmd: "italic", key: "I" },
  { icon: "underline", title: "Underline", cmd: "underline", key: "U" },
  { icon: "strikethrough", title: "Strikethrough", cmd: "strikeThrough" },
];

const BLOCKS: Cmd[] = [
  { icon: "list-bullet", title: "Bulleted list", cmd: "insertUnorderedList" },
  { icon: "list-number", title: "Numbered list", cmd: "insertOrderedList" },
  { icon: "quote", title: "Quote", cmd: "formatBlock", arg: "blockquote" },
];

const ALIGN: Cmd[] = [
  { icon: "align-left", title: "Align left", cmd: "justifyLeft" },
  { icon: "align-center", title: "Centre", cmd: "justifyCenter" },
  { icon: "align-right", title: "Align right", cmd: "justifyRight" },
];

const STYLES = [
  { label: "Body text", tag: "p" },
  { label: "Heading 1", tag: "h1" },
  { label: "Heading 2", tag: "h2" },
  { label: "Heading 3", tag: "h3" },
];

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

  const exec = (cmd: string, arg?: string) => {
    area.current?.focus();
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
   * Pasting from Word or a web page brings fonts, colours and often a whole
   * stylesheet. The server would strip all of it anyway; stripping it here
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
    const hit = INLINE.find((c) => c.key && c.key.toLowerCase() === e.key.toLowerCase());
    if (hit) {
      e.preventDefault();
      exec(hit.cmd);
    }
  };

  const Group = ({ items }: { items: Cmd[] }) => (
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

  return (
    <div className={bare ? "" : "overflow-hidden rounded-xl border border-line bg-surface"}>
      <div
        className={`flex flex-wrap items-center gap-1.5 border-b border-line bg-canvas/60 px-2 py-1.5 print:hidden ${
          bare ? "rounded-t-xl border-x border-t" : ""
        }`}
      >
        <select
          aria-label="Paragraph style"
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            exec("formatBlock", e.target.value);
            e.target.selectedIndex = 0;
          }}
          className="h-8 rounded-lg border border-line bg-surface px-2 text-xs font-bold text-ink-soft"
          defaultValue=""
        >
          <option value="" disabled>
            Style
          </option>
          {STYLES.map((s) => (
            <option key={s.tag} value={s.tag}>
              {s.label}
            </option>
          ))}
        </select>

        <Group items={INLINE} />
        <Group items={BLOCKS} />
        <Group items={ALIGN} />

        <div className="flex items-center gap-0.5">
          <button
            type="button"
            title="Insert link"
            aria-label="Insert link"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              // A modal dialog would block the extension's event loop; an inline
              // field keeps the caret and stays inside the page.
              const url = area.current?.ownerDocument.defaultView?.prompt("Link address", "https://");
              if (url) exec("createLink", url);
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition hover:bg-canvas hover:text-ink"
          >
            <Icon name="link" className="h-4 w-4" />
          </button>
          <button
            type="button"
            title="Clear formatting"
            aria-label="Clear formatting"
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => {
              exec("removeFormat");
              exec("formatBlock", "p");
            }}
            className="grid h-8 w-8 place-items-center rounded-lg text-ink-soft transition hover:bg-canvas hover:text-ink"
          >
            <Icon name="eraser" className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="relative">
        {empty && (
          <p className="pointer-events-none absolute px-4 py-3 text-sm font-medium text-ink-soft/60">{placeholder}</p>
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
          style={{ minHeight }}
          className={`doc-body w-full px-4 py-3 text-[15px] leading-relaxed font-medium outline-none ${
            bare ? "rounded-b-xl border-x border-b border-line bg-surface" : ""
          }`}
        />
      </div>

      {/* What the form submits. The editable div is not a form control. */}
      <input type="hidden" name={name} value={html} readOnly />
    </div>
  );
}

/** Visible text only — used to decide whether the placeholder should show. */
function stripped(html: string) {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/g, " ")
    .trim();
}
