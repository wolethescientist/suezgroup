import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDate } from "@/lib/format";
import { Avatar, Badge, Card, CardTitle, Field, PageHeader, Row, Stat } from "@/components/ui";
import { ActionForm, Select, SubmitBtn } from "@/components/form";
import { acknowledgeAppraisal, saveGoal, saveReviewerReview, saveSelfReview, updateGoal } from "@/lib/actions/hr";

const SCORES = [
  [5, "5 — Consistently exceeds expectations"],
  [4, "4 — Often exceeds expectations"],
  [3, "3 — Meets expectations"],
  [2, "2 — Partially meets expectations"],
  [1, "1 — Below expectations"],
] as const;

/** A descriptive browser tab, so history and bookmarks are distinguishable. */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [r] = await sql<{ name: string }>`select c.name from appraisals a join appraisal_cycles c on c.id = a.cycle_id where a.id = ${Number(id)}`;
  return { title: r ? `Appraisal — ${r.name}` : "Not found" };
}

export default async function AppraisalPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const { id } = await params;

  const [a] = await sql<{
    id: number; user_id: number; reviewer_id: number | null; status: string;
    self_review: string | null; reviewer_review: string | null; self_score: number | null; reviewer_score: number | null;
    cycle: string; period_start: string; period_end: string;
    who: string; who_avatar: string | null; who_title: string | null; reviewer: string | null;
  }>`
    select a.*, c.name as cycle, c.period_start, c.period_end,
           u.full_name as who, u.avatar_url as who_avatar, u.job_title as who_title, r.full_name as reviewer
      from appraisals a
      join appraisal_cycles c on c.id = a.cycle_id
      join users u on u.id = a.user_id
      left join users r on r.id = a.reviewer_id
     where a.id = ${Number(id)}`;
  if (!a) notFound();

  const isSubject = a.user_id === me.id;
  const isReviewer = a.reviewer_id === me.id || can(me, "appraisal.cycle");
  if (!isSubject && !isReviewer) notFound();

  const goals = await sql<{ id: number; title: string; weight: number; progress: number; notes: string | null }>`
    select * from appraisal_goals where appraisal_id = ${a.id} order by id`;

  const weighted = goals.length
    ? Math.round(goals.reduce((s, g) => s + g.progress * g.weight, 0) / Math.max(1, goals.reduce((s, g) => s + g.weight, 0)))
    : 0;

  return (
    <>
      <PageHeader title={a.cycle} subtitle={`${a.who}${a.who_title ? ` · ${a.who_title}` : ""} · ${fmtDate(a.period_start)} → ${fmtDate(a.period_end)}`}>
        <Badge value={a.status} />
      </PageHeader>

      <div className="mb-6 grid gap-4 sm:grid-cols-4">
        <Stat label="Self score" value={a.self_score ?? "—"} />
        <Stat label="Reviewer score" value={a.reviewer_score ?? "—"} tone="emerald" />
        <Stat label="Goal completion" value={`${weighted}%`} tone="sky" hint="Weighted" />
        <Stat label="Reviewer" value={a.reviewer ?? "—"} tone="amber" />
      </div>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card>
          <CardTitle>Self-review</CardTitle>
          {/*
            Keyed on the saved score: these forms stay open after a successful save,
            so React reuses the DOM and an uncontrolled <select> would keep showing
            the value from before the save. Changing the key remounts it against the
            freshly loaded row.
          */}
          {isSubject && a.status !== "acknowledged" ? (
            <ActionForm key={`self-${a.self_score ?? "none"}`} action={saveSelfReview} className="space-y-3">
              <input type="hidden" name="id" value={a.id} />
              <Field label="How did the period go?">
                <textarea name="self_review" rows={8} defaultValue={a.self_review ?? ""} className="field resize-y"
                          placeholder="What you delivered, what went well, what you would do differently." />
              </Field>
              <Field label="Score yourself">
                <Select name="self_score" defaultValue={a.self_score ?? ""} className="field">
                  <option value="">Not scored</option>
                  {SCORES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              <SubmitBtn>Save self-review</SubmitBtn>
            </ActionForm>
          ) : (
            <p className="text-sm font-medium whitespace-pre-wrap">{a.self_review || <span className="text-ink-soft">Not written yet.</span>}</p>
          )}
        </Card>

        <Card>
          <CardTitle>Reviewer's assessment</CardTitle>
          {isReviewer && !isSubject ? (
            <ActionForm key={`rev-${a.reviewer_score ?? "none"}`} action={saveReviewerReview} className="space-y-3">
              <input type="hidden" name="id" value={a.id} />
              <Field label="Your assessment">
                <textarea name="reviewer_review" rows={8} defaultValue={a.reviewer_review ?? ""} className="field resize-y"
                          placeholder="Strengths, areas to develop, and what support you will give." />
              </Field>
              <Field label="Score">
                <Select name="reviewer_score" defaultValue={a.reviewer_score ?? ""} className="field">
                  <option value="">Not scored</option>
                  {SCORES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </Select>
              </Field>
              {a.status === "pending" && (
                <div className="rounded-xl bg-amber-50 p-3 ring-1 ring-amber-200 ring-inset">
                  <p className="text-xs font-semibold text-amber-900">
                    {a.who.split(" ")[0]} has not written a self-review yet. The self-assessment normally comes first.
                  </p>
                  {can(me, "appraisal.cycle") && (
                    <label className="mt-2 flex cursor-pointer items-center gap-2 text-xs font-bold text-amber-900">
                      <input type="checkbox" name="waive_self" className="h-4 w-4 accent-amber-600" />
                      Waive the self-review and score anyway
                    </label>
                  )}
                </div>
              )}
              <SubmitBtn>Save assessment</SubmitBtn>
            </ActionForm>
          ) : (
            <>
              <p className="text-sm font-medium whitespace-pre-wrap">{a.reviewer_review || <span className="text-ink-soft">Your reviewer has not written this yet.</span>}</p>
              {isSubject && a.status === "reviewed" && (
                <ActionForm action={acknowledgeAppraisal} className="mt-4">
                  <input type="hidden" name="id" value={a.id} />
                  <SubmitBtn>I have read and acknowledge this</SubmitBtn>
                </ActionForm>
              )}
            </>
          )}
        </Card>
      </div>

      <Card className="mt-5">
        <CardTitle>Goals</CardTitle>
        {goals.length === 0 ? (
          <p className="mb-4 text-sm font-medium text-ink-soft">No goals set for this period yet.</p>
        ) : (
          <ul className="mb-4 divide-y divide-line">
            {goals.map((g) => (
              <li key={g.id} className="py-3">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-bold">{g.title}</span>
                    {g.notes && <span className="block text-xs font-medium text-ink-soft">{g.notes}</span>}
                  </span>
                  <span className="text-xs font-bold text-ink-soft">weight {g.weight}%</span>
                  <span className="w-32">
                    <span className="block h-1.5 overflow-hidden rounded-full bg-canvas">
                      <span className="block h-full bg-brand-500" style={{ width: `${g.progress}%` }} />
                    </span>
                  </span>
                  <ActionForm action={updateGoal} className="flex items-center gap-1">
                    <input type="hidden" name="id" value={g.id} />
                    <input name="progress" type="number" min="0" max="100" defaultValue={g.progress} className="field w-20 !py-1" />
                    <SubmitBtn variant="ghost">Set</SubmitBtn>
                  </ActionForm>
                </div>
              </li>
            ))}
          </ul>
        )}

        {a.status !== "acknowledged" && (
          <ActionForm action={saveGoal} className="flex flex-wrap items-end gap-2 border-t border-line pt-4">
            <input type="hidden" name="appraisal_id" value={a.id} />
            <input name="title" required placeholder="Goal for the period" className="field min-w-48 flex-1" />
            <input name="weight" type="number" min="0" max="100" defaultValue="20" className="field w-24" aria-label="Weight %" />
            <input name="progress" type="number" min="0" max="100" defaultValue="0" className="field w-24" aria-label="Progress %" />
            <SubmitBtn>Add goal</SubmitBtn>
          </ActionForm>
        )}
      </Card>

      <Link href="/appraisals" className="mt-5 block text-xs font-bold text-brand-700 hover:underline">← All appraisals</Link>
    </>
  );
}
