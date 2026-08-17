"use client";

import { FormEvent, useState } from "react";

type Status = "idle" | "opening" | "ready";

export function ContactForm() {
  const [status, setStatus] = useState<Status>("idle");

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    if (!form.reportValidity()) return;

    const data = new FormData(form);
    const subject = `${data.get("topic") || "Group enquiry"} - ${data.get("name") || "Website enquiry"}`;
    const body = [
      `Name: ${data.get("name") || ""}`,
      `Organisation: ${data.get("organisation") || ""}`,
      `Email: ${data.get("email") || ""}`,
      `Phone: ${data.get("phone") || ""}`,
      "",
      String(data.get("message") || ""),
    ].join("\n");

    setStatus("opening");
    window.location.href = `mailto:info@suezgas.com?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.setTimeout(() => setStatus("ready"), 500);
  }

  return (
    <form className="mt-10 space-y-8" onSubmit={handleSubmit}>
      <div className="grid gap-8 sm:grid-cols-2">
        <p className="field">
          <label htmlFor="g-name">Full name</label>
          <input id="g-name" name="name" type="text" autoComplete="name" required />
        </p>
        <p className="field">
          <label htmlFor="g-org">Organisation</label>
          <input id="g-org" name="organisation" type="text" autoComplete="organization" />
        </p>
      </div>
      <div className="grid gap-8 sm:grid-cols-2">
        <p className="field">
          <label htmlFor="g-email">Email</label>
          <input id="g-email" name="email" type="email" autoComplete="email" required />
        </p>
        <p className="field">
          <label htmlFor="g-phone">Phone</label>
          <input id="g-phone" name="phone" type="tel" autoComplete="tel" />
        </p>
      </div>
      <p className="field">
        <label htmlFor="g-topic">Nature of enquiry</label>
        <select id="g-topic" name="topic" defaultValue="partnership">
          <option value="partnership">Partnership or integration</option>
          <option value="supply">Supply or off-take</option>
          <option value="investment">Investment</option>
          <option value="press">Press or media</option>
          <option value="careers">Careers</option>
          <option value="other">Something else</option>
        </select>
      </p>
      <p className="field">
        <label htmlFor="g-message">Message</label>
        <textarea id="g-message" name="message" required />
      </p>
      <div className="flex flex-wrap items-center gap-5">
        <button type="submit" className="btn btn-ember w-full sm:w-auto" disabled={status === "opening"}>
          {status === "opening" ? "Opening email" : "Send enquiry"}
        </button>
        <p className="text-[0.6875rem] uppercase tracking-[0.075em] text-fg-slate-muted" aria-live="polite">
          {status === "ready" ? "Draft prepared. Complete it in your email app." : "Customer orders are faster on the numbers to the left."}
        </p>
      </div>
    </form>
  );
}
