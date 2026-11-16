import Link from "next/link";
import { Card, PageHeader } from "@/components/ui";

export const metadata = { title: "Help" };

const STEPS: [string, string, string][] = [
  ["1. Add people", "Contacts → Add contact, or Import for CSV/Excel. Record birthdays, date joined and, for customers, marketing consent.", "/contacts/new"],
  ["2. Check the calendar", "Public holidays, occasions and birthdays appear automatically. Confirm Eid and Easter dates when the FG announces them.", "/calendar"],
  ["3. Review templates", "Open a template, edit the wording, preview it as a real person on desktop and mobile, and send yourself a test.", "/templates"],
  ["4. Enable automations", "Staff automations run out of the box. Customer automations start paused: enable them once consent is recorded.", "/automations"],
  ["5. One-off campaigns", "Create campaign → choose template, recipients and time → preview → test → submit for approval.", "/campaigns/new"],
  ["6. Approve & monitor", "Managers approve in Approvals. Track delivery, bounces and complaints in Analytics.", "/approvals"],
];

export default function HelpPage() {
  return (
    <div className="max-w-5xl">
      <PageHeader title="How AOJ Engage works" description="Prepare once. Personalise automatically. Schedule intelligently. Deliver consistently." />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {STEPS.map(([t, d, href]) => (
          <Link key={t} href={href} className="card p-5 transition hover:border-brand">
            <div className="font-semibold text-navy">{t}</div>
            <p className="mt-1 text-sm text-muted">{d}</p>
          </Link>
        ))}
      </div>
      <div className="mt-6 grid gap-6 md:grid-cols-2">
        <Card title="Personalisation">
          <p className="text-sm text-muted">Write <code>{"{{first_name}}"}</code> anywhere and it becomes each recipient&apos;s name. Use <code>{"{{#if staff}}…{{else}}…{{/if}}"}</code> to show different sentences to staff and customers in one template. The preview flags any variable that would be empty.</p>
        </Card>
        <Card title="Safety rules the system enforces">
          <ul className="list-disc space-y-1 pl-4 text-sm text-muted">
            <li>No campaign is sent twice for the same occasion, even after retries or restarts.</li>
            <li>Approved campaigns that change go back for approval.</li>
            <li>Unconfirmed religious holidays are never sent automatically.</li>
            <li>Bounced, complained and unsubscribed addresses are excluded.</li>
            <li>Customers without marketing consent don&apos;t receive greetings.</li>
            <li>The ICT Administrator can suspend all sending instantly.</li>
          </ul>
        </Card>
      </div>
    </div>
  );
}
