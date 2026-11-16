import { CheckCircle2, CircleDashed } from "lucide-react";
import { requirePermission } from "@/lib/auth";
import { getSettings } from "@/lib/settings";
import { providerMode } from "@/lib/email/provider";
import { Badge, Card, Notice, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { saveBranding, saveSenders } from "@/actions/admin";
import { SettingsTabs } from "./tabs";

export const metadata = { title: "Settings" };

export default async function SettingsPage() {
  await requirePermission("settings:write");
  const s = await getSettings();
  const mode = providerMode();
  const env = (k: string) => !!process.env[k];
  const checks: [string, boolean, string][] = [
    ["DATABASE_URL", env("DATABASE_URL"), "Postgres connection"],
    ["SESSION_SECRET", (process.env.SESSION_SECRET ?? "").length >= 32, "Session signing key (32+ chars)"],
    ["CRON_SECRET", env("CRON_SECRET"), "Protects the scheduled engine endpoint"],
    ["APP_URL", env("APP_URL"), "Used in unsubscribe links"],
    ["AWS_ACCESS_KEY_ID / SECRET / REGION", mode === "ses", "Amazon SES credentials (IAM user limited to ses:SendEmail)"],
    ["AWS_SES_CONFIGURATION_SET", env("AWS_SES_CONFIGURATION_SET"), "Publishes delivery/bounce/complaint events"],
    ["SES_SNS_TOPIC_ARNS", env("SES_SNS_TOPIC_ARNS"), "Allowed SNS topics for /api/webhooks/ses"],
    ["OPENAI_API_KEY", env("OPENAI_API_KEY"), "Optional: AI writing assistant"],
  ];
  const social = (l: string) => s.brand.socials.find((x) => x.label === l)?.url ?? "";
  return (
    <>
      <PageHeader title="Settings" description="Email, branding and system configuration. Secrets are stored in Vercel environment variables, never in the database or in Git." />
      <SettingsTabs active="/settings" />
      <div className="grid gap-6 xl:grid-cols-2">
        <Card title="Branding (used in every email)">
          <ActionForm action={saveBranding} className="grid gap-4 md:grid-cols-2">
            <label><span className="label">Company name</span><input className="input" name="companyName" defaultValue={s.brand.companyName} /></label>
            <label><span className="label">Short name</span><input className="input" name="shortName" defaultValue={s.brand.shortName} /></label>
            <label><span className="label">Website</span><input className="input" name="website" defaultValue={s.brand.website} /></label>
            <label><span className="label">Public email</span><input className="input" name="email" defaultValue={s.brand.email} /></label>
            <label><span className="label">Phone</span><input className="input" name="phone" defaultValue={s.brand.phone} /></label>
            <label><span className="label">Address</span><input className="input" name="address" defaultValue={s.brand.address} /></label>
            <label className="md:col-span-2"><span className="label">Official logo URL (https, PNG ~80px tall)</span><input className="input" name="logoUrl" defaultValue={s.brand.logoUrl} placeholder="Leave empty to use the bundled logo (public/icon.png)" /></label>
            {["LinkedIn", "Facebook", "Instagram", "X"].map((l) => <label key={l}><span className="label">{l}</span><input className="input" name={`social_${l}`} defaultValue={social(l)} placeholder="https://" /></label>)}
            <div className="flex justify-end md:col-span-2"><Submit>Save branding</Submit></div>
          </ActionForm>
        </Card>

        <div className="space-y-6">
          <Card title="Email delivery" actions={<Badge tone={mode === "ses" ? "ok" : "warn"}>{mode === "ses" ? "Amazon SES connected" : "Simulation mode"}</Badge>}>
            {mode === "simulation" && <div className="mb-4"><Notice tone="warn">No email is sent. Deliveries are recorded as accepted (addresses containing “bounce” simulate a hard bounce). Add the AWS variables to go live.</Notice></div>}
            <ul className="space-y-2 text-sm">
              {checks.map(([k, ok, d]) => <li key={k} className="flex items-start gap-2">{ok ? <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-ok" /> : <CircleDashed className="mt-0.5 h-4 w-4 shrink-0 text-muted" />}<span><code className="text-xs">{k}</code><span className="block text-xs text-muted">{d}</span></span></li>)}
            </ul>
            <div className="mt-4 rounded-lg bg-canvas p-3 text-xs text-muted">
              <div className="mb-1 font-semibold text-navy">Domain authentication checklist (aojglobal.com)</div>
              Verify the domain in SES · publish the 3 DKIM CNAMEs · SPF: include amazonses.com via a custom MAIL FROM subdomain (e.g. mail.aojglobal.com) · DMARC: <code>v=DMARC1; p=quarantine; rua=mailto:dmarc@aojglobal.com</code> · request SES production access · create a configuration set with an SNS event destination → <code>{process.env.APP_URL ?? "https://your-app"}/api/webhooks/ses</code>
            </div>
          </Card>

          <Card title="Sender identities">
            <ActionForm action={saveSenders} className="space-y-3">
              {s.senders.map((x) => (
                <div key={x.id} className="grid grid-cols-[90px_1fr_1fr] gap-2">
                  <input className="input text-xs" name="senderId" defaultValue={x.id} readOnly />
                  <input className="input" name="senderName" defaultValue={x.name} />
                  <input className="input" name="senderEmail" defaultValue={x.email} />
                </div>
              ))}
              <div className="grid grid-cols-[90px_1fr_1fr] gap-2 border-t border-line pt-3">
                <input className="input text-xs" name="newId" placeholder="id" />
                <input className="input" name="newName" placeholder="Add: display name" />
                <input className="input" name="newEmail" placeholder="address@aojglobal.com" />
              </div>
              <div className="flex items-end justify-between gap-3">
                <label><span className="label">Default send time</span><input className="input" type="time" name="defaultSendTime" defaultValue={s.defaultSendTime} /></label>
                <Submit>Save senders</Submit>
              </div>
              <p className="text-xs text-muted">Use dedicated identities (communications@, hr@, customers@, notifications@), never a personal mailbox. Clear a name to remove an identity.</p>
            </ActionForm>
          </Card>
        </div>
      </div>
    </>
  );
}
