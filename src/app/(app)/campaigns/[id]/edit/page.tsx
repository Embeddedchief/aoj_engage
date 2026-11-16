import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canWorkWithAudience } from "@/lib/permissions";
import { campaignFormData } from "@/lib/campaign-data";
import { toLocalInput } from "@/lib/time";
import { Notice, PageHeader } from "@/components/ui";
import { CampaignForm } from "@/components/campaign-form";
import { updateCampaign } from "@/actions/campaigns";

export const metadata = { title: "Edit campaign" };

export default async function EditCampaignPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("campaigns:write");
  const { id } = await params;
  const c = await prisma.campaign.findUnique({ where: { id }, include: { templateVersion: { include: { template: true } } } });
  if (!c || !canWorkWithAudience(user.role, c.audience)) notFound();
  const data = await campaignFormData(user.role);
  if (!data.templates.some((t) => t.id === c.templateVersion.templateId)) data.templates.push({ id: c.templateVersion.templateId, name: `${c.templateVersion.template.name} (inactive)`, audience: c.templateVersion.template.audience, version: c.templateVersion.template.currentVersion });
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit: ${c.name}`} back={{ href: `/campaigns/${c.id}`, label: "Campaign" }} />
      {c.requiresApproval && c.approvedRevision === c.revision && <div className="mb-5"><Notice tone="warn">This campaign is approved. Saving any change creates revision {c.revision + 1} and sends it back for approval.</Notice></div>}
      <CampaignForm
        action={updateCampaign}
        editing
        {...data}
        audiences={[c.audience]}
        submitLabel="Save changes"
        values={{
          id: c.id, name: c.name, type: c.type, audience: c.audience, templateId: c.templateVersion.templateId, segmentId: c.segmentId, senderIdentity: c.senderIdentity,
          scheduledAt: c.scheduledAt ? toLocalInput(c.scheduledAt) : "", eventName: c.eventName, eventDate: c.eventDate, isMarketing: c.isMarketing,
          templateVersion: c.templateVersion.version, latestVersion: c.templateVersion.template.currentVersion,
        }}
      />
    </div>
  );
}
