import Link from "next/link";
import { Plus, Workflow } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { AUDIENCE_LABEL } from "@/lib/constants";
import { visibleAudiences } from "@/lib/queries";
import { automationOccurrences } from "@/lib/engine";
import { triggerText } from "@/lib/automation-text";
import { addDays, fmtDateTime, fmtLocal, todayLocal } from "@/lib/time";
import { titleCase } from "@/lib/utils";
import { Badge, Empty, PageHeader } from "@/components/ui";
import { ActionButton } from "@/components/forms";
import { setAutomationStatus } from "@/actions/automations";

export const metadata = { title: "Automation Centre" };

export default async function AutomationsPage() {
  const user = await requirePermission("automations:read");
  const automations = await prisma.automation.findMany({
    where: { audience: { in: visibleAudiences(user.role) } },
    include: { template: true, event: { include: { dates: true } }, runs: { orderBy: { createdAt: "desc" }, take: 1 }, _count: { select: { runs: { where: { status: "FAILED" } } } } },
    orderBy: [{ status: "asc" }, { trigger: "asc" }, { name: "asc" }],
  });
  const today = todayLocal();
  const canWrite = can(user.role, "automations:write");
  return (
    <>
      <PageHeader
        title="Automation Centre"
        description="Time-based, event-based and condition-based workflows. Each occurrence is executed at most once, enforced by unique database records, so retries and restarts never send duplicates."
        actions={canWrite && <Link href="/automations/new" className="btn-primary"><Plus className="h-4 w-4" /> New automation</Link>}
      />
      <div className="card overflow-x-auto">
        {automations.length === 0 ? <Empty icon={Workflow} title="No automations" /> : (
          <table className="table">
            <thead><tr><th>Automation</th><th>Trigger</th><th>Audience</th><th>Next execution</th><th>Previous</th><th>Status</th><th /></tr></thead>
            <tbody>
              {automations.map((a) => {
                const next = a.status === "ACTIVE" ? automationOccurrences(a, today, addDays(today, 400))[0] : undefined;
                const prev = a.runs[0];
                return (
                  <tr key={a.id} className={a.status === "DISABLED" ? "opacity-60" : ""}>
                    <td><Link className="link" href={`/automations/${a.id}`}>{a.name}</Link><div className="text-xs text-muted">{a.template.name} · {a.requiresApproval ? "approval required" : "pre-approved"}{!a.template.active && <span className="text-bad"> · template inactive</span>}</div></td>
                    <td className="text-sm text-muted">{triggerText(a, a.event)}</td>
                    <td className="whitespace-nowrap text-muted">{AUDIENCE_LABEL[a.audience]}</td>
                    <td className="whitespace-nowrap text-sm">{next ? <>{fmtLocal(next.date, { weekday: true })}{!next.confirmed && <Badge tone="warn" className="ml-1">Unconfirmed</Badge>}</> : <span className="text-muted">—</span>}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{prev ? <>{fmtDateTime(prev.createdAt)}<div><Badge tone={prev.status === "CREATED" ? "ok" : prev.status === "FAILED" ? "bad" : "neutral"}>{titleCase(prev.status)}</Badge>{a._count.runs > 0 && <span className="ml-1 text-bad">{a._count.runs} failure(s)</span>}</div></> : "Never"}</td>
                    <td><Badge tone={a.status === "ACTIVE" ? "ok" : a.status === "PAUSED" ? "warn" : "neutral"}>{titleCase(a.status)}</Badge></td>
                    <td className="whitespace-nowrap text-right">
                      {canWrite && (a.status === "ACTIVE"
                        ? <ActionButton action={setAutomationStatus} fields={{ id: a.id, status: "PAUSED" }} className="btn-ghost px-2 py-1 text-xs">Pause</ActionButton>
                        : <ActionButton action={setAutomationStatus} fields={{ id: a.id, status: "ACTIVE" }} className="btn-secondary px-2 py-1 text-xs" confirm={a.audience !== "INTERNAL" ? "Enable this automation? It will prepare emails for external contacts with marketing consent." : undefined}>Enable</ActionButton>)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
      <p className="mt-3 text-xs text-muted">Customer-facing automations ship paused. Enable them once your customer list and consent records are in place.</p>
    </>
  );
}
