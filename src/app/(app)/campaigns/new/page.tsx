import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { campaignFormData } from "@/lib/campaign-data";
import { getSettings } from "@/lib/settings";
import { toLocalInput, lagosInstant, todayLocal, addDays } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { CampaignForm } from "@/components/campaign-form";
import { createCampaign } from "@/actions/campaigns";

export const metadata = { title: "Create campaign" };

export default async function NewCampaignPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const user = await requirePermission("campaigns:write");
  const sp = await searchParams;
  const data = await campaignFormData(user.role);
  const settings = await getSettings();
  // Prefill from dashboard recommendations / assistant: ?event=…&date=…&template=…&segment=…&audience=…
  let templateId = sp.template;
  if (!templateId && sp.event) {
    const words = sp.event.toLowerCase().replace(/['’]s?/g, "").split(/\W+/).filter((w) => w.length > 3);
    const match = data.templates.find((t) => words.some((w) => t.name.toLowerCase().includes(w)));
    templateId = match?.id;
  }
  const tpl = templateId ? await prisma.template.findUnique({ where: { id: templateId }, select: { audience: true } }) : null;
  const audience = (sp.audience as never) ?? (tpl && tpl.audience !== "BOTH" ? tpl.audience : data.audiences.includes("BOTH") && sp.event ? "BOTH" : data.audiences[0]);
  const date = sp.date ?? addDays(todayLocal(), 1);
  return (
    <div className="max-w-4xl">
      <PageHeader title="Create campaign" back={{ href: "/campaigns", label: "Campaigns" }} description="Choose the template, recipients and timing. The campaign is saved as a draft so you can preview it, send a test and submit it for approval." />
      <CampaignForm
        action={createCampaign}
        {...data}
        submitLabel="Create draft & preview"
        values={{
          name: sp.event ? `${sp.event} — ${new Date(`${date}T12:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}` : sp.name,
          type: (sp.type as never) ?? (sp.event ? "EVENT" : undefined), audience, templateId, segmentId: sp.segment ?? null, eventName: sp.event ?? null, eventDate: sp.event ? date : null,
          scheduledAt: toLocalInput(lagosInstant(date, settings.defaultSendTime)),
        }}
      />
    </div>
  );
}
