"use client";

import { useState } from "react";
import { ActionForm, Dialog, Select, SubmitBtn, type Action } from "@/components/form";
import { Field, Row } from "@/components/ui";
import { Icon } from "@/components/icons";
import { LineEditor, type Line } from "./line-editor";
import { DocEditor } from "./doc-editor";

export type Opt = { id: number; label: string };
const opts = (list: Opt[]) => list.map((o) => <option key={o.id} value={o.id}>{o.label}</option>);
const today = () => new Date().toISOString().slice(0, 10);

const SOURCES = ["website", "web_form", "referral", "event", "cold_call", "campaign", "linkedin", "email", "whatsapp", "sms", "social", "other"];

export function LeadForm({ action, owners, lead }: {
  action: Action; owners: Opt[];
  lead?: { id: number; full_name: string; company_name: string | null; job_title: string | null; email: string | null; phone: string | null; source: string; status: string; industry: string | null; estimated_value: string; notes: string | null; owner_id: number | null };
}) {
  return (
    <Dialog label={lead ? "Edit" : <><Icon name="plus" /> New lead</>} variant={lead ? "ghost" : "primary"}
            title={lead ? "Edit lead" : "New lead"} width="max-w-xl">
      <ActionForm action={action} className="space-y-4">
        {lead && <input type="hidden" name="id" value={lead.id} />}
        <Row>
          <Field label="Full name"><input name="full_name" required defaultValue={lead?.full_name} className="field" /></Field>
          <Field label="Job title"><input name="job_title" defaultValue={lead?.job_title ?? ""} className="field" placeholder="e.g. Head of Operations" /></Field>
        </Row>
        <Row>
          <Field label="Company"><input name="company_name" defaultValue={lead?.company_name ?? ""} className="field" /></Field>
          <Field label="Industry"><input name="industry" defaultValue={lead?.industry ?? ""} className="field" /></Field>
        </Row>
        <Row>
          <Field label="Email"><input name="email" type="email" defaultValue={lead?.email ?? ""} className="field" /></Field>
          <Field label="Phone"><input name="phone" defaultValue={lead?.phone ?? ""} className="field" /></Field>
        </Row>
        <Row>
          <Field label="Source" hint="Referrals and inbound score higher.">
            <Select name="source" className="field" defaultValue={lead?.source ?? "other"}>
              {SOURCES.map((s) => <option key={s} value={s}>{s.replace("_", " ")}</option>)}
            </Select>
          </Field>
          <Field label="Estimated value"><input name="estimated_value" type="number" step="0.01" min="0" defaultValue={lead?.estimated_value ?? 0} className="field" /></Field>
        </Row>
        <Row>
          <Field label="Status">
            <Select name="status" className="field" defaultValue={lead?.status ?? "new"}>
              {["new", "contacted", "qualified", "unqualified"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
          <Field label="Owner"><Select name="owner_id" className="field" defaultValue={lead?.owner_id ?? ""}><option value="">Me</option>{opts(owners)}</Select></Field>
        </Row>
        <Field label="Notes"><textarea name="notes" rows={3} defaultValue={lead?.notes ?? ""} className="field resize-y" /></Field>
        <SubmitBtn className="w-full">{lead ? "Save lead" : "Add lead"}</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export type QuoteRecord = {
  id: number; title: string; company_id: number | null; contact_id: number | null; deal_id: number | null;
  issue_date: string; valid_until: string | null; currency: string; discount: string; tax_rate: string;
  terms: string | null; terms_html: string | null; status: string; version: number;
};

/**
 * Build a quote, or correct one.
 *
 * ponytail: this form only ever created. Editing a quote was impossible, so a
 * wrong figure meant deleting the quote and re-keying every line — and an
 * accepted quote could not even be deleted.
 *
 * The wording changes with how far the quote has travelled, because saving a
 * sent quote is not the same act as saving a draft: the customer is holding the
 * figures that are about to change.
 */
export function QuoteForm({ action, companies, contacts, deals, quote, lines }: {
  action: Action; companies: Opt[]; contacts: Opt[]; deals: Opt[];
  quote?: QuoteRecord; lines?: Line[];
}) {
  const editing = !!quote;
  const revising = quote?.status === "sent";
  return (
    <Dialog
      label={editing ? "Edit" : <><Icon name="plus" /> New quote</>}
      variant={editing ? "outline" : "primary"}
      title={editing ? (revising ? `Revise ${quote!.title}` : "Edit quote") : "Build a quote"}
      width="max-w-2xl"
      description={
        revising
          ? `The customer has been sent version ${quote!.version}. Saving freezes it and issues version ${quote!.version + 1}.`
          : undefined
      }
    >
      <ActionForm action={action} className="space-y-4">
        {editing && <input type="hidden" name="id" value={quote!.id} />}
        <Field label="Title"><input name="title" required defaultValue={quote?.title} className="field" placeholder="e.g. Water treatment plant — Phase 1" /></Field>
        {!editing && (
          <Row>
            <Field label="Company"><Select name="company_id" className="field" defaultValue=""><option value="">None</option>{opts(companies)}</Select></Field>
            <Field label="Contact"><Select name="contact_id" className="field" defaultValue=""><option value="">None</option>{opts(contacts)}</Select></Field>
          </Row>
        )}
        {!editing && (
          <Row>
            <Field label="Against opportunity"><Select name="deal_id" className="field" defaultValue=""><option value="">None</option>{opts(deals)}</Select></Field>
            <Field label="Currency"><input name="currency" defaultValue="NGN" className="field" /></Field>
          </Row>
        )}
        {editing && <Field label="Currency"><input name="currency" defaultValue={quote!.currency} className="field" /></Field>}
        <Row>
          <Field label="Issued"><input name="issue_date" type="date" defaultValue={quote?.issue_date ?? today()} className="field" /></Field>
          <Field label="Valid until"><input name="valid_until" type="date" defaultValue={quote?.valid_until ?? ""} className="field" /></Field>
        </Row>
        <LineEditor lines={lines} />
        <Row>
          {/* ponytail: this was labelled just "Discount", sat next to "VAT rate %", and
              is an absolute amount — so typing 5 for "5%" took NGN 5 off the quote and
              the document rendered "Discount −NGN 5" without complaint. */}
          <Field label="Discount (amount, not %)" hint="A flat figure off the subtotal, before VAT.">
            <input name="discount" type="number" step="0.01" min="0" defaultValue={quote?.discount ?? "0"} className="field" />
          </Field>
          <Field label="VAT rate %"><input name="tax_rate" type="number" step="0.01" defaultValue={quote?.tax_rate ?? "7.5"} className="field" /></Field>
        </Row>
        <Field label="Terms" hint="Formatting, numbered clauses and bold conditions print exactly as you see them.">
          <DocEditor name="terms_html" defaultValue={quote?.terms_html ?? textToHtml(quote?.terms ?? "")}
                     placeholder="Payment terms, delivery, validity…" minHeight="9rem" />
        </Field>
        {revising && (
          <Field label="What changed" hint={`Recorded against version ${quote!.version + 1} in the revision history.`}>
            <input name="note" className="field" placeholder="e.g. Unit price on line 2 corrected" />
          </Field>
        )}
        <SubmitBtn className="w-full">
          {revising ? `Issue version ${quote!.version + 1}` : editing ? "Save quote" : "Create quote"}
        </SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

/** Terms written before the editor existed are plain text; keep their line breaks. */
function textToHtml(text: string) {
  if (!text) return "";
  const escape = (v: string) => v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return text.split(/\n{2,}/).map((para) => `<p>${para.split("\n").map(escape).join("<br>")}</p>`).join("");
}

export function TicketForm({ action, companies, contacts, users }: {
  action: Action; companies: Opt[]; contacts: Opt[]; users: Opt[];
}) {
  return (
    <Dialog label={<><Icon name="plus" /> Raise ticket</>} title="New support ticket" width="max-w-xl">
      <ActionForm action={action} className="space-y-4">
        <Field label="Subject"><input name="subject" required className="field" /></Field>
        <Field label="Detail"><textarea name="body" rows={5} className="field resize-y" /></Field>
        <Row>
          <Field label="Company"><Select name="company_id" className="field" defaultValue=""><option value="">None</option>{opts(companies)}</Select></Field>
          <Field label="Contact"><Select name="contact_id" className="field" defaultValue=""><option value="">None</option>{opts(contacts)}</Select></Field>
        </Row>
        <Row>
          <Field label="Priority" hint="Sets the response target: urgent 4h, high 1 day, else 3 days.">
            <Select name="priority" className="field" defaultValue="normal">
              {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p}>{p}</option>)}
            </Select>
          </Field>
          <Field label="Channel">
            <Select name="channel" className="field" defaultValue="email">
              {["email", "phone", "portal", "meeting"].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
        </Row>
        <Field label="Assign to"><Select name="assignee_id" className="field" defaultValue=""><option value="">Me</option>{opts(users)}</Select></Field>
        <SubmitBtn className="w-full">Raise ticket</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export function CampaignForm({ action, campaign }: {
  action: Action;
  campaign?: { id: number; name: string; channel: string; status: string; start_date: string | null; end_date: string | null; budget: string; subject: string | null; body: string | null };
}) {
  return (
    <Dialog label={campaign ? "Edit" : <><Icon name="plus" /> New campaign</>} variant={campaign ? "ghost" : "primary"}
            title={campaign ? "Edit campaign" : "New campaign"} width="max-w-xl">
      <ActionForm action={action} className="space-y-4">
        {campaign && <input type="hidden" name="id" value={campaign.id} />}
        <Field label="Name"><input name="name" required defaultValue={campaign?.name} className="field" /></Field>
        <Row>
          <Field label="Channel">
            <Select name="channel" className="field" defaultValue={campaign?.channel ?? "email"}>
              {["email", "event", "social", "webinar", "print", "other"].map((c) => <option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Status">
            <Select name="status" className="field" defaultValue={campaign?.status ?? "draft"}>
              {["draft", "scheduled", "running", "completed", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
            </Select>
          </Field>
        </Row>
        <Row>
          <Field label="Starts"><input name="start_date" type="date" defaultValue={campaign?.start_date ?? ""} className="field" /></Field>
          <Field label="Ends"><input name="end_date" type="date" defaultValue={campaign?.end_date ?? ""} className="field" /></Field>
        </Row>
        <Field label="Budget"><input name="budget" type="number" step="0.01" min="0" defaultValue={campaign?.budget ?? 0} className="field" /></Field>
        <Field label="Subject line"><input name="subject" defaultValue={campaign?.subject ?? ""} className="field" /></Field>
        <Field label="Message"><textarea name="body" rows={6} defaultValue={campaign?.body ?? ""} className="field resize-y" /></Field>
        <SubmitBtn className="w-full">{campaign ? "Save campaign" : "Create campaign"}</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}

export function SegmentForm({ action }: { action: Action }) {
  const [entity, setEntity] = useState("company");
  return (
    <Dialog label={<><Icon name="plus" /> New segment</>} title="Save a segment"
            description="A named filter your team can reuse when building an audience.">
      <ActionForm action={action} className="space-y-4">
        <Field label="Name"><input name="name" required className="field" placeholder="e.g. Lagos banks at risk" /></Field>
        <Field label="Over">
          <select name="entity" value={entity} onChange={(e) => setEntity(e.target.value)} className="field">
            <option value="company">Companies</option>
            <option value="contact">Contacts</option>
            <option value="lead">Leads</option>
          </select>
        </Field>
        <Field label="Relationship">
          <Select name="status" className="field" defaultValue="">
            <option value="">Any</option>
            {["lead", "prospect", "customer", "churned"].map((s) => <option key={s} value={s}>{s}</option>)}
          </Select>
        </Field>
        <Field label="Industry contains"><input name="industry" className="field" placeholder="e.g. Banking" /></Field>
        <Field label="Health">
          <Select name="health" className="field" defaultValue="">
            <option value="">Any</option>
            {["good", "at_risk", "critical"].map((h) => <option key={h} value={h}>{h.replace("_", " ")}</option>)}
          </Select>
        </Field>
        <SubmitBtn className="w-full">Save segment</SubmitBtn>
      </ActionForm>
    </Dialog>
  );
}
