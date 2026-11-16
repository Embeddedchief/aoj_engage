import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, canWorkWithAudience } from "@/lib/permissions";
import { AUDIENCE_LABEL } from "@/lib/constants";
import { getSettings } from "@/lib/settings";
import { audienceCategories } from "@/lib/segments";
import type { EmailBlock } from "@/lib/blocks";
import { Badge, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { TemplateEditor } from "@/components/template-editor";
import { duplicateTemplate, setTemplateActive } from "@/actions/templates";

export const metadata = { title: "Template editor" };

export default async function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("templates:read");
  const { id } = await params;
  const t = await prisma.template.findUnique({ where: { id }, include: { versions: { orderBy: { version: "desc" } }, automations: { select: { id: true, name: true } } } });
  if (!t || !canWorkWithAudience(user.role, t.audience)) notFound();
  const current = t.versions.find((v) => v.version === t.currentVersion) ?? t.versions[0];
  const [settings, contacts, media] = await Promise.all([
    getSettings(),
    prisma.contact.findMany({ where: { status: "ACTIVE", category: { in: audienceCategories(t.audience).filter((c) => canWorkWithAudience(user.role, ["STAFF", "MANAGEMENT", "CONTRACTOR"].includes(c) ? "INTERNAL" : "EXTERNAL")) } }, take: 60, orderBy: { firstName: "asc" }, select: { id: true, firstName: true, lastName: true, preferredName: true, organisation: true, department: true, jobTitle: true, category: true } }),
    prisma.mediaAsset.findMany({ orderBy: { createdAt: "desc" }, take: 100, select: { name: true, url: true, kind: true } }),
  ]);
  const canEdit = can(user.role, "templates:write");
  return (
    <>
      <PageHeader
        title={t.name}
        back={{ href: "/templates", label: "Templates" }}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={t.audience === "INTERNAL" ? "info" : "brand"}>{AUDIENCE_LABEL[t.audience]}</Badge><Badge>v{t.currentVersion}</Badge>{t.active ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}<span>Created by {t.createdBy ?? "System"} · last modified by {t.updatedBy ?? "System"}{t.automations.length ? ` · used by ${t.automations.map((a) => a.name).join(", ")}` : ""}</span></span>}
        actions={canEdit && (
          <>
            <ActionButton action={duplicateTemplate} fields={{ templateId: t.id }}>Duplicate</ActionButton>
            <ActionButton action={setTemplateActive} fields={{ templateId: t.id, active: String(!t.active) }} className={t.active ? "btn-danger" : "btn-primary"}>{t.active ? "Deactivate" : "Activate"}</ActionButton>
          </>
        )}
      />
      <TemplateEditor
        template={{ id: t.id, name: t.name, category: t.category, audience: t.audience, active: t.active, currentVersion: t.currentVersion }}
        initial={{ subject: current.subject, preheader: current.preheader ?? "", blocks: current.blocks as unknown as EmailBlock[] }}
        versions={t.versions.map((v) => ({ version: v.version, note: v.note, createdBy: v.createdBy, createdAt: v.createdAt.toISOString(), subject: v.subject }))}
        contacts={contacts}
        brand={settings.brand}
        senders={settings.senders}
        media={media}
        canEdit={canEdit}
        userEmail={user.email}
      />
    </>
  );
}
