"use client";

import { useActionState, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CalendarClock, CheckCircle2, Megaphone, PartyPopper, Send, Tag, Users } from "lucide-react";
import { BROADCAST_GROUPS, BROADCAST_KINDS, buildBroadcastBlocks, type BroadcastGroup, type BroadcastKind } from "@/lib/broadcast";
import { contactVars, contactFlags, renderEmail, type Brand } from "@/lib/email/render";
import { countBroadcastRecipients, sendBroadcast, testBroadcast } from "@/actions/broadcast";
import { FormMessage, Submit } from "@/components/forms";
import { cn } from "@/lib/utils";

const KIND_ICON = { announcement: Megaphone, urgent: AlertTriangle, meeting: CalendarClock, celebration: PartyPopper, advert: Tag } as const;

const STARTERS: Record<BroadcastKind, { subject: string; headline: string; message: string }> = {
  announcement: { subject: "Important update from AOJ Global", headline: "Company announcement", message: "We would like to inform you that …\n\nPlease take note and reach out to your line manager if you have any questions." },
  urgent: { subject: "URGENT: Please read immediately", headline: "Urgent notice", message: "Please be informed that …\n\nThis takes effect immediately. Kindly act accordingly." },
  meeting: { subject: "Meeting notice: General staff meeting", headline: "General staff meeting", message: "You are invited to a general staff meeting.\n\n**Date:** \n**Time:** \n**Venue:** \n\nAttendance is compulsory. Please be punctual." },
  celebration: { subject: "Celebrating a great milestone together", headline: "Congratulations, team!", message: "We are delighted to share that …\n\nThank you all for the hard work that made this possible." },
  advert: { subject: "How AOJ Global can support your next project", headline: "Engineering you can rely on", message: "From HVAC and fire-fighting systems to power distribution, solar and plumbing, AOJ Global delivers Mechanical, Electrical and Plumbing projects of every scale.\n\nPlanning a new build or an upgrade? Reply to this email and our team will get back to you." },
};

export function BroadcastComposer({ brand, userName, userEmail, groups }: { brand: Brand; userName: string; userEmail: string; groups: BroadcastGroup[] }) {
  const router = useRouter();
  const [kind, setKind] = useState<BroadcastKind>("announcement");
  const [group, setGroup] = useState<BroadcastGroup>(groups[0]);
  const [subject, setSubject] = useState(STARTERS.announcement.subject);
  const [headline, setHeadline] = useState(STARTERS.announcement.headline);
  const [message, setMessage] = useState(STARTERS.announcement.message);
  const [buttonLabel, setButtonLabel] = useState("");
  const [buttonUrl, setButtonUrl] = useState("");
  const [signOff, setSignOff] = useState(`Regards,\n**${userName}**\nAOJ Global Concept Limited`);
  const [when, setWhen] = useState<"now" | "later">("now");
  const [count, setCount] = useState<number | null>(null);
  const [, startCount] = useTransition();
  const [sendState, sendAction] = useActionState(sendBroadcast, null);
  const [testState, testAction] = useActionState(testBroadcast, null);
  const [touched, setTouched] = useState(false);

  useEffect(() => {
    if (sendState?.ok && sendState.redirectTo) router.push(sendState.redirectTo);
  }, [sendState, router]);

  useEffect(() => {
    setCount(null);
    startCount(async () => setCount((await countBroadcastRecipients(group)).count));
  }, [group]);

  const pickKind = (k: BroadcastKind) => {
    setKind(k);
    if (!touched) {
      setSubject(STARTERS[k].subject);
      setHeadline(STARTERS[k].headline);
      setMessage(STARTERS[k].message);
    }
  };

  const html = useMemo(() => {
    const [first, ...rest] = userName.split(/\s+/);
    const internal = BROADCAST_GROUPS[group].audience === "INTERNAL";
    const c = { firstName: first, lastName: rest.join(" "), preferredName: null, organisation: null, department: null, jobTitle: null };
    return renderEmail({
      subject, preheader: headline,
      blocks: buildBroadcastBlocks({ kind, subject, headline, message, buttonLabel, buttonUrl, signOff }),
      vars: contactVars(c, { brand, senderName: userName }), flags: contactFlags(internal ? "STAFF" : "CUSTOMER"), brand,
    }).html;
  }, [kind, group, subject, headline, message, buttonLabel, buttonUrl, signOff, brand, userName]);

  const edit = <T,>(set: (v: T) => void) => (v: T) => { setTouched(true); set(v); };
  const marketingWarning = BROADCAST_KINDS[kind].marketing && BROADCAST_GROUPS[group].audience !== "INTERNAL";

  return (
    <form action={sendAction} className="grid gap-5 xl:grid-cols-[1fr_minmax(0,620px)]">
      <div className="space-y-5">
        <section className="card p-6">
          <h2 className="text-[15px] font-bold text-navy">1 · What kind of message?</h2>
          <input type="hidden" name="kind" value={kind} />
          <div className="mt-4 grid gap-2 sm:grid-cols-2">
            {(Object.keys(BROADCAST_KINDS) as BroadcastKind[]).map((k) => {
              const I = KIND_ICON[k];
              const on = k === kind;
              return (
                <button type="button" key={k} onClick={() => pickKind(k)} className={cn("flex items-start gap-3 rounded-2xl border p-3 text-left transition", on ? "border-navy bg-navy text-white shadow-lift" : "border-line hover:border-navy")}>
                  <span className={cn("grid h-9 w-9 shrink-0 place-items-center rounded-full", on ? "bg-brand text-white" : k === "urgent" ? "bg-brand-50 text-brand" : "bg-canvas text-navy")}><I className="h-4 w-4" /></span>
                  <span><span className="block text-sm font-bold">{BROADCAST_KINDS[k].label}</span><span className={cn("block text-[11px] leading-snug", on ? "text-white/70" : "text-muted")}>{BROADCAST_KINDS[k].hint}</span></span>
                </button>
              );
            })}
          </div>
        </section>

        <section className="card p-6">
          <h2 className="text-[15px] font-bold text-navy">2 · Who should receive it?</h2>
          <input type="hidden" name="group" value={group} />
          <div className="mt-4 flex flex-wrap gap-2">
            {groups.map((g) => (
              <button type="button" key={g} onClick={() => setGroup(g)} className={cn("flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition", g === group ? "border-navy bg-navy text-white" : "border-line text-navy hover:border-navy")}>
                <Users className="h-4 w-4" /> {BROADCAST_GROUPS[g].label}
              </button>
            ))}
          </div>
          <p className="mt-3 text-sm text-muted">
            {count === null ? "Counting recipients…" : count === 0 ? <span className="font-semibold text-warn">No active contacts in this group yet. Add them under Contacts.</span> : <><span className="font-bold text-navy">{count.toLocaleString()}</span> active contact{count === 1 ? "" : "s"} will receive this. Only this group gets it.</>}
          </p>
          {marketingWarning && <p className="mt-2 rounded-2xl bg-amber-50 px-3 py-2 text-xs text-amber-900">Adverts to customers and partners only go to contacts who have given marketing consent (NDPA). Others are skipped automatically.</p>}
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-[15px] font-bold text-navy">3 · Write the message</h2>
          <label className="block"><span className="label">Subject line</span><input className="input" name="subject" value={subject} onChange={(e) => edit(setSubject)(e.target.value)} maxLength={150} required /></label>
          <label className="block"><span className="label">Headline (big text under the picture)</span><input className="input" name="headline" value={headline} onChange={(e) => edit(setHeadline)(e.target.value)} maxLength={120} /></label>
          <label className="block"><span className="label">Message</span><textarea className="input min-h-[180px] leading-relaxed" name="message" value={message} onChange={(e) => edit(setMessage)(e.target.value)} required />
            <span className="mt-1 block text-xs text-muted">Each recipient is greeted by first name automatically. Blank line = new paragraph · <code>**bold**</code> for emphasis.</span></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block"><span className="label">Button text (optional)</span><input className="input" name="buttonLabel" value={buttonLabel} onChange={(e) => setButtonLabel(e.target.value)} placeholder="e.g. Join the meeting" /></label>
            <label className="block"><span className="label">Button link</span><input className="input" name="buttonUrl" value={buttonUrl} onChange={(e) => setButtonUrl(e.target.value)} placeholder="https://" /></label>
          </div>
          <label className="block"><span className="label">Sign-off</span><textarea className="input min-h-[80px]" name="signOff" value={signOff} onChange={(e) => setSignOff(e.target.value)} /></label>
        </section>

        <section className="card space-y-4 p-6">
          <h2 className="text-[15px] font-bold text-navy">4 · Send</h2>
          <input type="hidden" name="when" value={when} />
          <div className="flex flex-wrap gap-2">
            {(["now", "later"] as const).map((w) => (
              <button type="button" key={w} onClick={() => setWhen(w)} className={cn("rounded-full border px-4 py-2 text-sm font-semibold transition", w === when ? "border-navy bg-navy text-white" : "border-line text-navy hover:border-navy")}>{w === "now" ? "Send now" : "Schedule for later"}</button>
            ))}
          </div>
          {when === "later" && <label className="block max-w-xs"><span className="label">Date & time (Lagos)</span><input className="input" type="datetime-local" name="scheduledAt" required /></label>}
          <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
            <Submit className="btn-primary" disabled={!count}><Send className="h-4 w-4" /> {when === "now" ? "Send broadcast" : "Schedule broadcast"}</Submit>
            <span className="text-xs text-muted">Sent from AOJ Global · every send is logged with your name.</span>
          </div>
          <FormMessage state={sendState} />
          <div className="rounded-2xl bg-canvas p-4">
            <div className="text-sm font-semibold text-navy">Send a test first</div>
            <div className="mt-2 flex flex-wrap gap-2">
              <input className="input max-w-xs" name="testTo" type="email" defaultValue={userEmail} placeholder="you@example.com" />
              <button formAction={testAction} className="btn-secondary"><CheckCircle2 className="h-4 w-4" /> Send test</button>
            </div>
            <FormMessage state={testState} />
          </div>
        </section>
      </div>

      <div className="xl:sticky xl:top-24 xl:self-start">
        <div className="card overflow-hidden p-2">
          <div className="flex items-center justify-between px-3 py-2 text-xs text-muted"><span className="font-semibold text-navy">Live preview</span><span>as {userName.split(" ")[0]}</span></div>
          <iframe title="Email preview" srcDoc={html} className="h-[760px] w-full rounded-2xl bg-canvas" />
        </div>
      </div>
    </form>
  );
}
