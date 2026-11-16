import Link from "next/link";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/time";
import { PageHeader } from "@/components/ui";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Audit log" };

export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const user = await requirePermission("audit:read");
  const { q, page: p } = await searchParams;
  const page = Math.max(1, Number(p) || 1);
  const where = q ? { OR: [{ action: { contains: q, mode: "insensitive" as const } }, { detail: { contains: q, mode: "insensitive" as const } }, { user: { name: { contains: q, mode: "insensitive" as const } } }] } : {};
  const [total, logs] = await Promise.all([
    prisma.auditLog.count({ where }),
    prisma.auditLog.findMany({ where, orderBy: { createdAt: "desc" }, skip: (page - 1) * 100, take: 100, include: { user: { select: { name: true, email: true } } } }),
  ]);
  return (
    <>
      <PageHeader title={can(user.role, "settings:write") ? "Settings" : "Audit log"} description="Append-only record of sign-ins, data changes, approvals, sends and permission changes. No user, including administrators, can edit or delete entries from the application." />
      {can(user.role, "settings:write") && <SettingsTabs active="/settings/audit" />}
      <form className="mb-4 flex gap-2"><input className="input max-w-sm" name="q" defaultValue={q} placeholder="Filter by action, detail or user" /><button className="btn-navy">Search</button></form>
      <div className="card overflow-x-auto">
        <table className="table">
          <thead><tr><th>When</th><th>User</th><th>Action</th><th>Detail</th><th>IP</th></tr></thead>
          <tbody>
            {logs.map((l) => (
              <tr key={l.id}>
                <td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(l.createdAt)}</td>
                <td className="whitespace-nowrap text-sm">{l.user?.name ?? <span className="text-muted">System</span>}</td>
                <td className="whitespace-nowrap font-mono text-xs">{l.action}</td>
                <td className="max-w-xl text-xs text-muted">{l.detail}{l.entity && l.entityId && l.entity === "Campaign" && <> · <Link className="link" href={`/campaigns/${l.entityId}`}>open</Link></>}{l.entity === "Contact" && l.entityId && <> · <Link className="link" href={`/contacts/${l.entityId}`}>open</Link></>}</td>
                <td className="text-xs text-muted">{l.ip ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="flex justify-between border-t border-line px-4 py-3 text-sm text-muted">
          <span>{total} entries</span>
          <span className="flex gap-2">
            {page > 1 && <Link className="btn-secondary px-2.5 py-1" href={`?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page - 1) })}`}>Newer</Link>}
            {page * 100 < total && <Link className="btn-secondary px-2.5 py-1" href={`?${new URLSearchParams({ ...(q ? { q } : {}), page: String(page + 1) })}`}>Older</Link>}
          </span>
        </div>
      </div>
    </>
  );
}
