import Link from "next/link";
import { LayoutTemplate, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, canWorkWithAudience } from "@/lib/permissions";
import { AUDIENCE_LABEL } from "@/lib/constants";
import { visibleAudiences } from "@/lib/queries";
import { fmtDate } from "@/lib/time";
import { Badge, Empty, PageHeader, Tabs } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { duplicateTemplate, setTemplateActive } from "@/actions/templates";

export const metadata = { title: "Templates" };

export default async function TemplatesPage({ searchParams }: { searchParams: Promise<{ audience?: string; q?: string; status?: string }> }) {
  const user = await requireUser();
  const sp = await searchParams;
  const auds = visibleAudiences(user.role);
  const filterAud = sp.audience && auds.includes(sp.audience as never) ? [sp.audience as (typeof auds)[number]] : auds;
  const templates = await prisma.template.findMany({
    where: { audience: { in: filterAud }, ...(sp.q ? { name: { contains: sp.q, mode: "insensitive" } } : {}), ...(sp.status === "inactive" ? { active: false } : sp.status === "all" ? {} : { active: true }) },
    include: { _count: { select: { automations: true } }, versions: { orderBy: { version: "desc" }, take: 1, select: { subject: true, _count: { select: { campaigns: true } } } } },
    orderBy: [{ audience: "asc" }, { category: "asc" }, { name: "asc" }],
  });
  const canWrite = can(user.role, "templates:write");
  const counts = Object.fromEntries(await Promise.all(auds.map(async (a) => [a, await prisma.template.count({ where: { audience: a, active: true } })])));

  return (
    <>
      <PageHeader
        title="Email Template Studio"
        description="Branded, reusable templates with personalisation. Editing creates a new version, so approved and scheduled campaigns are never changed silently."
        actions={canWrite && <Link href="/templates/new" className="btn-primary"><Plus className="h-4 w-4" /> New template</Link>}
      />
      <Tabs active={`/templates${sp.audience ? `?audience=${sp.audience}` : ""}`} items={[{ href: "/templates", label: "All" }, ...auds.map((a) => ({ href: `/templates?audience=${a}`, label: a === "INTERNAL" ? "Internal" : a === "EXTERNAL" ? "External" : "Staff + External", count: counts[a] }))]} />
      <form className="mb-4 flex flex-wrap gap-2">
        {sp.audience && <input type="hidden" name="audience" value={sp.audience} />}
        <input className="input max-w-xs" name="q" defaultValue={sp.q} placeholder="Search templates" />
        <select className="input w-auto" name="status" defaultValue={sp.status ?? ""}><option value="">Active</option><option value="inactive">Inactive</option><option value="all">All</option></select>
        <button className="btn-navy">Filter</button>
      </form>
      {templates.length === 0 ? <div className="card"><Empty icon={LayoutTemplate} title="No templates match" /></div> : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {templates.map((t) => (
            <div key={t.id} className="card flex flex-col p-4">
              <div className="mb-3 flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <Link href={`/templates/${t.id}`} className="font-semibold text-navy hover:text-brand">{t.name}</Link>
                  <div className="mt-0.5 truncate text-xs text-muted">{t.versions[0]?.subject}</div>
                </div>
                {t.active ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}
              </div>
              <div className="mb-4 flex flex-wrap gap-1.5">
                <Badge tone={t.audience === "INTERNAL" ? "info" : t.audience === "EXTERNAL" ? "brand" : "neutral"}>{AUDIENCE_LABEL[t.audience]}</Badge>
                <Badge>{t.category}</Badge>
                <Badge>v{t.currentVersion}</Badge>
              </div>
              <div className="mt-auto flex items-center justify-between border-t border-line pt-3 text-xs text-muted">
                <span>{t.department} · {fmtDate(t.updatedAt)}{t._count.automations ? ` · ${t._count.automations} automation${t._count.automations > 1 ? "s" : ""}` : ""}</span>
                {canWrite && canWorkWithAudience(user.role, t.audience) && (
                  <span className="flex gap-1">
                    <ActionButton action={duplicateTemplate} fields={{ templateId: t.id }} className="btn-ghost px-2 py-1 text-xs">Duplicate</ActionButton>
                    <ActionButton action={setTemplateActive} fields={{ templateId: t.id, active: String(!t.active) }} className="btn-ghost px-2 py-1 text-xs">{t.active ? "Deactivate" : "Activate"}</ActionButton>
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
