import Link from "next/link";
import { Cake, Upload, UserPlus, Users } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { CATEGORY_LABEL, DEPARTMENTS } from "@/lib/constants";
import { birthdayInYear, daysBetween, fmtDate, MONTHS, parseLocal, todayLocal } from "@/lib/time";
import { Badge, Card, Empty, PageHeader } from "@/components/ui";

export const metadata = { title: "Staff directory" };

export default async function StaffPage({ searchParams }: { searchParams: Promise<{ q?: string; department?: string }> }) {
  const user = await requirePermission("contacts:read:internal");
  const { q, department } = await searchParams;
  const staff = await prisma.contact.findMany({
    where: {
      category: { in: ["STAFF", "MANAGEMENT", "CONTRACTOR"] }, status: "ACTIVE",
      ...(department ? { department } : {}),
      ...(q ? { OR: [{ firstName: { contains: q, mode: "insensitive" } }, { lastName: { contains: q, mode: "insensitive" } }, { email: { contains: q, mode: "insensitive" } }, { jobTitle: { contains: q, mode: "insensitive" } }] } : {}),
    },
    include: { staffProfile: true },
    orderBy: [{ lastName: "asc" }],
  });
  const today = todayLocal();
  const y = parseLocal(today).year;
  // HR and admins see birthdays; others only where the employee allowed it.
  const seesBirthdays = (s: (typeof staff)[number]) => user.role === "SUPER_ADMIN" || user.role === "HR" || s.staffProfile?.birthdayVisibleToColleagues;
  const next = (m: number, d: number) => [birthdayInYear(y, m, d), birthdayInYear(y + 1, m, d)].find((x) => x >= today)!;
  const upcoming = staff
    .filter((s) => s.birthMonth && s.birthDay && s.birthdayCommsAllowed && seesBirthdays(s))
    .map((s) => ({ s, date: next(s.birthMonth!, s.birthDay!) }))
    .filter((x) => daysBetween(today, x.date) <= 31)
    .sort((a, b) => a.date.localeCompare(b.date));
  const anniversaries = staff
    .filter((s) => s.staffProfile?.dateJoined)
    .map((s) => { const j = s.staffProfile!.dateJoined!; const date = next(j.getUTCMonth() + 1, j.getUTCDate()); return { s, date, years: parseLocal(date).year - j.getUTCFullYear() }; })
    .filter((x) => x.years >= 1 && daysBetween(today, x.date) <= 31)
    .sort((a, b) => a.date.localeCompare(b.date));
  const canWrite = can(user.role, "contacts:write:internal");

  return (
    <>
      <PageHeader
        title="Staff directory"
        description="Employees, management and contractors. Birthdays and anniversaries drive automatic recognition messages."
        actions={canWrite && <><Link href="/contacts/import" className="btn-secondary"><Upload className="h-4 w-4" /> Import staff</Link><Link href="/contacts/new?category=STAFF" className="btn-primary"><UserPlus className="h-4 w-4" /> Add staff</Link></>}
      />
      <div className="grid gap-6 xl:grid-cols-[1fr_340px]">
        <div>
          <form className="card mb-4 flex flex-wrap items-end gap-3 p-4">
            <label className="min-w-[200px] flex-1"><span className="label">Search</span><input className="input" name="q" defaultValue={q} placeholder="Name, email or job title" /></label>
            <label><span className="label">Department</span><select className="input" name="department" defaultValue={department ?? ""}><option value="">All departments</option>{DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}</select></label>
            <button className="btn-navy">Filter</button>
          </form>
          <div className="card overflow-x-auto">
            {staff.length === 0 ? <Empty icon={Users} title="No staff records yet" action={canWrite ? <Link className="btn-primary" href="/contacts/new?category=STAFF">Add staff</Link> : undefined} /> : (
              <table className="table">
                <thead><tr><th>Name</th><th>Department</th><th>Job title</th><th>Birthday</th><th>Joined</th><th>Status</th></tr></thead>
                <tbody>
                  {staff.map((s) => (
                    <tr key={s.id}>
                      <td><Link className="link" href={`/contacts/${s.id}`}>{s.preferredName ?? s.firstName} {s.lastName}</Link><div className="text-xs text-muted">{s.email}</div></td>
                      <td className="text-muted">{s.department ?? "—"}</td>
                      <td className="text-muted">{s.jobTitle ?? "—"}{s.category !== "STAFF" && <Badge className="ml-2">{CATEGORY_LABEL[s.category]}</Badge>}</td>
                      <td className="whitespace-nowrap text-muted">{s.birthMonth && seesBirthdays(s) ? `${s.birthDay} ${MONTHS[s.birthMonth - 1].slice(0, 3)}` : s.birthMonth ? "Private" : "—"}</td>
                      <td className="whitespace-nowrap text-muted">{fmtDate(s.staffProfile?.dateJoined)}</td>
                      <td><Badge tone="ok">{s.staffProfile?.employmentStatus ?? "Active"}</Badge></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
        <div className="space-y-6">
          <Card title={<span className="flex items-center gap-2"><Cake className="h-4 w-4 text-brand" /> Birthdays — next 31 days</span>} bodyClass="p-0">
            {upcoming.length === 0 ? <p className="p-5 text-sm text-muted">No upcoming birthdays.</p> : (
              <ul className="divide-y divide-line">{upcoming.map(({ s, date }) => (
                <li key={s.id} className="flex justify-between px-5 py-2.5 text-sm"><Link className="link" href={`/contacts/${s.id}`}>{s.firstName} {s.lastName}</Link><span className="text-muted">{daysBetween(today, date) === 0 ? <Badge tone="brand">Today</Badge> : `${parseLocal(date).day} ${MONTHS[parseLocal(date).month - 1].slice(0, 3)}`}</span></li>
              ))}</ul>
            )}
          </Card>
          <Card title="Work anniversaries — next 31 days" bodyClass="p-0">
            {anniversaries.length === 0 ? <p className="p-5 text-sm text-muted">None in the next month.</p> : (
              <ul className="divide-y divide-line">{anniversaries.map(({ s, date, years }) => (
                <li key={s.id} className="flex justify-between px-5 py-2.5 text-sm"><span><Link className="link" href={`/contacts/${s.id}`}>{s.firstName} {s.lastName}</Link> <span className="text-muted">· {years} yr{years > 1 ? "s" : ""}</span></span><span className="text-muted">{parseLocal(date).day} {MONTHS[parseLocal(date).month - 1].slice(0, 3)}</span></li>
              ))}</ul>
            )}
          </Card>
        </div>
      </div>
    </>
  );
}
