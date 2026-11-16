import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { Card, Notice, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { savePolicies, setSuspension } from "@/actions/admin";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "Policies & safety" };

export default async function PoliciesPage() {
  await requirePermission("settings:write");
  const s = await getSettings();
  return (
    <>
      <PageHeader title="Settings" />
      <SettingsTabs active="/settings/policies" />
      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <Card title="Sending limits, approvals & privacy">
          <ActionForm action={savePolicies} className="grid gap-4 md:grid-cols-2">
            <label><span className="label">Routine customer emails per week (max)</span><input className="input" type="number" name="routinePerWeek" defaultValue={s.limits.routinePerWeek} min={1} max={7} /></label>
            <label><span className="label">Approval required above (recipients)</span><input className="input" type="number" name="approvalThreshold" defaultValue={s.limits.approvalThreshold} /></label>
            <label><span className="label">Per-campaign recipient limit</span><input className="input" type="number" name="perCampaignMax" defaultValue={s.limits.perCampaignMax} /></label>
            <label><span className="label">Daily sending limit</span><input className="input" type="number" name="dailyMax" defaultValue={s.limits.dailyMax} /></label>
            <label><span className="label">Messages per engine run (batch)</span><input className="input" type="number" name="batchSize" defaultValue={s.limits.batchSize} /></label>
            <label><span className="label">Default reminder days</span><input className="input" name="reminderDays" defaultValue={s.reminders.defaultDays.join(", ")} /></label>
            <label className="md:col-span-2"><span className="label">Authorised test-email domains (comma-separated)</span><input className="input" name="testRecipientDomains" defaultValue={s.sending.testRecipientDomains.join(", ")} /></label>
            <label className="flex items-center gap-2 text-sm md:col-span-2"><input type="checkbox" name="manualCampaignsRequireApproval" defaultChecked={s.approvals.manualCampaignsRequireApproval} className="h-4 w-4 accent-brand" /> All manually created campaigns require management approval</label>
            <label><span className="label">Data retention (months)</span><input className="input" type="number" name="retentionMonths" defaultValue={s.privacy.retentionMonths} /></label>
            <label className="md:col-span-2"><span className="label">Purpose of processing (NDPA 2023 record)</span><textarea className="input min-h-24" name="purposeStatement" defaultValue={s.privacy.purposeStatement} /></label>
            <div className="flex justify-end md:col-span-2"><Submit>Save policies</Submit></div>
          </ActionForm>
        </Card>
        <Card title="Emergency sending suspension">
          {s.sending.suspended ? (
            <>
              <Notice tone="bad" title="All sending is suspended">{s.sending.suspendedReason}</Notice>
              <ActionForm action={setSuspension} className="mt-4"><input type="hidden" name="suspended" value="false" /><Submit className="btn-primary w-full">Resume sending</Submit></ActionForm>
            </>
          ) : (
            <ActionForm action={setSuspension} className="space-y-3" confirm="Stop ALL outgoing email immediately?">
              <p className="text-sm text-muted">Immediately stops every campaign and automation from sending, e.g. after a wrong message, a compromised account or a bounce spike. Queued messages wait until sending resumes.</p>
              <input type="hidden" name="suspended" value="true" />
              <input className="input" name="reason" placeholder="Reason" required />
              <Submit className="btn-danger w-full">Suspend all sending</Submit>
            </ActionForm>
          )}
        </Card>
      </div>
    </>
  );
}
