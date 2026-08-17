"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";

type Source = { label: string; href: string };
type Message = { role: "assistant" | "user"; text: string; sources?: Source[] };

const QUICK_QUESTIONS = ["What does Suez do?", "Tell me about Software and ICT", "I need cooking gas"];

const SOURCES = {
  group: { label: "About the group", href: "/about" },
  companies: { label: "Services & companies", href: "/companies" },
  gas: { label: "Gas services", href: "/companies#gas" },
  electric: { label: "Electric services", href: "/companies#electric" },
  software: { label: "Software services", href: "/companies#software" },
  ict: { label: "ICT services", href: "/companies#ict" },
  trading: { label: "Trading services", href: "/companies#trading" },
  contact: { label: "Contact the group", href: "/contact" },
} satisfies Record<string, Source>;

function answerQuestion(question: string): { text: string; sources: Source[] } {
  const input = question.toLowerCase();

  if (input.includes("gas") || input.includes("cylinder") || input.includes("lpg")) {
    return { text: "Suez Gas Nigeria handles LPG distribution, cylinder refills, doorstep delivery and commercial gas for homes and businesses.", sources: [SOURCES.gas] };
  }
  if (input.includes("electric") || input.includes("power") || input.includes("token") || input.includes("meter")) {
    return { text: "SuezElectric provides prepaid electricity tokens, wallets and agent kiosks for easier power payments.", sources: [SOURCES.electric] };
  }
  if ((input.includes("software") && input.includes("ict")) || (input.includes("software") && input.includes("technology"))) {
    return { text: "Suez Software covers digital products and platforms; Suez ICT covers connectivity, systems and technical infrastructure. Together they form the group’s digital layer.", sources: [SOURCES.software, SOURCES.ict] };
  }
  if (input.includes("software") || input.includes("app") || input.includes("platform")) {
    return { text: "Suez Software focuses on digital products and software platforms that support the group’s services and operating network.", sources: [SOURCES.software] };
  }
  if (input.includes("ict") || input.includes("technology") || input.includes("tech") || input.includes("infrastructure")) {
    return { text: "Suez ICT covers connectivity, systems, technical support and the infrastructure that keeps the group’s digital work running.", sources: [SOURCES.ict] };
  }
  if (input.includes("trading") || input.includes("haulage") || input.includes("bulk") || input.includes("import")) {
    return { text: "Suez Trading International is the group’s upstream lane for LPG importation and bulk road-tanker haulage.", sources: [SOURCES.trading] };
  }
  if (input.includes("contact") || input.includes("partner") || input.includes("invest") || input.includes("supplier")) {
    return { text: "For partnerships, supply, investment and general enquiries, the group office is the right starting point.", sources: [SOURCES.contact] };
  }

  return {
    text: "Suez Group connects Software, ICT, Gas, Trading and Electric services through one operating network. Ask me about one of those lanes and I’ll point you to the right page.",
    sources: [SOURCES.companies, SOURCES.group],
  };
}

export function SiteChat() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [messages, setMessages] = useState<Message[]>([
    { role: "assistant", text: "Hi. I’m the Suez guide. Ask about our services, companies or how to reach the right team.", sources: [SOURCES.companies] },
  ]);

  function submit(question: string) {
    const clean = question.trim();
    if (!clean) return;
    const answer = answerQuestion(clean);
    setMessages((current) => [...current, { role: "user", text: clean }, { role: "assistant", ...answer }]);
    setValue("");
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    submit(value);
  }

  return (
    <div className="site-chat">
      {open && (
        <section className="site-chat-panel" aria-label="Suez guide chatbot">
          <div className="site-chat-head">
            <div><span className="site-chat-status" /> <strong>Suez guide</strong><small>On-site answers</small></div>
            <button type="button" onClick={() => setOpen(false)} aria-label="Close Suez guide">×</button>
          </div>
          <div className="site-chat-messages" aria-live="polite">
            {messages.map((message, index) => (
              <div key={`${message.role}-${index}`} className={`site-chat-message ${message.role === "user" ? "is-user" : "is-assistant"}`}>
                <p>{message.text}</p>
                {message.sources?.length ? <div className="site-chat-sources">{message.sources.map((source) => <Link key={source.href} href={source.href}>{source.label} ↗</Link>)}</div> : null}
              </div>
            ))}
          </div>
          <div className="site-chat-quick">{QUICK_QUESTIONS.map((question) => <button key={question} type="button" onClick={() => submit(question)}>{question}</button>)}</div>
          <form className="site-chat-form" onSubmit={handleSubmit}>
            <label className="sr-only" htmlFor="suez-chat-question">Ask the Suez guide</label>
            <input id="suez-chat-question" value={value} onChange={(event) => setValue(event.target.value)} placeholder="Ask a question" />
            <button type="submit" aria-label="Send question">↗</button>
          </form>
          <small className="site-chat-disclaimer">Answers are based on the information published on this site.</small>
        </section>
      )}
      <button type="button" className={`site-chat-launcher ${open ? "is-open" : ""}`} onClick={() => setOpen((current) => !current)} aria-expanded={open} aria-label={open ? "Close Suez guide" : "Open Suez guide"}>
        <span className="site-chat-launcher-mark">?</span><span>{open ? "Close guide" : "Ask Suez"}</span>
      </button>
    </div>
  );
}
