import Link from "next/link";
import type { ContactCategory, Prisma } from "@prisma/client";
import { Download, Upload, UserPlus, Users } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { CATEGORY_LABEL, CONTACT_GROUPS, isInternal } from "@/lib/constants";
import { visibleCategories } from "@/lib/queries";
import { fmtDate } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Contacts" };
const PAGE = 50;

export default async function ContactsPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const group = CONTACT_GROUPS[sp.group ?? "all"] ? sp.group ?? "all" : "all";
  const allowed = visibleCategories(user.role);
  if (!allowed.length) return <PageHeader title="Contacts" description="You do not have access to contact records." />;
  const cats = CONTACT_GROUPS[group].categories.filter((c) => allowed.includes(c));
  const category = sp.category && cats.includes(sp.category as ContactCategory) ? (sp.category as ContactCategory) : undefined;
  const page = Math.max(1, Number(sp.page) || 1);
  const q = sp.q?.trim();

  const where: Prisma.ContactWhereInput = {
    category: category ? category : { in: cats },
    ...(sp.status === "inactive" ? { status: "INACTIVE" } : sp.status === "all" ? {} : { status: "ACTIVE" }),
    ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { organisation: { contains: q, mode: "insensitive" } }] } : {}),
  };
  const [total, contacts, suppressed] = await Promise.all([
    prisma.contact.count({ where }),
    prisma.contact.findMany({
      where, orderBy: [{ lastName: "asc" }, { firstName: "asc" }], skip: (page - 1) * PAGE, take: PAGE,
      include: { recipients: { where: { sentAt: { not: null } }, orderBy: { sentAt: "desc" }, take: 1, select: { sentAt: true } } },
    }),
    prisma.suppression.findMany({ select: { email: true } }),
  ]);
  const supp = new Set(suppressed.map((s) => s.email));
  const canWrite = can(user.role, "contacts:write:internal") || can(user.role, "contacts:write:external");
  const qs = (o: Record<string, string | number | undefined>) => "?" + new URLSearchParams(Object.entries({ group, q, status: sp.status, category, ...o }).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();

  return (
    <>
      <PageHeader
        title={CONTACT_GROUPS[group].label}
        description="The central contact database. Deactivate contacts to stop communication while keeping their history."
        actions={
          <>
            <a href={`/api/export/contacts${qs({})}`} className="btn-secondary"><Download className="h-4 w-4" /> Export CSV</a>
            {canWrite && <Link href="/contacts/import" className="btn-secondary"><Upload className="h-4 w-4" /> Import</Link>}
            {canWrite && <Link href={`/contacts/new${group === "customers" ? "?category=CUSTOMER" : group === "prospects" ? "?category=PROSPECT" : group === "partners" ? "?category=PARTNER" : ""}`} className="btn-primary"><UserPlus className="h-4 w-4" /> Add contact</Link>}
          </>
        }
      />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <input type="hidden" name="group" value={group} />
        <label className="min-w-[220px] flex-1"><span className="label">Search</span><input className="input" name="q" defaultValue={q} placeholder="Name, email or organisation" /></label>
        <label><span className="label">Category</span>
          <select className="input" name="category" defaultValue={category ?? ""}>
            <option value="">All</option>
            {cats.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </label>
        <label><span className="label">Status</span>
          <select className="input" name="status" defaultValue={sp.status ?? ""}>
            <option value="">Active</option><option value="inactive">Inactive</option><option value="all">All</option>
          </select>
        </label>
        <button className="btn-navy">Filter</button>
      </form>

      <div className="card overflow-hidden">
        {contacts.length === 0 ? (
          <Empty icon={Users} title="No contacts found" action={canWrite ? <Link href="/contacts/new" className="btn-primary">Add the first contact</Link> : undefined}>
            Try a different search or filter, or import a list.
          </Empty>
        ) : (
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>Name</th><th>Email</th><th>Category</th><th>Organisation / dept.</th><th>Status</th><th>Last email</th></tr></thead>
              <tbody>
                {contacts.map((c) => (
                  <tr key={c.id} className="hover:bg-canvas/50">
                    <td><Link href={`/contacts/${c.id}`} className="link">{c.firstName} {c.lastName}</Link></td>
                    <td className="text-muted">{c.email}</td>
                    <td><Badge tone={isInternal(c.category) ? "info" : "brand"}>{CATEGORY_LABEL[c.category]}</Badge></td>
                    <td className="text-muted">{isInternal(c.category) ? c.department ?? "—" : c.organisation ?? "—"}</td>
                    <td className="space-x-1 whitespace-nowrap">
                      {c.status === "ACTIVE" ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}
                      {supp.has(c.email) && <Badge tone="bad">Suppressed</Badge>}
                      {!isInternal(c.category) && c.marketingConsent !== "GRANTED" && <Badge tone="warn">{c.marketingConsent === "WITHDRAWN" ? "Opted out" : "No consent"}</Badge>}
                    </td>
                    <td className="whitespace-nowrap text-muted">{fmtDate(c.recipients[0]?.sentAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="flex items-center justify-between border-t border-line px-4 py-3 text-sm text-muted">
          <span>{total} contact{total === 1 ? "" : "s"}</span>
          <div className="flex gap-2">
            {page > 1 && <Link className="btn-secondary px-2.5 py-1" href={qs({ page: page - 1 })}>Previous</Link>}
            {page * PAGE < total && <Link className="btn-secondary px-2.5 py-1" href={qs({ page: page + 1 })}>Next</Link>}
          </div>
        </div>
      </div>
    </>
  );
}
