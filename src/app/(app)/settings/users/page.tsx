import type { Role } from "@prisma/client";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { DEPARTMENTS, ROLE_LABEL } from "@/lib/constants";
import { fmtDateTime } from "@/lib/time";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { createUser, resetUserPassword, updateUser } from "@/actions/admin";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Users & roles" };

const ROLE_HELP: Record<Role, string> = {
  SUPER_ADMIN: "Full control: users, settings, providers, all data",
  COMMS_OFFICER: "Campaigns, templates, calendar, customers; submits for approval",
  HR: "Employee records, birthdays, internal announcements (no customer data)",
  APPROVER: "Reviews, approves or rejects campaigns; views reports",
  AUDITOR: "Read-only access to history, reports and audit logs",
};

export default async function UsersPage() {
  const me = await requirePermission("users:write");
  const users = await prisma.user.findMany({ orderBy: [{ active: "desc" }, { name: "asc" }] });
  const roles = Object.keys(ROLE_LABEL) as Role[];
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs active="/settings/users" />
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card title={`Accounts (${users.length})`} bodyClass="p-0">
          <div className="overflow-x-auto">
            <table className="table">
              <thead><tr><th>User</th><th>Role</th><th>Last sign-in</th><th>Manage</th></tr></thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className={!u.active ? "opacity-60" : ""}>
                    <td><div className="font-medium text-navy">{u.name}{u.id === me.id && <span className="ml-1 text-xs text-muted">(you)</span>}</div><div className="text-xs text-muted">{u.email}{u.department ? ` · ${u.department}` : ""}</div>{!u.active && <Badge>Deactivated</Badge>}{u.lockedUntil && u.lockedUntil > new Date() && <Badge tone="bad">Locked</Badge>}</td>
                    <td><Badge tone={u.role === "SUPER_ADMIN" ? "brand" : "neutral"}>{ROLE_LABEL[u.role]}</Badge></td>
                    <td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(u.lastLoginAt)}</td>
                    <td>
                      <ActionForm action={updateUser} className="flex flex-wrap items-center gap-1.5">
                        <input type="hidden" name="id" value={u.id} />
                        <select name="role" defaultValue={u.role} className="input w-auto py-1 text-xs">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
                        <select name="active" defaultValue={String(u.active)} className="input w-auto py-1 text-xs"><option value="true">Active</option><option value="false">Deactivated</option></select>
                        <Submit className="btn-secondary px-3 py-1 text-xs">Save</Submit>
                      </ActionForm>
                      <ActionForm action={resetUserPassword} className="mt-1.5">
                        <input type="hidden" name="id" value={u.id} />
                        <Submit className="btn-ghost px-2 py-0.5 text-xs text-brand">Reset password &amp; email it</Submit>
                      </ActionForm>
                      {u.mustChangePassword && <div className="mt-1"><Badge tone="warn">Must set own password</Badge></div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-6">
          <Card title="Add user">
            <ActionForm action={createUser} resetOnSuccess className="space-y-3">
              <input className="input" name="name" placeholder="Full name" required />
              <input className="input" name="email" type="email" placeholder="Work email" required />
              <select className="input" name="role" defaultValue="COMMS_OFFICER">{roles.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}</select>
              <select className="input" name="department" defaultValue=""><option value="">Department…</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select>
              <input className="input" name="position" placeholder="Position (used as sender position)" />
              <input className="input" name="password" type="text" placeholder="Temporary password (leave empty to generate)" autoComplete="off" />
              <Submit className="btn-primary w-full">Create account &amp; email login details</Submit>
              <p className="text-xs text-muted">They receive an AOJ email with a temporary password, and must choose their own password the first time they sign in.</p>
            </ActionForm>
          </Card>
          <Card title="Role permissions">
            <ul className="space-y-2 text-sm">{roles.map((r) => <li key={r}><span className="font-semibold text-navy">{ROLE_LABEL[r]}</span><div className="text-xs text-muted">{ROLE_HELP[r]}</div></li>)}</ul>
            <p className="mt-3 text-xs text-muted">Changing a role, deactivating an account or resetting a password signs that user out everywhere.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
