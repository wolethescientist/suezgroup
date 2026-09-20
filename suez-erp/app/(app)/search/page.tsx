import Link from "next/link";
import { can, requireUser } from "@/lib/auth";
import { sql } from "@/lib/db";
import { compactMoney, timeAgo } from "@/lib/format";
import { Avatar, Badge, Card, Empty, PageHeader } from "@/components/ui";
import { Icon } from "@/components/icons";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const me = await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  const like = `%${q}%`;

  if (!q)
    return (
      <>
        <PageHeader title="Search" subtitle="People, memos, requests, customers, projects, invoices, stock, assets, suppliers and orders." />
        <Card>
          <Empty title="Type something" hint="Use the search box in the header, or add ?q= to the URL." />
        </Card>
      </>
    );

  const isAdmin = can(me, "request.view_all");
  const canSeeFinance = can(me, "invoice.manage");
  /**
   * Search must not answer questions the record's own page would refuse.
   *
   * ponytail: it returned every published memo — matching on the body — so a
   * staff member could search a phrase and get back the title and reference of
   * a document that 404s when they click it, confirming its contents a word at
   * a time. Customers and purchase orders had the same shape.
   */
  const canSeeAllMemos = can(me, "memo.view_any");
  const canSeeCustomers = can(me, "customer.manage");
  const canSeeOrders = can(me, "po.manage");

  /**
   * ponytail: search used to cover six things and stop. "breaker" returned no
   * matches at all, although the word was in an inventory item, a requisition,
   * a purchase order line and a project task — which is most of what anyone
   * actually searches an ERP for. Stock, assets, suppliers, orders and tasks
   * are included now, each scoped to who is allowed to see it.
   */
  const [people, memos, requests, customers, projects, invoices, items, assets, vendors, orders, tasks] = await Promise.all([
    sql<{ id: number; full_name: string; job_title: string | null; department: string | null; avatar_url: string | null }>`
      select u.id, u.full_name, u.job_title, d.name as department, u.avatar_url
        from users u left join departments d on d.id = u.department_id
       where u.status = 'active' and (u.full_name ilike ${like} or u.job_title ilike ${like} or u.email ilike ${like})
       order by u.full_name limit 6`,
    sql<{ id: number; ref: string; title: string; kind: string; published_at: string | null }>`
      select m.id, m.ref, m.title, m.kind, m.published_at
        from memos m
       where m.status = 'published'
         and (m.title ilike ${like} or m.body ilike ${like} or m.ref ilike ${like})
         -- Only documents this person may actually open. Searching the body of
         -- a memo you were never sent is a way to read it a phrase at a time.
         and (${canSeeAllMemos}
              or m.author_id = ${me.id}
              or exists (select 1 from memo_recipients mr
                          where mr.memo_id = m.id and mr.user_id = ${me.id}))
       order by m.published_at desc limit 6`,
    sql<{ id: number; ref: string; title: string; status: string }>`
      select r.id, r.ref, r.title, r.status
        from workflow_requests r
       where (r.requester_id = ${me.id} or r.assignee_id = ${me.id} or ${can(me, "request.view_all")})
         and (r.title ilike ${like} or r.description ilike ${like} or r.ref ilike ${like})
       order by r.created_at desc limit 6`,
    sql<{ id: number; name: string; tax_id: string | null; status: string }>`
      select id, name, tax_id, status from customers
       where (${canSeeCustomers})
         and (name ilike ${like} or email ilike ${like} or tax_id ilike ${like})
       order by name limit 6`,
    sql<{ id: number; name: string; code: string | null; status: string }>`
      select id, name, code, status from projects
       where name ilike ${like} or code ilike ${like} or description ilike ${like} order by name limit 6`,
    sql<{ id: number; ref: string; total: string; currency: string; status: string; customer: string | null }>`
      select i.id, i.ref, i.total, i.currency, i.status, c.name as customer
        from invoices i left join customers c on c.id = i.customer_id
       where (${canSeeFinance})
         and (i.ref ilike ${like} or c.name ilike ${like} or i.notes ilike ${like})
       order by i.issue_date desc limit 6`,
    sql<{ id: number; sku: string; name: string; category: string | null; quantity: string; unit: string | null }>`
      select id, sku, name, category, quantity, unit from inventory_items
       where status = 'active' and (name ilike ${like} or sku ilike ${like} or category ilike ${like})
       order by name limit 6`,
    sql<{ id: number; tag: string; name: string; status: string; holder: string | null }>`
      select a.id, a.tag, a.name, a.status,
             (select u.full_name from asset_assignments aa
                join users u on u.id = aa.user_id
               where aa.asset_id = a.id and aa.returned_on is null
               order by aa.assigned_on desc limit 1) as holder
        from assets a
       where a.tag ilike ${like} or a.name ilike ${like} or a.serial_no ilike ${like}
       order by a.tag limit 6`,
    sql<{ id: number; name: string; category: string | null; status: string }>`
      select id, name, category, status from vendors
       where name ilike ${like} or category ilike ${like} or email ilike ${like}
       order by name limit 6`,
    sql<{ id: number; ref: string; kind: string; title: string; status: string }>`
      select o.id, o.ref, 'order' as kind, coalesce(v.name, 'No vendor') as title, o.status
        from purchase_orders o
        left join vendors v on v.id = o.vendor_id
       where (${canSeeOrders})
         and (o.ref ilike ${like} or v.name ilike ${like} or o.notes ilike ${like}
              or exists (select 1 from purchase_order_lines l where l.po_id = o.id and l.description ilike ${like}))
       union all
      select r.id, r.ref, 'requisition' as kind, r.title, r.status
        from purchase_requisitions r
       where r.ref ilike ${like} or r.title ilike ${like} or r.justification ilike ${like}
       limit 6`,
    sql<{ id: number; project_id: number; title: string; status: string; project: string }>`
      select t.id, t.project_id, t.title, t.status, p.name as project
        from project_tasks t join projects p on p.id = t.project_id
       where t.title ilike ${like} or t.description ilike ${like}
       order by t.id desc limit 6`,
  ]);

  const total =
    people.length + memos.length + requests.length + customers.length + projects.length +
    invoices.length + items.length + assets.length + vendors.length + orders.length + tasks.length;

  const Section = ({ title, children }: { title: string; children: React.ReactNode }) => (
    <Card>
      <h2 className="mb-3 text-xs font-bold tracking-wider text-ink-soft uppercase">{title}</h2>
      <ul className="-mx-1 divide-y divide-line">{children}</ul>
    </Card>
  );

  const row = (href: string, primary: React.ReactNode, secondary: React.ReactNode, trailing?: React.ReactNode) => (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-xl px-1 py-2.5 hover:bg-canvas">
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold">{primary}</span>
          <span className="block truncate text-xs font-medium text-ink-soft">{secondary}</span>
        </span>
        {trailing}
      </Link>
    </li>
  );

  return (
    <>
      <PageHeader title={`Results for “${q}”`} subtitle={`${total} match${total === 1 ? "" : "es"} across the portal.`} />

      <form className="relative mb-5">
        <input name="q" defaultValue={q} className="field pl-9 sm:w-96" placeholder="Search again…" />
        <Icon name="search" className="pointer-events-none absolute top-2.5 left-3 h-4 w-4 text-ink-soft" />
      </form>

      {total === 0 ? (
        <Card>
          <Empty title="No matches" hint="Try a shorter term, a reference number or a surname." />
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {people.length > 0 && (
            <Section title="People">
              {people.map((p) => (
                <li key={p.id}>
                  <Link href={`/directory?q=${encodeURIComponent(p.full_name)}`} className="flex items-center gap-3 rounded-xl px-1 py-2.5 hover:bg-canvas">
                    <Avatar name={p.full_name} src={p.avatar_url} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-bold">{p.full_name}</span>
                      <span className="block truncate text-xs font-medium text-ink-soft">
                        {p.job_title ?? "Staff"} · {p.department ?? "—"}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </Section>
          )}

          {memos.length > 0 && (
            <Section title="Memos & circulars">
              {memos.map((m) => row(`/memos/${m.id}`, m.title, `${m.ref} · ${timeAgo(m.published_at)}`, <Badge value={m.kind} />))}
            </Section>
          )}

          {requests.length > 0 && (
            <Section title="Workflow requests">
              {requests.map((r) => row(`/requests/${r.id}`, r.title, r.ref, <Badge value={r.status} />))}
            </Section>
          )}

          {customers.length > 0 && (
            <Section title="Customers">
              {/* Was href="/projects" for every customer, which dropped you on the
                  project list with no idea why. Their invoices are the useful view. */}
              {customers.map((customer) =>
                row(
                  canSeeFinance ? `/finance/invoices?q=${encodeURIComponent(customer.name)}` : `/projects?q=${encodeURIComponent(customer.name)}`,
                  customer.name,
                  customer.tax_id ?? "No tax ID on file",
                  <Badge value={customer.status} />,
                ),
              )}
            </Section>
          )}

          {projects.length > 0 && (
            <Section title="Projects">
              {projects.map((project) => row(`/projects/${project.id}`, project.name, project.code ?? "No project code", <Badge value={project.status} />))}
            </Section>
          )}

          {invoices.length > 0 && (
            <Section title="Invoices">
              {invoices.map((invoice) =>
                row(`/finance/invoices/${invoice.id}`, invoice.ref, invoice.customer ?? "No customer", <span className="text-sm font-bold tabular">{compactMoney(invoice.total, invoice.currency)}</span>),
              )}
            </Section>
          )}

          {items.length > 0 && (
            <Section title="Stock">
              {items.map((i) =>
                row(`/inventory?q=${encodeURIComponent(i.sku)}`, i.name, `${i.sku} · ${i.category ?? "Uncategorised"}`,
                    <span className="text-sm font-bold tabular">{Number(i.quantity)} {i.unit ?? ""}</span>),
              )}
            </Section>
          )}

          {assets.length > 0 && (
            <Section title="Assets">
              {assets.map((a) =>
                row(`/assets/${a.id}`, a.name, `${a.tag}${a.holder ? ` · held by ${a.holder}` : ""}`, <Badge value={a.status} />),
              )}
            </Section>
          )}

          {vendors.length > 0 && (
            <Section title="Suppliers">
              {vendors.map((v) => row("/procurement?tab=vendors", v.name, v.category ?? "No category", <Badge value={v.status} />))}
            </Section>
          )}

          {orders.length > 0 && (
            <Section title="Purchase orders & requisitions">
              {orders.map((o) =>
                row(o.kind === "order" ? `/procurement/orders/${o.id}` : `/procurement/requisitions/${o.id}`,
                    o.title, o.ref, <Badge value={o.status} />),
              )}
            </Section>
          )}

          {tasks.length > 0 && (
            <Section title="Project tasks">
              {tasks.map((t) => row(`/projects/${t.project_id}`, t.title, t.project, <Badge value={t.status} />))}
            </Section>
          )}
        </div>
      )}
    </>
  );
}
