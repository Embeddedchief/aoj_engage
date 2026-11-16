import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { fmtDateTime } from "@/lib/time";
import { titleCase } from "@/lib/utils";
import { Badge, Card, PageHeader } from "@/components/ui";
import { ActionButton, ActionForm, Submit } from "@/components/forms";
import { addSuppression } from "@/actions/admin";
import { removeSuppression } from "@/actions/contacts";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Suppression list" };

export default async function SuppressionsPage() {
  const user = await requirePermission("campaigns:read");
  const list = await prisma.suppression.findMany({ orderBy: { createdAt: "desc" }, take: 500 });
  const withdrawn = await prisma.contact.count({ where: { marketingConsent: "WITHDRAWN" } });
  return (
    <>
      <PageHeader title="Settings" />
      {can(user.role, "settings:write") && <SettingsTabs active="/settings/suppressions" />}
      <div className="grid gap-6 xl:grid-cols-[1.6fr_1fr]">
        <Card title={`Suppressed addresses (${list.length})`} bodyClass="p-0">
          <div className="max-h-[640px] overflow-auto">
            <table className="table">
              <thead><tr><th>Email</th><th>Reason</th><th>Detail</th><th>Since</th><th /></tr></thead>
              <tbody>
                {list.length === 0 && <tr><td colSpan={5} className="py-8 text-center text-muted">No suppressed addresses.</td></tr>}
                {list.map((s) => (
                  <tr key={s.id}>
                    <td className="font-medium">{s.email}</td>
                    <td><Badge tone={s.reason === "COMPLAINT" ? "bad" : s.reason === "HARD_BOUNCE" ? "warn" : "neutral"}>{titleCase(s.reason)}</Badge></td>
                    <td className="max-w-xs truncate text-xs text-muted">{s.detail}</td>
                    <td className="whitespace-nowrap text-xs text-muted">{fmtDateTime(s.createdAt)}</td>
                    <td>{can(user.role, "campaigns:write") && (s.reason === "HARD_BOUNCE" || s.reason === "MANUAL") && <ActionButton action={removeSuppression} fields={{ email: s.email }} className="btn-ghost px-2 py-1 text-xs" confirm="Remove this suppression? Only do this once the address is confirmed correct.">Remove</ActionButton>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <div className="space-y-6">
          {can(user.role, "campaigns:write") && (
            <Card title="Suppress an address">
              <ActionForm action={addSuppression} resetOnSuccess className="space-y-3">
                <input className="input" type="email" name="email" placeholder="email@example.com" required />
                <input className="input" name="detail" placeholder="Reason (e.g. requested by phone)" />
                <Submit className="btn-secondary w-full">Suppress</Submit>
              </ActionForm>
            </Card>
          )}
          <Card title="How suppression works">
            <ul className="list-disc space-y-1.5 pl-4 text-sm text-muted">
              <li>Permanent bounces and spam complaints are suppressed automatically from SES events.</li>
              <li>Suppressed addresses receive nothing until corrected; complaints can only be lifted by the recipient.</li>
              <li>{withdrawn} contact(s) have withdrawn marketing consent: they still receive operational/project emails, but no greetings or relationship emails.</li>
              <li>Temporary failures are retried with exponential backoff (5, 10, 20 min), then marked failed. Invalid addresses are never retried endlessly.</li>
            </ul>
          </Card>
        </div>
      </div>
    </>
  );
}
