import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { CATEGORY_LABEL, STATUS_TONE } from "@/lib/constants";
import { visibleAudiences, visibleCategories } from "@/lib/queries";
import { titleCase } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Search" };

export default async function SearchPage({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  const user = await requireUser();
  const q = (await searchParams).q?.trim() ?? "";
  if (q.length < 2) return <PageHeader title="Search" description="Type at least two characters in the search bar." />;
  const auds = visibleAudiences(user.role);
  const ci = { contains: q, mode: "insensitive" as const };
  const [contacts, campaigns, templates] = await Promise.all([
    prisma.contact.findMany({ where: { category: { in: visibleCategories(user.role) }, OR: [{ firstName: ci }, { lastName: ci }, { email: ci }, { organisation: ci }] }, take: 20 }),
    prisma.campaign.findMany({ where: { audience: { in: auds }, name: ci }, take: 20, orderBy: { createdAt: "desc" } }),
    prisma.template.findMany({ where: { audience: { in: auds }, OR: [{ name: ci }, { category: ci }] }, take: 20 }),
  ]);
  return (
    <>
      <PageHeader title={`Results for “${q}”`} />
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title={`Contacts (${contacts.length})`} bodyClass="p-0">
          <ul className="divide-y divide-line">{contacts.map((c) => <li key={c.id} className="px-5 py-2.5 text-sm"><Link className="link" href={`/contacts/${c.id}`}>{c.firstName} {c.lastName}</Link><div className="text-xs text-muted">{c.email} · {CATEGORY_LABEL[c.category]}</div></li>)}{!contacts.length && <li className="px-5 py-3 text-sm text-muted">None</li>}</ul>
        </Card>
        <Card title={`Campaigns (${campaigns.length})`} bodyClass="p-0">
          <ul className="divide-y divide-line">{campaigns.map((c) => <li key={c.id} className="flex justify-between gap-2 px-5 py-2.5 text-sm"><Link className="link" href={`/campaigns/${c.id}`}>{c.name}</Link><Badge tone={STATUS_TONE[c.status]}>{titleCase(c.status)}</Badge></li>)}{!campaigns.length && <li className="px-5 py-3 text-sm text-muted">None</li>}</ul>
        </Card>
        <Card title={`Templates (${templates.length})`} bodyClass="p-0">
          <ul className="divide-y divide-line">{templates.map((t) => <li key={t.id} className="px-5 py-2.5 text-sm"><Link className="link" href={`/templates/${t.id}`}>{t.name}</Link><div className="text-xs text-muted">{t.category}</div></li>)}{!templates.length && <li className="px-5 py-3 text-sm text-muted">None</li>}</ul>
        </Card>
      </div>
    </>
  );
}
