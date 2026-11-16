import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getSettings } from "@/lib/settings";
import { PageHeader } from "@/components/ui";
import { AutomationBuilder } from "@/components/automation-builder";
import { saveAutomation } from "@/actions/automations";

export const metadata = { title: "Edit automation" };

export default async function EditAutomationPage({ params }: { params: Promise<{ id: string }> }) {
  await requirePermission("automations:write");
  const { id } = await params;
  const a = await prisma.automation.findUnique({ where: { id } });
  if (!a) notFound();
  const [templates, events, segments, settings] = await Promise.all([
    prisma.template.findMany({ where: { OR: [{ active: true }, { id: a.templateId }] }, orderBy: { name: "asc" }, select: { id: true, name: true, audience: true } }),
    prisma.calendarEvent.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } }),
    prisma.segment.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true, audience: true } }),
    getSettings(),
  ]);
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit: ${a.name}`} back={{ href: `/automations/${a.id}`, label: "Automation" }} description="Changes apply to future occurrences only. Campaigns already prepared keep their configuration." />
      <AutomationBuilder action={saveAutomation} values={a} templates={templates} events={events} segments={segments} senders={settings.senders} />
    </div>
  );
}
