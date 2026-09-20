import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { crmOptions } from "@/lib/crm";
import { deleteContact } from "@/lib/actions/crm";
import { Avatar, Badge, BtnLink, Card, Empty, PageHeader, Table, Td } from "@/components/ui";
import { ActionForm, Dialog, SubmitBtn } from "@/components/form";
import { ContactForm } from "@/components/crm-forms";
import { Icon } from "@/components/icons";

export const metadata = { title: "Contacts" };

export default async function ContactsPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireUser();
  const { q = "" } = await searchParams;
  const like = `%${q}%`;

  const [rows, options] = await Promise.all([
    sql<any>`
      select ct.*, c.name as company, u.full_name as owner
        from crm_contacts ct
        left join crm_companies c on c.id = ct.company_id
        left join users u on u.id = ct.owner_id
       where (${q} = '' or ct.full_name ilike ${like} or ct.email ilike ${like} or c.name ilike ${like})
       order by ct.full_name`,
    crmOptions(),
  ]);

  return (
    <>
      <PageHeader title="Contacts" subtitle={`${rows.length} client contact${rows.length === 1 ? "" : "s"}.`}>
        <BtnLink href="/api/export/crm-contacts" variant="ghost" prefetch={false}>
          Export CSV
        </BtnLink>
        <Dialog label={<><Icon name="plus" /> New contact</>} title="Add contact">
          <ContactForm companies={options.companies} owners={options.owners} />
        </Dialog>
      </PageHeader>

      <form className="mb-5 relative">
        <input name="q" defaultValue={q} placeholder="Search name, email or company…" className="field pl-9 sm:w-80" />
        <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
      </form>

      {rows.length === 0 ? (
        <Card>
          <Empty title="No contacts found" hint="Add a contact, or clear the search." />
        </Card>
      ) : (
        <Table head={["Contact", "Company", "Email", "Phone", "Owner", ""]}>
          {rows.map((p: any) => (
            <tr key={p.id} className="hover:bg-canvas">
              <Td>
                <div className="flex items-center gap-3">
                  <Avatar name={p.full_name} size="md" />
                  <div>
                    <p className="flex items-center gap-2 font-bold">
                      {p.full_name}
                      {p.is_primary && <Badge value="approved" label="Primary" />}
                    </p>
                    <p className="text-xs font-medium text-ink-soft">{p.job_title ?? "—"}</p>
                  </div>
                </div>
              </Td>
              <Td>
                {p.company_id ? (
                  <Link href={`/companies/${p.company_id}`} className="font-semibold hover:text-brand-700">
                    {p.company}
                  </Link>
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </Td>
              <Td>
                {p.email ? (
                  <a href={`mailto:${p.email}`} className="font-semibold text-brand-700 hover:underline">
                    {p.email}
                  </a>
                ) : (
                  <span className="text-ink-soft">—</span>
                )}
              </Td>
              <Td className="text-ink-soft">{p.phone ?? "—"}</Td>
              <Td className="text-ink-soft">{p.owner ?? "—"}</Td>
              <Td className="text-right">
                <div className="flex items-center justify-end gap-2">
                  <Dialog label="Edit" variant="ghost" className="!px-2 !py-1 !text-xs" title={`Edit ${p.full_name}`}>
                    <ContactForm companies={options.companies} owners={options.owners} record={p} />
                  </Dialog>
                  {can(me, "record.delete") && (
                    <Dialog label="Delete" variant="ghost" className="!px-2 !py-1 !text-xs !text-rose-600" title={`Delete ${p.full_name}`}>
                      <ActionForm action={deleteContact} className="space-y-4">
                        <input type="hidden" name="id" value={p.id} />
                        <p className="text-sm font-medium text-ink-soft">This contact will be removed from the CRM.</p>
                        <SubmitBtn variant="danger" className="w-full">
                          Delete contact
                        </SubmitBtn>
                      </ActionForm>
                    </Dialog>
                  )}
                </div>
              </Td>
            </tr>
          ))}
        </Table>
      )}
    </>
  );
}
