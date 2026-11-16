import Link from "next/link";
import { Briefcase, Upload, UserPlus } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { CATEGORY_LABEL } from "@/lib/constants";
import { fmtDate } from "@/lib/time";
import { Badge, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Customer directory" };

export default async function CustomersPage({ searchParams }: { searchParams: Promise<{ q?: string; rel?: string }> }) {
  const user = await requirePermission("contacts:read:external");
  const { q, rel } = await searchParams;
  const customers = await prisma.contact.findMany({
    where: {
      category: { in: ["CUSTOMER", "FORMER_CUSTOMER"] }, status: "ACTIVE",
      ...(rel ? { customerProfile: { relationshipStatus: rel } } : {}),
      ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { organisation: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: {
      customerProfile: true, projects: { orderBy: { updatedAt: "desc" }, take: 1 },
      recipients: { where: { status: { in: ["ACCEPTED", "DELIVERED"] } }, orderBy: { sentAt: "desc" }, take: 1, include: { campaign: { select: { name: true } } } },
    },
    orderBy: [{ organisation: "asc" }, { lastName: "asc" }],
  });
  const canWrite = can(user.role, "contacts:write:external");
  return (
    <>
      <PageHeader
        title="Customer directory"
        description="Existing and former customers, with relationship status, projects and the last communication each one received."
        actions={canWrite && <><Link href="/contacts/import" className="btn-secondary"><Upload className="h-4 w-4" /> Import</Link><Link href="/contacts/new?category=CUSTOMER" className="btn-primary"><UserPlus className="h-4 w-4" /> Add customer</Link></>}
      />
      <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
        <label className="min-w-[200px] flex-1"><span className="label">Search</span><input className="input" name="q" defaultValue={q} placeholder="Name, company or email" /></label>
        <label><span className="label">Relationship</span><select className="input" name="rel" defaultValue={rel ?? ""}><option value="">All</option>{["Active", "Completed", "Former", "Dormant"].map((s) => <option key={s}>{s}</option>)}</select></label>
        <button className="btn-navy">Filter</button>
      </form>
      <div className="card overflow-x-auto">
        {customers.length === 0 ? <Empty icon={Briefcase} title="No customers yet" action={canWrite ? <Link className="btn-primary" href="/contacts/new?category=CUSTOMER">Add customer</Link> : undefined} /> : (
          <table className="table">
            <thead><tr><th>Contact</th><th>Company</th><th>Relationship</th><th>Latest project</th><th>Consent</th><th>Last email</th></tr></thead>
            <tbody>
              {customers.map((c) => (
                <tr key={c.id}>
                  <td><Link className="link" href={`/contacts/${c.id}`}>{c.firstName} {c.lastName}</Link><div className="text-xs text-muted">{c.jobTitle ?? c.email}</div></td>
                  <td>{c.organisation ?? "—"}{c.category === "FORMER_CUSTOMER" && <Badge className="ml-2">{CATEGORY_LABEL[c.category]}</Badge>}</td>
                  <td><Badge tone={c.customerProfile?.relationshipStatus === "Active" ? "ok" : "neutral"}>{c.customerProfile?.relationshipStatus ?? "—"}</Badge></td>
                  <td className="text-muted">{c.projects[0] ? <>{c.projects[0].name} <Badge>{c.projects[0].stage}</Badge></> : "—"}</td>
                  <td><Badge tone={c.marketingConsent === "GRANTED" ? "ok" : c.marketingConsent === "WITHDRAWN" ? "bad" : "warn"}>{c.marketingConsent === "GRANTED" ? "Granted" : c.marketingConsent === "WITHDRAWN" ? "Opted out" : "Not recorded"}</Badge></td>
                  <td className="text-xs text-muted">{c.recipients[0] ? <>{fmtDate(c.recipients[0].sentAt)}<div>{c.recipients[0].campaign.name}</div></> : "Never"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
