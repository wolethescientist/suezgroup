"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { BTN, VARIANTS, type Variant } from "./button-styles";

export type ActionResult = { error?: string; ok?: boolean; message?: string } | void;
export type Action = (fd: FormData) => Promise<ActionResult>;

/**
 * Fired on every form inside a dialog when the dialog closes.
 *
 * Not the native `reset` event: React 19 resets an uncontrolled form by itself
 * once its action settles, so listening for `reset` would also fire on a failed
 * submit — which wiped the very error message the user needed to read.
 */
const DISCARD = "suez:discard";

/**
 * Puts back what the user submitted, after the post-action reset threw it away.
 *
 * Two things clear the form once a server action settles: React 19 resets an
 * uncontrolled form, and Next re-renders the server tree, which can remount the
 * client component and take its state with it. Neither lands at a predictable
 * moment, so this is retried over a few frames and reports which fields are
 * already correct so the caller can stop.
 *
 * Text inputs are only filled when blank, so a late pass can never overwrite
 * fresh typing. Selects are set through the native setter and given a change
 * event, which is what a controlled <Select> needs to pick the value back up.
 */
const nativeValue = (el: HTMLElement, v: string) => {
  const proto =
    el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype
    : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype
    : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, "value")?.set?.call(el, v);
};

function restore(form: HTMLFormElement, entries: [string, string][], done: Set<string>) {
  const byName = new Map<string, string[]>();
  for (const [k, v] of entries) byName.set(k, [...(byName.get(k) ?? []), v]);

  for (const [name, values] of byName) {
    if (done.has(name)) continue;
    const fields = [
      ...form.querySelectorAll<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
        `[name="${CSS.escape(name)}"]`,
      ),
    ];
    if (!fields.length) continue;

    const boxes = fields.filter(
      (f) => f instanceof HTMLInputElement && (f.type === "checkbox" || f.type === "radio"),
    ) as HTMLInputElement[];
    if (boxes.length) {
      for (const b of boxes) b.checked = values.includes(b.value);
      done.add(name);
      continue;
    }

    let settled = true;
    fields.forEach((f, i) => {
      if (f instanceof HTMLInputElement && f.type === "file") return;
      const v = values[i] ?? values[0];
      if (v === undefined) return;
      if (f instanceof HTMLSelectElement) {
        if (f.value === v) return;
        if (![...f.options].some((o) => o.value === v)) return;
        nativeValue(f, v);
        f.dispatchEvent(new Event("change", { bubbles: true }));
        settled = false;
        return;
      }
      if (f.value === v) return;
      if (f.value !== "") return; // the user has started retyping — leave it alone
      nativeValue(f, v);
      f.dispatchEvent(new Event("input", { bubbles: true }));
      settled = false;
    });
    if (settled) done.add(name);
  }
}

/**
 * Form + server action + inline error + auto-close of the surrounding <dialog>.
 * ponytail: replaces a toast system, a modal context and per-form useState.
 */
export function ActionForm({
  action,
  children,
  className = "",
  reset,
  id,
}: {
  action: Action;
  children: ReactNode;
  className?: string;
  reset?: boolean;
  id?: string;
}) {
  const ref = useRef<HTMLFormElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  // Closing the dialog discards the draft, banners included, so a reopened
  // dialog never shows the last attempt's message.
  useEffect(() => {
    const form = ref.current;
    if (!form) return;
    const clear = () => {
      setError(null);
      setNote(null);
    };
    form.addEventListener(DISCARD, clear);
    return () => form.removeEventListener(DISCARD, clear);
  }, []);

  return (
    <form
      ref={ref}
      id={id}
      className={className}
      action={async (fd) => {
        const typed = [...fd.entries()].filter(([, v]) => typeof v === "string") as [string, string][];
        const res = await action(fd);
        if (res?.error) {
          setNote(null);
          setError(res.error);
          // React 19 clears an uncontrolled form once the action settles. When
          // the action rejected the submission that would throw away everything
          // the user typed, leaving them an error and an empty form.
          // After React's own reset and the RSC re-render, neither of which
          // lands at a predictable moment — so try over a few frames. restore()
          // only fills blanks, so a late pass cannot clobber fresh typing.
          const form = ref.current;
          if (form) {
            const done = new Set<string>();
            for (const ms of [0, 60, 200, 500]) setTimeout(() => restore(form, typed, done), ms);
          }
          return;
        }
        setError(null);
        if (reset) ref.current?.reset();
        // A message means "stay open and say so"; otherwise close the dialog.
        if (res?.message) setNote(res.message);
        else ref.current?.closest("dialog")?.close();
      }}
    >
      {error && (
        <p className="mb-3 rounded-xl bg-rose-50 px-3 py-2 text-sm font-semibold text-rose-700 ring-1 ring-rose-200 ring-inset">
          {error}
        </p>
      )}
      {note && (
        <p className="mb-3 rounded-xl bg-emerald-50 px-3 py-2 text-sm font-semibold text-emerald-700 ring-1 ring-emerald-200 ring-inset">
          {note}
        </p>
      )}
      {children}
    </form>
  );
}


/**
 * A <select> that survives a re-render.
 *
 * ponytail: React re-applies `defaultValue` to a <select> on every commit —
 * unlike <input>, where it is only the initial value. So an uncontrolled
 * `<select defaultValue>` inside a form that re-renders (which ActionForm does
 * the moment a server action returns an error) silently snaps back to its
 * default while the inputs beside it keep what the user typed. That turned a
 * rejected "goods out" into a goods-in receipt. Holding the value in state
 * fixes it, and also survives React 19's own post-action reset, so a rejected
 * submission keeps the movement type the user actually chose.
 */
export function Select({
  defaultValue = "",
  children,
  onChange,
  ...rest
}: React.SelectHTMLAttributes<HTMLSelectElement> & { children: ReactNode }) {
  const ref = useRef<HTMLSelectElement>(null);
  const [value, setValue] = useState(String(defaultValue));

  useEffect(() => {
    const form = ref.current?.form;
    if (!form) return;
    const onDiscard = () => setValue(String(defaultValue));
    form.addEventListener(DISCARD, onDiscard);
    return () => form.removeEventListener(DISCARD, onDiscard);
  }, [defaultValue]);

  return (
    <select
      {...rest}
      ref={ref}
      value={value}
      onChange={(e) => {
        setValue(e.target.value);
        onChange?.(e);
      }}
    >
      {children}
    </select>
  );
}

export function SubmitBtn({
  children,
  variant = "primary",
  className = "",
  name,
  value,
  form,
}: {
  children: ReactNode;
  variant?: Variant;
  className?: string;
  name?: string;
  value?: string;
  form?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      name={name}
      value={value}
      form={form}
      disabled={pending}
      className={`${BTN} ${VARIANTS[variant]} ${className}`}
    >
      {pending && (
        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
      )}
      {children}
    </button>
  );
}

/** Native <dialog> — no portal, no focus-trap library, Esc closes it for free. */
export function Dialog({
  label,
  title,
  description,
  children,
  variant = "primary",
  className = "",
  width = "max-w-lg",
}: {
  label: ReactNode;
  title: string;
  description?: string;
  children: ReactNode;
  variant?: Variant;
  className?: string;
  width?: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  return (
    <>
      <button type="button" onClick={() => ref.current?.showModal()} className={`${BTN} ${VARIANTS[variant]} ${className}`}>
        {label}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => {
          if (e.target === ref.current) ref.current?.close();
        }}
        // Closing throws the draft away. Without this the next open still holds
        // the last attempt's text, and typing again appends to it — which is how
        // a decision note ended up saved twice over.
        onClose={() =>
          ref.current?.querySelectorAll("form").forEach((f) => {
            f.reset();
            f.dispatchEvent(new Event(DISCARD));
          })
        }
        className={`card m-auto w-[calc(100vw-2rem)] ${width} p-0 backdrop:bg-scrim/60 backdrop:backdrop-blur-sm open:rise`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            <h3 className="font-bold">{title}</h3>
            {description && <p className="mt-0.5 text-xs font-medium text-ink-soft">{description}</p>}
          </div>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            aria-label="Close"
            className="-mt-1 -mr-1 rounded-lg px-2 py-1 text-lg leading-none text-ink-soft hover:bg-canvas"
          >
            ×
          </button>
        </div>
        <div className="max-h-[75vh] overflow-y-auto p-5">{children}</div>
      </dialog>
    </>
  );
}

/**
 * Submit button for something that cannot be undone: it asks first.
 *
 * Sits inside the form it submits, so `form.requestSubmit()` runs the same
 * server action a plain SubmitBtn would. `confirmWord` adds a type-to-confirm
 * box for deletes that cascade (a department takes its staff assignments with
 * it, a vendor its order history).
 */
export function ConfirmBtn({
  children,
  title,
  body,
  confirmLabel = "Delete",
  confirmWord,
  variant = "ghost",
  className = "",
  name,
  value,
}: {
  children: ReactNode;
  title: string;
  body: string;
  confirmLabel?: string;
  confirmWord?: string;
  variant?: Variant;
  className?: string;
  name?: string;
  value?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const [typed, setTyped] = useState("");
  const { pending } = useFormStatus();
  const blocked = confirmWord ? typed.trim().toLowerCase() !== confirmWord.trim().toLowerCase() : false;

  const go = () => {
    if (blocked) return;
    const form = trigger.current?.form;
    dialog.current?.close();
    setTyped("");
    if (!form) return;
    // Carry the button's name/value the way a real submitter would.
    if (name) {
      const carrier = document.createElement("input");
      carrier.type = "hidden";
      carrier.name = name;
      carrier.value = value ?? "";
      carrier.dataset.confirmCarrier = "1";
      form.appendChild(carrier);
    }
    form.requestSubmit();
  };

  return (
    <>
      <button
        type="button"
        ref={trigger}
        disabled={pending}
        onClick={() => {
          setTyped("");
          dialog.current?.showModal();
        }}
        className={`${BTN} ${VARIANTS[variant]} ${className}`}
      >
        {children}
      </button>
      <dialog
        ref={dialog}
        onClick={(e) => {
          if (e.target === dialog.current) dialog.current?.close();
        }}
        onClose={() => setTyped("")}
        className="card m-auto w-[calc(100vw-2rem)] max-w-sm p-0 backdrop:bg-scrim/70 backdrop:backdrop-blur-sm open:rise"
      >
        <div className="border-b border-line px-5 py-4">
          <h3 className="font-bold">{title}</h3>
        </div>
        <div className="space-y-4 p-5">
          <p className="text-sm text-ink-soft">{body}</p>
          {confirmWord && (
            <label className="block">
              <span className="mb-1.5 block text-xs font-bold text-ink-soft">
                Type <span className="text-ink">{confirmWord}</span> to confirm
              </span>
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                className="field w-full"
              />
            </label>
          )}
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => dialog.current?.close()}
              className={`${BTN} ${VARIANTS.ghost}`}
            >
              Cancel
            </button>
            <button type="button" onClick={go} disabled={blocked} className={`${BTN} ${VARIANTS.danger}`}>
              {confirmLabel}
            </button>
          </div>
        </div>
      </dialog>
    </>
  );
}

/** Keeps a text input's value in sync with the URL, for list filtering. */
export function SearchInput({ name = "q", defaultValue = "", placeholder = "Search…" }) {
  return (
    <form className="relative">
      <input
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        className="field w-full pl-9 sm:w-64"
        autoComplete="off"
      />
      <span className="pointer-events-none absolute top-2.5 left-3 text-sm text-ink-soft">⌕</span>
    </form>
  );
}
