import { requirePermission } from "@/lib/auth";
import { canWorkWithAudience } from "@/lib/permissions";
import { getSettings } from "@/lib/settings";
import { BROADCAST_GROUPS, type BroadcastGroup } from "@/lib/broadcast";
import { PageHeader } from "@/components/ui";
import { BroadcastComposer } from "@/components/broadcast-composer";

export const metadata = { title: "Broadcast" };
export const maxDuration = 60; // "Send now" keeps sending in the background for up to a minute

export default async function BroadcastPage() {
  const u = await requirePermission("campaigns:write");
  const s = await getSettings();
  const groups = (Object.keys(BROADCAST_GROUPS) as BroadcastGroup[]).filter((g) => canWorkWithAudience(u.role, BROADCAST_GROUPS[g].audience));
  return (
    <>
      <PageHeader title="Broadcast" description="Type a message, choose what kind it is and who should get it, then send. Only the group you pick receives it, e.g. an urgent meeting notice goes to staff only, never to customers." />
      <BroadcastComposer brand={s.brand} userName={u.name} userEmail={u.email} groups={groups} />
    </>
  );
}
