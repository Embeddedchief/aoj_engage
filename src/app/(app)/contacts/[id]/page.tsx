import Link from "next/link";
import { notFound } from "next/navigation";
import { Pencil } from "lucide-react";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessCategory } from "@/lib/permissions";
import { CATEGORY_LABEL, isInternal } from "@/lib/constants";
import { birthdayInYear, daysBetween, fmtDate, fmtDateTime, fmtLocal, MONTHS, todayLocal, parseLocal } from "@/lib/time";
import { titleCase } from "@/lib/utils";
import { Badge, Card, Empty, KeyVal, Notice, PageHeader } from "@/components/ui";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { deleteContact, removeSuppression, saveProject, setContactStatus } from "@/actions/contacts";

const RECIPIENT_TONE = { ACCEPTED: "ok", DELIVERED: "ok", QUEUED: "info", SENDING: "info", SUPPRESSED: "neutral", BOUNCED: "bad", COMPLAINED: "bad", REJECTED: "bad", FAILED: "bad" } as const;

export default async function ContactPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const { created } = await searchParams;
  const c = await prisma.contact.findUnique({
    where: { id },
    include: {
      staffProfile: true, customerProfile: true, projects: { orderBy: { updatedAt: "desc" } }, consents: { orderBy: { createdAt: "desc" }, take: 10 },
      recipients: { orderBy: { createdAt: "desc" }, take: 100, include: { campaign: { select: { id: true, name: true, status: true, scheduledAt: true, type: true } } } },
    },
  });
  if (!c) notFound();
  if (!canAccessCategory(user.role, c.category, "read")) notFound();
  const canWrite = canAccessCategory(user.role, c.category, "write");
  const internal = isInternal(c.category);
  const suppression = await prisma.suppression.findUnique({ where: { email: c.email } });
  const today = todayLocal();
  const y = parseLocal(today).year;
  const nextBday = c.birthMonth && c.birthDay ? [birthdayInYear(y, c.birthMonth, c.birthDay), birthdayInYear(y + 1, c.birthMonth, c.birthDay)].find((d) => d >= today)! : null;
  const upcoming = c.recipients.filter((r) => r.status === "QUEUED" && r.campaign.status !== "CANCELLED");
  const history = c.recipients.filter((r) => r.status !== "QUEUED");
  const showBirthday = internal ? user.role !== "COMMS_OFFICER" || c.staffProfile?.birthdayVisibleToColleagues : true;

  return (
    <>
      <PageHeader
        title={`${c.firstName} ${c.lastName}`}
        back={{ href: internal ? "/staff" : "/customers", label: internal ? "Staff" : "Customers" }}
        description={<span className="flex flex-wrap items-center gap-2">{c.email} <Badge tone={internal ? "info" : "brand"}>{CATEGORY_LABEL[c.category]}</Badge> {c.status === "ACTIVE" ? <Badge tone="ok">Active</Badge> : <Badge>Inactive</Badge>}</span>}
        actions={canWrite && (
          <>
            <Link href={`/contacts/${c.id}/edit`} className="btn-secondary"><Pencil className="h-4 w-4" /> Edit</Link>
            <ActionButton action={setContactStatus} fields={{ id: c.id, status: c.status === "ACTIVE" ? "INACTIVE" : "ACTIVE" }} className={c.status === "ACTIVE" ? "btn-danger" : "btn-secondary"} confirm={c.status === "ACTIVE" ? "Deactivate this contact? They will be excluded from all future communications." : undefined}>
              {c.status === "ACTIVE" ? "Deactivate" : "Reactivate"}
            </ActionButton>
          </>
        )}
      />
      {created && <div className="mb-5"><Notice tone="ok">Contact saved.</Notice></div>}
      {suppression && (
        <div className="mb-5">
          <Notice tone="bad" title={`This address is suppressed (${titleCase(suppression.reason)})`}>
            {suppression.detail ?? ""} No campaigns will be delivered to it until the address is corrected{suppression.reason === "HARD_BOUNCE" || suppression.reason === "MANUAL" ? " or the suppression is removed" : ""}.
            {canWrite && (suppression.reason === "HARD_BOUNCE" || suppression.reason === "MANUAL") && <div className="mt-2"><ActionButton action={removeSuppression} fields={{ email: c.email }} className="btn-secondary py-1 text-xs">Remove suppression</ActionButton></div>}
          </Notice>
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <Card title="Profile">
            <KeyVal items={[
              ["Phone", c.phone], ["Organisation", c.organisation], ["Job title", c.jobTitle], [internal ? "Department" : "City", internal ? c.department : c.city],
              ["Birthday", showBirthday && c.birthMonth ? `${c.birthDay} ${MONTHS[c.birthMonth - 1]}${nextBday ? ` (in ${daysBetween(today, nextBday)} days)` : ""}` : c.birthMonth ? "Private" : null],
              ["Birthday greetings", c.birthdayCommsAllowed ? "On" : "Off"],
              ...(internal ? [
                ["Date joined", fmtDate(c.staffProfile?.dateJoined)], ["Employment status", c.staffProfile?.employmentStatus], ["Manager", c.staffProfile?.manager],
                ["Birthday visible to colleagues", c.staffProfile?.birthdayVisibleToColleagues ? "Yes" : "No"],
              ] as [string, React.ReactNode][] : [
                ["Relationship status", c.customerProfile?.relationshipStatus], ["Relationship manager", c.customerProfile?.relationshipManager],
                ["Customer category", c.customerProfile?.customerCategory], ["First engagement", fmtDate(c.customerProfile?.firstEngagement)],
                ["Language", c.customerProfile?.language],
                ["Marketing consent", <Badge key="c" tone={c.marketingConsent === "GRANTED" ? "ok" : c.marketingConsent === "WITHDRAWN" ? "bad" : "warn"}>{c.marketingConsent === "UNKNOWN" ? "Not recorded" : titleCase(c.marketingConsent)}</Badge>],
              ] as [string, React.ReactNode][]),
              ["Added", fmtDate(c.createdAt)], ["Upcoming communication", upcoming[0] ? <Link key="u" className="link" href={`/campaigns/${upcoming[0].campaign.id}`}>{upcoming[0].campaign.name}</Link> : null],
            ]} />
            {c.notes && <p className="mt-4 whitespace-pre-wrap rounded-lg bg-canvas p-3 text-sm">{c.notes}</p>}
          </Card>

          {!internal && (
            <Card title="Projects">
              {c.projects.length === 0 && <p className="mb-3 text-sm text-muted">No projects associated yet.</p>}
              <ul className="mb-4 space-y-2">
                {c.projects.map((p) => (
                  <li key={p.id}>
                    <ActionForm action={saveProject} className="flex flex-wrap items-center gap-2 rounded-lg border border-line p-2">
                      <input type="hidden" name="id" value={p.id} /><input type="hidden" name="contactId" value={c.id} /><input type="hidden" name="name" value={p.name} /><input type="hidden" name="location" value={p.location ?? ""} />
                      <span className="flex-1 text-sm font-medium">{p.name}<span className="block text-xs font-normal text-muted">{p.location}</span></span>
                      {canWrite ? (
                        <>
                          <select name="stage" defaultValue={p.stage} className="input w-auto py-1 text-xs">{["Awarded", "Commenced", "Milestone", "Completed", "Maintenance"].map((s) => <option key={s}>{s}</option>)}</select>
                          <Submit className="btn-secondary px-2 py-1 text-xs">Update</Submit>
                        </>
                      ) : <Badge>{p.stage}</Badge>}
                    </ActionForm>
                  </li>
                ))}
              </ul>
              {canWrite && (
                <ActionForm action={saveProject} resetOnSuccess className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                  <input type="hidden" name="contactId" value={c.id} />
                  <input className="input" name="name" placeholder="Project name" required />
                  <input className="input" name="location" placeholder="Location" />
                  <Submit className="btn-secondary">Add project</Submit>
                </ActionForm>
              )}
              <p className="mt-3 text-xs text-muted">Project emails (milestone, completion) are triggered by authorised updates from the campaign wizard. They are never assumed by the automation engine.</p>
            </Card>
          )}

          {!internal && c.consents.length > 0 && (
            <Card title="Consent record">
              <ul className="space-y-2 text-sm">
                {c.consents.map((r) => (
                  <li key={r.id} className="flex justify-between gap-3"><span><Badge tone={r.status === "GRANTED" ? "ok" : r.status === "WITHDRAWN" ? "bad" : "neutral"}>{titleCase(r.status)}</Badge> <span className="text-muted">{r.source}{r.note ? ` — ${r.note}` : ""}</span></span><span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(r.createdAt)}</span></li>
                ))}
              </ul>
            </Card>
          )}
          {user.role === "SUPER_ADMIN" && history.length === 0 && (
            <ActionButton action={deleteContact} fields={{ id: c.id }} className="btn-danger" confirm="Permanently delete this contact? This cannot be undone.">Delete permanently</ActionButton>
          )}
        </div>

        <Card title={internal ? "Communication history" : "Relationship timeline"} bodyClass="p-0">
          {history.length === 0 && upcoming.length === 0 ? <Empty title="No communications yet" /> : (
            <ol className="relative ml-6 border-l border-line py-4">
              {[...upcoming, ...history].map((r) => (
                <li key={r.id} className="mb-4 ml-5 pr-5">
                  <span className={`absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full ring-4 ring-white ${r.status === "ACCEPTED" || r.status === "DELIVERED" ? "bg-ok" : r.status === "QUEUED" ? "bg-sky-500" : r.status === "SUPPRESSED" ? "bg-navy-300" : "bg-bad"}`} />
                  <div className="text-xs text-muted">{r.sentAt ? fmtDateTime(r.sentAt) : r.campaign.scheduledAt ? `Scheduled ${fmtDateTime(r.campaign.scheduledAt)}` : "—"}</div>
                  <Link href={`/campaigns/${r.campaign.id}`} className="link text-sm">{r.campaign.name}</Link>
                  <div className="mt-0.5"><Badge tone={RECIPIENT_TONE[r.status]}>{titleCase(r.status)}</Badge>{r.reason && !r.reason.startsWith("years:") && <span className="ml-2 text-xs text-muted">{r.reason}</span>}</div>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
      <p className="mt-6 text-xs text-muted">Today: {fmtLocal(today, { weekday: true })}</p>
    </>
  );
}
