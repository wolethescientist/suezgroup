import Link from "next/link";
import { notFound } from "next/navigation";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { fmtDateTime } from "@/lib/format";
import { getOrg } from "@/lib/settings";
import { Badge, BtnLink } from "@/components/ui";
import { isStaleSignature } from "@/lib/memos";
import { PrintButton } from "@/components/print-button";

export const metadata = { title: "Signature register" };

type Row = {
  user_id: number;
  full_name: string;
  staff_no: string | null;
  job_title: string | null;
  department: string | null;
  read_at: string | null;
  acknowledged_at: string | null;
  signature_ref: string | null;
  signature_sha256: string | null;
  signed_ip: string | null;
  signed_with_password: boolean;
  acknowledged_version: number | null;
  /** Signatures given against versions this document has since moved past. */
  superseded: { version: number; signed_at: string }[] | null;
};

export default async function RegisterPage({ params }: { params: Promise<{ id: string }> }) {
  const me = await requireUser();
  const id = Number((await params).id);
  if (!id) notFound();

  const [memo] = await sql<{
    id: number; ref: string; kind: string; title: string; author_id: number; author: string;
    author_title: string | null; published_at: string | null; requires_ack: boolean;
    author_signature_ref: string | null; version: number;
  }>`
    select m.id, m.ref, m.kind, m.title, m.author_id, m.published_at, m.requires_ack, m.version,
           m.author_signature_ref, u.full_name as author, u.job_title as author_title
      from memos m join users u on u.id = m.author_id
     where m.id = ${id}`;
  if (!memo) notFound();
  if (memo.author_id !== me.id && !can(me, "memo.view_any")) notFound();

  const [org, rows] = await Promise.all([
    getOrg(),
    sql<Row>`
      select mr.user_id, u.full_name, u.staff_no, u.job_title, d.name as department,
             mr.read_at, mr.acknowledged_at, mr.signature_ref, mr.signature_sha256, mr.signed_ip,
             mr.signed_with_password, mr.acknowledged_version,
             -- Signatures given against an earlier version. memo_recipients is
             -- reset when a revision asks for fresh ones; this log never is, so
             -- "they did sign v1" survives the document moving on.
             (select json_agg(json_build_object('version', ms.version, 'signed_at', ms.signed_at)
                              order by ms.version)
                from memo_signatures ms
               where ms.memo_id = mr.memo_id and ms.user_id = mr.user_id
                 and ms.version < ${memo.version}) as superseded
        from memo_recipients mr
        join users u on u.id = mr.user_id
        left join departments d on d.id = u.department_id
       where mr.memo_id = ${id}
       order by mr.acknowledged_at nulls last, u.full_name`,
  ]);

  const signed = rows.filter((r) => r.acknowledged_at);
  const passwordless = signed.filter((r) => !r.signed_with_password).length;

  return (
    <>
      {/* Screen-only controls. The printed page carries none of this. */}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/memos/${id}`} className="inline-flex items-center gap-1.5 text-xs font-bold text-ink-soft hover:text-ink">
          ← Back to document
        </Link>
        <div className="flex flex-wrap gap-2">
          <BtnLink href={`/api/export/memo-acknowledgements?memo=${id}`} variant="outline" prefetch={false}>
            Download CSV
          </BtnLink>
          <PrintButton />
        </div>
      </div>

      <article className="card mx-auto max-w-4xl p-8 print:border-0 print:shadow-none">
        <header className="border-b-2 border-ink pb-4">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="text-lg font-bold">{org.name}</p>
              {org.address && <p className="text-xs font-medium text-ink-soft">{org.address}</p>}
            </div>
            <div className="text-right">
              <p className="text-[10px] font-bold tracking-widest text-ink-soft uppercase">Acknowledgement register</p>
              <p className="font-mono text-sm font-bold">{memo.ref}</p>
            </div>
          </div>
        </header>

        <section className="mt-5 grid gap-4 sm:grid-cols-2">
          {[
            ["Document", memo.title],
            ["Type", memo.kind.charAt(0).toUpperCase() + memo.kind.slice(1)],
            ["Issued by", `${memo.author}${memo.author_title ? ` — ${memo.author_title}` : ""}`],
            ["Published", fmtDateTime(memo.published_at)],
            ...(memo.version > 1 ? [["Version", `${memo.version}`]] : []),
            ["Recipients", `${rows.length}`],
            ["Signed", `${signed.length} of ${rows.length}`],
          ].map(([k, v]) => (
            <div key={k}>
              <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">{k}</p>
              <p className="text-sm font-bold">{v}</p>
            </div>
          ))}
        </section>

        {memo.author_signature_ref && (
          <section className="mt-5 border-t border-line pt-4">
            <p className="text-[10px] font-bold tracking-wider text-ink-soft uppercase">Issued under the signature of</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={memo.author_signature_ref}
              alt={`${memo.author} signature`}
              data-signature
              className="mt-1 h-12 object-contain object-left p-1"
            />
            <p className="text-xs font-bold">{memo.author}</p>
          </section>
        )}

        <div className="mt-6 overflow-x-auto">
          <table className="w-full border-collapse text-left text-xs">
            <thead>
              <tr className="border-y border-ink/20">
                {["Employee", "Department", "Read", "Signed", "Signature", "Verification"].map((h) => (
                  <th key={h} className="py-2 pr-3 text-[10px] font-bold tracking-wider text-ink-soft uppercase">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((r) => (
                <tr key={r.user_id} className="break-inside-avoid align-top">
                  <td className="py-3 pr-3">
                    <p className="font-bold">{r.full_name}</p>
                    <p className="text-[11px] font-medium text-ink-soft">
                      {r.staff_no ?? "—"}
                      {r.job_title ? ` · ${r.job_title}` : ""}
                    </p>
                  </td>
                  <td className="py-3 pr-3 font-medium text-ink-soft">{r.department ?? "—"}</td>
                  <td className="py-3 pr-3 whitespace-nowrap font-medium">
                    {r.read_at ? fmtDateTime(r.read_at) : <span className="text-ink-soft">Not read</span>}
                  </td>
                  <td className="py-3 pr-3 font-medium">
                    {r.acknowledged_at ? (
                      <>
                        <span className="whitespace-nowrap">{fmtDateTime(r.acknowledged_at)}</span>
                        {memo.version > 1 && (
                          <span className="mt-0.5 block text-[10px] font-semibold text-ink-soft">
                            against v{r.acknowledged_version ?? 1}
                          </span>
                        )}
                        {isStaleSignature(r.acknowledged_version, memo.version) && (
                          <span className="mt-1 block">
                            <Badge value="high" label={`Superseded by v${memo.version}`} />
                          </span>
                        )}
                      </>
                    ) : (
                      <>
                        <Badge value="pending" label="Outstanding" />
                        {r.superseded?.length ? (
                          <span className="mt-1 block text-[10px] font-semibold text-ink-soft">
                            signed v{r.superseded.map((p) => p.version).join(", v")} previously
                          </span>
                        ) : null}
                      </>
                    )}
                  </td>
                  <td className="py-3 pr-3">
                    {r.signature_ref ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={r.signature_ref} alt={`${r.full_name} signature`} data-signature className="h-10 w-32 object-contain object-left p-1" />
                    ) : r.acknowledged_at ? (
                      <span className="text-[11px] font-medium text-ink-soft">Signed before snapshots were recorded</span>
                    ) : (
                      <span className="inline-block h-10 w-32 border-b border-dotted border-ink/30" />
                    )}
                  </td>
                  <td className="py-3 font-mono text-[9px] break-all text-ink-soft">
                    {r.signature_sha256 ? (
                      <>
                        <span title={r.signature_sha256}>{r.signature_sha256.slice(0, 24)}…</span>
                        {r.signed_ip && <span className="block">IP {r.signed_ip}</span>}
                        <span className="block font-sans font-semibold">
                          {r.signed_with_password ? "password confirmed" : "session only"}
                        </span>
                      </>
                    ) : (
                      "—"
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <footer className="mt-6 border-t border-line pt-4 text-[10px] leading-relaxed font-medium text-ink-soft">
          <p>
            Each signature above is an immutable copy taken at the moment of signing, together with the SHA-256 hash of
            that image, the timestamp and the originating IP address. Later changes to an employee&apos;s stored
            signature do not affect these records.
          </p>
          <p className="mt-1.5">
            Rows marked <strong>password confirmed</strong> re-authenticated with the signer&apos;s account password at
            the moment of signing. Rows marked <strong>session only</strong> were signed from an authenticated session
            without re-entry, under the acknowledgement policy in force at that time
            {passwordless > 0 && signed.length > 0
              ? ` — ${signed.length - passwordless} of ${signed.length} signatures were password confirmed`
              : ""}
            .
          </p>
          {memo.version > 1 && (
            <p className="mt-1.5">
              This document has been revised {memo.version - 1} time{memo.version === 2 ? "" : "s"}. Each signature is
              recorded against the version of the wording that was in force when it was given, and a signature given
              against superseded wording is marked as such rather than counted towards the current version.
            </p>
          )}
          <p className="mt-1.5">
            Register generated {fmtDateTime(new Date())} by {me.full_name}. {org.name} — internal document.
          </p>
        </footer>
      </article>
    </>
  );
}
