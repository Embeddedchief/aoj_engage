import Link from "next/link";
import { ListFilter, Plus } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AUDIENCE_LABEL } from "@/lib/constants";
import { contactWhere, describeRules, type SegmentRules } from "@/lib/segments";
import { visibleAudiences } from "@/lib/queries";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { deleteSegment } from "@/actions/segments";

export const metadata = { title: "Segments" };

export default async function SegmentsPage() {
  const user = await requireUser();
  const auds = visibleAudiences(user.role);
  const segments = await prisma.segment.findMany({ where: { audience: { in: auds } }, orderBy: [{ audience: "asc" }, { name: "asc" }] });
  const counts = await Promise.all(segments.map((s) => prisma.contact.count({ where: contactWhere({ audience: s.audience, rules: s.rules as SegmentRules }) })));
  const canWrite = can(user.role, "campaigns:write");
  return (
    <>
      <PageHeader
        title="Segments"
        description="Dynamic recipient groups based on contact attributes. Counts are live, and membership is re-evaluated every time a campaign is prepared."
        actions={canWrite && <Link href="/segments/new" className="btn-primary"><Plus className="h-4 w-4" /> New segment</Link>}
      />
      <div className="card overflow-x-auto">
        {segments.length === 0 ? <Empty icon={ListFilter} title="No segments yet" /> : (
          <table className="table">
            <thead><tr><th>Segment</th><th>Audience</th><th>Rules</th><th className="text-right">Contacts</th><th /></tr></thead>
            <tbody>
              {segments.map((s, i) => (
                <tr key={s.id}>
                  <td><span className="font-medium text-navy">{s.name}</span>{s.description && <div className="text-xs text-muted">{s.description}</div>}</td>
                  <td><Badge tone={s.audience === "INTERNAL" ? "info" : "brand"}>{AUDIENCE_LABEL[s.audience]}</Badge></td>
                  <td className="text-xs text-muted">{describeRules(s.rules as SegmentRules)}</td>
                  <td className="text-right font-semibold tabular-nums">{counts[i]}</td>
                  <td className="whitespace-nowrap text-right">
                    {canWrite && <><Link href={`/segments/${s.id}`} className="link mr-3 text-xs">Edit</Link><ActionButton action={deleteSegment} fields={{ id: s.id }} className="btn-ghost px-2 py-1 text-xs" confirm="Delete this segment?">Delete</ActionButton></>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </>
  );
}
