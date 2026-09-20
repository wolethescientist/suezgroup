"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { can, requireUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { notify, usersWithCapability } from "@/lib/notify";
import { sendReportReminders } from "@/lib/reports";
import { saveUpload } from "@/lib/attachments";
import { sanitizeHtml } from "@/lib/sanitize-html";
import {
  currentReportingPeriod,
  isReportKind,
  periodEnd,
  periodLabel,
  periodStart,
} from "@/lib/periods";

const str = (fd: FormData, k: string) => (fd.get(k) ?? "").toString().trim();

/** Documents a meeting report is allowed to be. */
const ACCEPTED = [
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
];
const ACCEPTED_EXT = /\.(pdf|pptx?|docx?|xlsx?)$/i;

/**
 * Accepts the slide deck, the document, or both.
 *
 * The check is on the extension as well as the media type because browsers
 * disagree about what a .docx is — Chrome sends the long OOXML type, some
 * Linux builds send application/octet-stream — and rejecting a valid report on
 * the strength of a header the browser guessed would be infuriating.
 */
function acceptable(file: File) {
  return ACCEPTED.includes(file.type) || ACCEPTED_EXT.test(file.name);
}

async function attachFiles(reportId: number, files: FormDataEntryValue[], userId: number) {
  for (const value of files) {
    if (!value || typeof value === "string") continue;
    const file = value as File;
    if (!file.size) continue;
    if (!acceptable(file))
      throw new Error(`"${file.name}" is not a PDF, Word, PowerPoint or Excel document.`);
    const id = await saveUpload(value, userId);
    if (id)
      await sql`insert into report_files (report_id, attachment_id) values (${reportId}, ${id}) on conflict do nothing`;
  }
}

/** Everyone who receives reports, so a submission reaches whoever holds that job. */
const receivers = () => usersWithCapability("report.view_all");

export async function submitReport(fd: FormData) {
  const me = await requireUser();
  const kind = str(fd, "kind");
  if (!isReportKind(kind)) return { error: "Choose a weekly or a monthly report." };

  const start = str(fd, "period_start") || currentReportingPeriod(kind);
  // Snap whatever date was submitted to the start of its period, so two people
  // reporting on the same week cannot land on two different `period_start`s.
  const periodFrom = periodStart(kind, start);
  const periodTo = periodEnd(kind, periodFrom);
  const title = str(fd, "title") || `${kind === "weekly" ? "Weekly" : "Monthly"} report — ${periodLabel(kind, periodFrom)}`;
  const summary = str(fd, "summary");
  const bodyHtml = sanitizeHtml(str(fd, "body_html"));
  const asDraft = str(fd, "intent") === "draft";

  const files = fd.getAll("files").filter((f) => typeof f !== "string" && (f as File).size > 0);
  if (!asDraft && !summary && !bodyHtml && !files.length)
    return { error: "Write the report or attach the document before sending it." };

  const [existing] = await sql<{ id: number; status: string }>`
    select id, status from staff_reports
     where user_id = ${me.id} and kind = ${kind} and period_start = ${periodFrom}`;
  if (existing && existing.status !== "draft" && existing.status !== "returned")
    return { error: `You have already submitted a ${kind} report for ${periodLabel(kind, periodFrom)}.` };

  const status = asDraft ? "draft" : "submitted";
  const [report] = existing
    ? await sql<{ id: number; ref: string }>`
        update staff_reports
           set title = ${title}, summary = ${summary}, body_html = ${bodyHtml || null},
               status = ${status}, submitted_at = ${asDraft ? null : new Date()},
               department_id = ${me.department_id}, period_end = ${periodTo}
         where id = ${existing.id}
        returning id, ref`
    : await sql<{ id: number; ref: string }>`
        insert into staff_reports (kind, period_start, period_end, title, summary, body_html,
                                   user_id, department_id, status, submitted_at)
        values (${kind}, ${periodFrom}, ${periodTo}, ${title}, ${summary}, ${bodyHtml || null},
                ${me.id}, ${me.department_id}, ${status}, ${asDraft ? null : new Date()})
        returning id, ref`;

  try {
    await attachFiles(report.id, files, me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }

  await audit(me.id, asDraft ? "report.draft" : "report.submit", "staff_report", report.id, { kind, period: periodFrom });

  if (!asDraft) {
    const hr = await receivers();
    const [file] = await sql<{ attachment_id: number }>`
      select attachment_id from report_files where report_id = ${report.id} order by id limit 1`;
    await notify(
      hr.map((h) => h.id),
      `${kind === "weekly" ? "Weekly" : "Monthly"} report: ${me.full_name}`,
      `${periodLabel(kind, periodFrom)} · ${title}`,
      `/reports/${report.id}`,
      {
        kind: "report",
        entity: "staff_report",
        entityId: report.id,
        attachmentId: file?.attachment_id ?? null,
        actionLabel: "Read the report",
      },
    );
  }

  revalidatePath("/reports");
  revalidatePath("/reports/received");
  redirect(`/reports/${report.id}`);
}

export async function addReportFiles(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const [report] = await sql<{ user_id: number; status: string }>`
    select user_id, status from staff_reports where id = ${id}`;
  if (!report) return { error: "Report not found." };
  if (report.user_id !== me.id) return { error: "Only the author can attach to this report." };

  try {
    await attachFiles(id, fd.getAll("files"), me.id);
  } catch (e) {
    return { error: (e as Error).message };
  }
  revalidatePath(`/reports/${id}`);
  return { ok: true, message: "Attached." };
}

export async function removeReportFile(fd: FormData) {
  const me = await requireUser();
  const id = Number(str(fd, "id"));
  const attachmentId = Number(str(fd, "attachment_id"));
  const [report] = await sql<{ user_id: number; status: string }>`
    select user_id, status from staff_reports where id = ${id}`;
  if (!report) return { error: "Report not found." };
  if (report.user_id !== me.id) return { error: "Only the author can remove this." };
  if (report.status === "acknowledged") return { error: "This report has been accepted and can no longer be changed." };

  await sql`delete from report_files where report_id = ${id} and attachment_id = ${attachmentId}`;
  revalidatePath(`/reports/${id}`);
  return { ok: true };
}

/** HR's decision: accepted, or sent back for more. */
export async function reviewReport(fd: FormData) {
  const me = await requireUser();
  if (!can(me, "report.view_all")) return { error: "You do not receive reports." };

  const id = Number(str(fd, "id"));
  const decision = str(fd, "decision");
  if (!["acknowledged", "returned"].includes(decision)) return { error: "Unknown decision." };
  const note = str(fd, "note");
  if (decision === "returned" && !note) return { error: "Say what is missing before sending it back." };

  const [report] = await sql<{ user_id: number; ref: string; kind: string; period_start: string; status: string }>`
    select user_id, ref, kind, period_start, status from staff_reports where id = ${id}`;
  if (!report) return { error: "Report not found." };
  if (report.status === "draft") return { error: "That report has not been submitted yet." };

  await sql`
    update staff_reports
       set status = ${decision}, reviewed_by = ${me.id}, reviewed_at = now(), review_note = ${note || null}
     where id = ${id}`;

  await notify(
    [report.user_id],
    decision === "acknowledged" ? `Report accepted — ${report.ref}` : `Report sent back — ${report.ref}`,
    decision === "acknowledged"
      ? `${me.full_name} has read your ${report.kind} report.`
      : note,
    `/reports/${id}`,
    { kind: "report", entity: "staff_report", entityId: id, actionLabel: "Open the report" },
  );
  await audit(me.id, `report.${decision}`, "staff_report", id);
  revalidatePath("/reports/received");
  revalidatePath(`/reports/${id}`);
  return { ok: true };
}

/** The Remind button on HR's page. */
export async function remindOutstanding(fd: FormData) {
  const me = await requireUser();
  if (!can(me, "report.view_all")) return { error: "You do not receive reports." };
  const kind = str(fd, "kind");
  if (!isReportKind(kind)) return { error: "Unknown report type." };
  const periodFrom = periodStart(kind, str(fd, "period_start") || currentReportingPeriod(kind));

  const { reminded } = await sendReportReminders(kind, periodFrom, me, str(fd, "force") === "1");
  revalidatePath("/reports/received");
  return {
    ok: true,
    message: reminded
      ? `Reminded ${reminded} ${reminded === 1 ? "person" : "people"}.`
      : "Everyone has either submitted or already been reminded.",
  };
}
