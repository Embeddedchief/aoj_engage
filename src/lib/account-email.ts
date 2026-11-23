import "server-only";
import { randomInt } from "node:crypto";
import { getSettings, senderFor } from "./settings";
import { renderEmail } from "./email/render";
import { sendEmail, providerMode } from "./email/provider";
import type { EmailBlock } from "./blocks";

const appUrl = () => (process.env.APP_URL ?? "").replace(/\/$/, "");

/** Readable temporary password that meets the policy (12+ chars, letters and numbers). */
export function generateTempPassword() {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ", a = "abcdefghijkmnpqrstuvwxyz", d = "23456789";
  const pick = (s: string, n: number) => Array.from({ length: n }, () => s[randomInt(s.length)]).join("");
  return `Aoj-${pick(A, 1)}${pick(a, 3)}-${pick(d, 4)}-${pick(a, 2)}${pick(d, 2)}`;
}

async function sendAccountEmail(to: string, subject: string, blocks: EmailBlock[]) {
  const s = await getSettings();
  const sender = senderFor(s, "notifications");
  const msg = renderEmail({ subject, blocks, vars: {}, flags: {}, brand: s.brand });
  const res = await sendEmail({ to, from: `${sender.name} <${sender.email}>`, subject: msg.subject, html: msg.html, text: msg.text });
  return { ...res, mode: providerMode() };
}

const esc = (t: string) => t.replace(/[{}]/g, "");

/** Welcome / reset email with the temporary password. The user must change it at first sign-in. */
export function sendLoginDetails(o: { to: string; name: string; tempPassword: string; invitedBy: string; reset?: boolean }) {
  const first = esc(o.name.split(/\s+/)[0] || "there");
  const blocks: EmailBlock[] = [
    { id: "l", type: "logo" },
    { id: "b", type: "banner", art: o.reset ? "meeting" : "welcome", title: o.reset ? "Your password has been reset" : "Welcome to AOJ Engage", subtitle: o.reset ? "Account security" : "Your account is ready" },
    { id: "h", type: "heading", text: `Dear ${first},` },
    {
      id: "p", type: "paragraph",
      text: [
        o.reset
          ? `${esc(o.invitedBy)} has reset the password for your AOJ Engage account.`
          : `${esc(o.invitedBy)} has created an AOJ Engage account for you. AOJ Engage is the messaging and broadcast centre of AOJ Global Concept Limited.`,
        `**Email:** ${esc(o.to)}\n**Temporary password:** ${esc(o.tempPassword)}`,
        "When you sign in with this temporary password, you will be asked to choose your own password straight away. The temporary password stops working once you do.",
        "If you were not expecting this email, please contact the ICT team.",
      ].join("\n\n"),
    },
    { id: "c", type: "button", label: "Sign in to AOJ Engage", url: `${appUrl()}/login` },
    { id: "s", type: "signature", text: "Regards,\n**ICT Team**\nAOJ Global Concept Limited" },
    { id: "k", type: "contact" },
  ];
  return sendAccountEmail(o.to, o.reset ? "Your AOJ Engage password has been reset" : "Your AOJ Engage account is ready", blocks);
}

/** Confirmation after the user sets their own password. */
export function sendPasswordChanged(o: { to: string; name: string }) {
  const first = esc(o.name.split(/\s+/)[0] || "there");
  const when = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short", timeZone: "Africa/Lagos" }).format(new Date());
  const blocks: EmailBlock[] = [
    { id: "l", type: "logo" },
    { id: "b", type: "banner", art: "thanks", title: "Password updated", subtitle: "Account security" },
    { id: "h", type: "heading", text: `Dear ${first},` },
    { id: "p", type: "paragraph", text: `The password for your AOJ Engage account (${esc(o.to)}) was changed on ${when} (Lagos time). You can now sign in with your new password.\n\nIf you did not make this change, contact the ICT team immediately so they can secure your account.` },
    { id: "c", type: "button", label: "Sign in to AOJ Engage", url: `${appUrl()}/login` },
    { id: "s", type: "signature", text: "Regards,\n**ICT Team**\nAOJ Global Concept Limited" },
    { id: "k", type: "contact" },
  ];
  return sendAccountEmail(o.to, "Your AOJ Engage password was changed", blocks);
}
