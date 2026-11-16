import Link from "next/link";
import { notFound } from "next/navigation";
import { Download, Pencil } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, canWorkWithAudience } from "@/lib/permissions";
import { AUDIENCE_LABEL, STATUS_TONE } from "@/lib/constants";
import { getSettings, senderFor } from "@/lib/settings";
import { renderForContact } from "@/lib/engine";
import { analysePlaceholders, blockTexts, findInvalidLinks } from "@/lib/email/render";
import type { EmailBlock } from "@/lib/blocks";
import { fmtDateTime, fmtLocal } from "@/lib/time";
import { isValidEmail, pct, titleCase } from "@/lib/utils";
import { Badge, Card, KeyVal, Notice, PageHeader, StatCard } from "@/components/ui";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { decideCampaign, excludeRecipient, scheduleCampaign, sendCampaignTest, setCampaignState, submitForApproval } from "@/actions/campaigns";

export const metadata = { title: "Campaign" };
const RTONE = { ACCEPTED: "ok", DELIVERED: "ok", QUEUED: "info", SENDING: "info", SUPPRESSED: "neutral", BOUNCED: "bad", COMPLAINED: "bad", REJECTED: "bad", FAILED: "bad" } as const;

export default async function CampaignPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ as?: string; status?: string }> }) {
  const user = await requirePermission("campaigns:read");
  const { id } = await params;
  const sp = await searchParams;
  const c = await prisma.campaign.findUnique({
    where: { id },
    include: {
      templateVersion: { include: { template: true } }, segment: true, automation: { select: { id: true, name: true } },
      approvals: { orderBy: { createdAt: "desc" }, include: { user: { select: { name: true } } } },
    },
  });
  if (!c || !canWorkWithAudience(user.role, c.audience)) notFound();
  const settings = await getSettings();

  const [recipients, counts, suppressions] = await Promise.all([
    prisma.campaignRecipient.findMany({
      where: { campaignId: c.id, ...(sp.status ? { status: sp.status as never } : {}) }, take: 300, orderBy: [{ status: "asc" }, { email: "asc" }],
      include: { contact: { select: { id: true, firstName: true, lastName: true, preferredName: true, organisation: true, department: true, jobTitle: true, category: true, status: true, marketingConsent: true } }, events: { orderBy: { createdAt: "desc" }, take: 1 } },
    }),
    prisma.campaignRecipient.groupBy({ by: ["status"], where: { campaignId: c.id }, _count: true }),
    prisma.suppression.findMany({ where: { email: { in: (await prisma.campaignRecipient.findMany({ where: { campaignId: c.id }, select: { email: true } })).map((r) => r.email) } }, select: { email: true } }),
  ]);
  const n = Object.fromEntries(counts.map((x) => [x.status, x._count])) as Record<string, number>;
  const total = counts.reduce((s, x) => s + x._count, 0);
  const supp = new Set(suppressions.map((s) => s.email));

  // Pre-send recipient analysis (spec 13.4) over the full list.
  const all = await prisma.campaignRecipient.findMany({ where: { campaignId: c.id }, select: { email: true, status: true, contact: { select: { status: true, marketingConsent: true, category: true } } } });
  const queued = all.filter((r) => r.status === "QUEUED");
  const analysis = {
    total: all.length,
    active: queued.filter((r) => r.contact.status === "ACTIVE").length,
    suppressed: queued.filter((r) => supp.has(r.email)).length,
    invalid: queued.filter((r) => !isValidEmail(r.email)).length,
    noConsent: c.isMarketing ? queued.filter((r) => !["STAFF", "MANAGEMENT", "CONTRACTOR"].includes(r.contact.category) && r.contact.marketingConsent !== "GRANTED").length : 0,
  };
  const batches = Math.max(1, Math.ceil(queued.length / settings.limits.batchSize));

  // Personalised preview for a chosen recipient.
  const previewR = (sp.as && recipients.find((r) => r.contact.id === sp.as)) || recipients[0];
  const blocks = c.templateVersion.blocks as unknown as EmailBlock[];
  const preview = previewR ? await renderForContact({ settings, subject: c.templateVersion.subject, preheader: c.templateVersion.preheader, blocks, contact: previewR.contact, senderId: c.senderIdentity, eventName: c.eventName, eventDate: c.eventDate, yearsOfService: previewR.reason?.startsWith("years:") ? Number(previewR.reason.slice(6)) : null, external: c.isMarketing && c.audience !== "INTERNAL" }) : null;
  const issues = preview ? { ...analysePlaceholders(blockTexts(blocks, c.templateVersion.subject, c.templateVersion.preheader ?? ""), preview.vars, preview.flags), links: findInvalidLinks(blocks, preview.vars, preview.flags) } : null;

  const canWrite = can(user.role, "campaigns:write");
  const canApprove = can(user.role, "campaigns:approve");
  const approvedCurrent = !c.requiresApproval || c.approvedRevision === c.revision;
  const accepted = (n.ACCEPTED ?? 0) + (n.DELIVERED ?? 0);
  const failed = (n.FAILED ?? 0) + (n.REJECTED ?? 0);
  const done = ["SENT", "PARTIALLY_DELIVERED", "FAILED", "PROCESSING"].includes(c.status);
  const latest = c.templateVersion.template.currentVersion;

  return (
    <>
      <PageHeader
        title={c.name}
        back={{ href: "/campaigns", label: "Campaigns" }}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone={STATUS_TONE[c.status]}>{titleCase(c.status)}</Badge><span>Revision {c.revision}</span>{c.requiresApproval ? (approvedCurrent ? <Badge tone="ok">Approved r{c.approvedRevision}</Badge> : <Badge tone="warn">Approval required</Badge>) : <Badge>Pre-approved by policy</Badge>}{c.isMarketing ? <Badge tone="brand">Marketing</Badge> : <Badge>Operational</Badge>}</span>}
        actions={
          <>
            {canWrite && ["DRAFT", "CHANGES_REQUESTED", "AWAITING_APPROVAL", "APPROVED", "SCHEDULED", "PAUSED"].includes(c.status) && <Link href={`/campaigns/${c.id}/edit`} className="btn-secondary"><Pencil className="h-4 w-4" /> Edit</Link>}
            {canWrite && ["DRAFT", "CHANGES_REQUESTED"].includes(c.status) && c.requiresApproval && <ActionButton action={submitForApproval} fields={{ id: c.id }} className="btn-primary">Submit for approval</ActionButton>}
            {canWrite && approvedCurrent && ["DRAFT", "APPROVED", "PAUSED"].includes(c.status) && c.scheduledAt && <ActionButton action={scheduleCampaign} fields={{ id: c.id }} className="btn-primary">Schedule for {fmtDateTime(c.scheduledAt)}</ActionButton>}
            {canWrite && approvedCurrent && ["DRAFT", "APPROVED", "SCHEDULED", "PAUSED"].includes(c.status) && <ActionButton action={scheduleCampaign} fields={{ id: c.id, now: "1" }} className="btn-navy" confirm={`Send to ${queued.length} recipient(s) now?`}>Send now</ActionButton>}
            {["SCHEDULED", "PROCESSING", "APPROVED"].includes(c.status) && user.role !== "AUDITOR" && <ActionButton action={setCampaignState} fields={{ id: c.id, op: "pause" }}>Pause</ActionButton>}
            {canWrite && c.status === "PAUSED" && approvedCurrent && <ActionButton action={setCampaignState} fields={{ id: c.id, op: "resume" }}>Resume</ActionButton>}
            {canWrite && !["SENT", "CANCELLED", "PARTIALLY_DELIVERED", "FAILED"].includes(c.status) && <ActionButton action={setCampaignState} fields={{ id: c.id, op: "cancel" }} className="btn-danger" confirm="Cancel this campaign? Queued messages will not be sent.">Cancel</ActionButton>}
            {canWrite && (c.status === "PARTIALLY_DELIVERED" || c.status === "FAILED") && <ActionButton action={setCampaignState} fields={{ id: c.id, op: "retry" }}>Retry failures</ActionButton>}
          </>
        }
      />

      {c.status === "AWAITING_APPROVAL" && canApprove && (
        <Card title={`Approval decision for revision ${c.revision}`} className="mb-6 border-amber-200">
          <ActionForm action={decideCampaign} className="space-y-3">
            <input type="hidden" name="id" value={c.id} /><input type="hidden" name="revision" value={c.revision} />
            <p className="text-sm text-muted">You are approving this exact content (template “{c.templateVersion.template.name}” v{c.templateVersion.version}), the {analysis.total} recipients listed below and the send time {fmtDateTime(c.scheduledAt)}. Any later change returns the campaign for approval.</p>
            <textarea className="input" name="comment" placeholder="Comment (required when rejecting or requesting changes)" />
            <div className="flex flex-wrap gap-2">
              <Submit name="decision" value="APPROVED" className="btn-primary">Approve</Submit>
              <Submit name="decision" value="CHANGES_REQUESTED" className="btn-secondary">Request changes</Submit>
              <Submit name="decision" value="REJECTED" className="btn-danger">Reject</Submit>
            </div>
          </ActionForm>
        </Card>
      )}
      {c.status === "CHANGES_REQUESTED" && c.approvals[0]?.comment && <div className="mb-6"><Notice tone="warn" title={`Changes requested by ${c.approvals[0].user.name}`}>{c.approvals[0].comment}</Notice></div>}
      {latest !== c.templateVersion.version && !done && <div className="mb-6"><Notice tone="info">This campaign uses template v{c.templateVersion.version}. Version {latest} exists, but approved and scheduled content is never changed silently. Edit the campaign to switch versions.</Notice></div>}

      {done ? (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Recipients selected" value={total} />
          <StatCard label="Accepted by provider" value={accepted} tone="ok" hint={pct(accepted, total - (n.SUPPRESSED ?? 0))} />
          <StatCard label="Delivered" value={n.DELIVERED ?? 0} hint="Where reported by SES" />
          <StatCard label="Bounced" value={n.BOUNCED ?? 0} tone={n.BOUNCED ? "bad" : "neutral"} />
          <StatCard label="Failed" value={failed} tone={failed ? "bad" : "neutral"} />
          <StatCard label="Complaints" value={n.COMPLAINED ?? 0} tone={n.COMPLAINED ? "bad" : "neutral"} hint={`${n.SUPPRESSED ?? 0} suppressed`} />
        </div>
      ) : (
        <div className="mb-6 grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <StatCard label="Total recipients" value={analysis.total} />
          <StatCard label="Active" value={analysis.active} tone="ok" />
          <StatCard label="Suppressed" value={analysis.suppressed} tone={analysis.suppressed ? "warn" : "neutral"} />
          <StatCard label="Invalid emails" value={analysis.invalid} tone={analysis.invalid ? "bad" : "neutral"} />
          <StatCard label="No marketing consent" value={analysis.noConsent} tone={analysis.noConsent ? "warn" : "neutral"} hint={c.isMarketing ? "Will be skipped" : "N/A (operational)"} />
          <StatCard label="Delivery batches" value={batches} hint={`${settings.limits.batchSize} per run · duplicates: 0`} />
        </div>
      )}

      <div className="grid gap-6 xl:grid-cols-[1fr_1.1fr]">
        <div className="space-y-6">
          <Card title="Configuration">
            <KeyVal items={[
              ["Audience", AUDIENCE_LABEL[c.audience]], ["Type", titleCase(c.type)],
              ["Template", <Link key="t" className="link" href={`/templates/${c.templateVersion.templateId}`}>{c.templateVersion.template.name} v{c.templateVersion.version}</Link>],
              ["Recipients", c.segment ? `Segment: ${c.segment.name}` : "Selected contacts / categories"],
              ["Sender", `${senderFor(settings, c.senderIdentity).name} <${senderFor(settings, c.senderIdentity).email}>`],
              ["Send time", fmtDateTime(c.scheduledAt)], ["Occasion", c.eventName ? `${c.eventName}${c.eventDate ? ` · ${fmtLocal(c.eventDate)}` : ""}` : null],
              ["Created", `${fmtDateTime(c.createdAt)} by ${c.createdBy ?? "—"}`], ["Automation", c.automation ? <Link key="a" className="link" href={`/automations/${c.automation.id}`}>{c.automation.name}</Link> : "Manual"],
              ["Completed", fmtDateTime(c.completedAt)],
            ]} />
          </Card>

          <Card title="Approval trail">
            {c.approvals.length === 0 ? <p className="text-sm text-muted">{c.requiresApproval ? "Not yet submitted." : "This campaign is pre-approved by automation policy."}</p> : (
              <ul className="space-y-2 text-sm">{c.approvals.map((a) => <li key={a.id} className="flex justify-between gap-3"><span><Badge tone={a.decision === "APPROVED" ? "ok" : a.decision === "SUBMITTED" ? "info" : "warn"}>{titleCase(a.decision)}</Badge> r{a.revision} by {a.user.name}{a.comment && <span className="text-muted"> — “{a.comment}”</span>}</span><span className="whitespace-nowrap text-xs text-muted">{fmtDateTime(a.createdAt)}</span></li>)}</ul>
            )}
          </Card>

          <Card title="Recipients" actions={<a className="link flex items-center gap-1 text-xs" href={`/api/export/campaign/${c.id}`}><Download className="h-3.5 w-3.5" /> Export CSV</a>} bodyClass="p-0">
            <div className="flex flex-wrap gap-1.5 border-b border-line px-4 py-2 text-xs">
              <Link href={`/campaigns/${c.id}`} className={!sp.status ? "font-semibold text-navy" : "text-muted"}>All ({total})</Link>
              {Object.entries(n).map(([s, k]) => <Link key={s} href={`/campaigns/${c.id}?status=${s}`} className={sp.status === s ? "font-semibold text-navy" : "text-muted"}>· {titleCase(s)} ({k})</Link>)}
            </div>
            <div className="max-h-[520px] overflow-auto">
              <table className="table">
                <thead><tr><th>Recipient</th><th>Status</th><th>Detail</th><th /></tr></thead>
                <tbody>
                  {recipients.map((r) => (
                    <tr key={r.id}>
                      <td><Link className="link" href={`/campaigns/${c.id}?as=${r.contact.id}`}>{r.contact.firstName} {r.contact.lastName}</Link><div className="text-xs text-muted">{r.email}</div></td>
                      <td><Badge tone={RTONE[r.status]}>{titleCase(r.status)}</Badge>{r.status === "QUEUED" && supp.has(r.email) && <Badge tone="bad" className="ml-1">Suppressed</Badge>}</td>
                      <td className="max-w-[240px] text-xs text-muted">{r.reason && !r.reason.startsWith("years:") ? r.reason : r.events[0]?.detail ?? (r.sentAt ? fmtDateTime(r.sentAt) : "")}</td>
                      <td className="text-right">{canWrite && r.status === "QUEUED" && !done && <ActionButton action={excludeRecipient} fields={{ recipientId: r.id }} className="btn-ghost px-2 py-0.5 text-xs" confirm="Exclude this recipient? The campaign will need re-approval if it was approved.">Exclude</ActionButton>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {recipients.length >= 300 && <p className="border-t border-line px-4 py-2 text-xs text-muted">Showing the first 300. Export CSV for the full list.</p>}
          </Card>
        </div>

        <div className="space-y-4">
          {issues && (issues.missing.length > 0 || issues.unknown.length > 0 || issues.links.length > 0) && (
            <Notice tone="warn" title="Check before sending">
              {issues.missing.length > 0 && <div>Missing values for this recipient: {issues.missing.map((m) => `{{${m}}}`).join(", ")}</div>}
              {issues.unknown.length > 0 && <div>Unknown variables: {issues.unknown.join(", ")}</div>}
              {issues.links.length > 0 && <div>Invalid links: {issues.links.join("; ")}</div>}
            </Notice>
          )}
          <Card title={preview ? `Preview as ${previewR!.contact.firstName} ${previewR!.contact.lastName}` : "Preview"} bodyClass="p-0">
            {preview ? (
              <>
                <div className="border-b border-line bg-canvas/60 px-4 py-2 text-xs"><span className="text-muted">Subject:</span> <strong>{preview.subject}</strong></div>
                <iframe title="Email preview" sandbox="" srcDoc={preview.html} className="h-[720px] w-full bg-[#F4F2EE]" />
              </>
            ) : <p className="p-5 text-sm text-muted">No recipients to preview.</p>}
          </Card>
          {user.role !== "AUDITOR" && (
            <Card title="Send a test">
              <ActionForm action={sendCampaignTest} className="flex flex-wrap gap-2">
                <input type="hidden" name="id" value={c.id} />
                <input className="input flex-1" type="email" name="to" defaultValue={user.email} required />
                <Submit className="btn-secondary">Send test</Submit>
              </ActionForm>
              <p className="mt-2 text-xs text-muted">Marked [TEST], personalised with the first recipient, limited to authorised internal addresses, never counted as a delivery.</p>
            </Card>
          )}
        </div>
      </div>
    </>
  );
}
