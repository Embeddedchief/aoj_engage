import { NextResponse, type NextRequest } from "next/server";
import { createVerify } from "node:crypto";
import { prisma } from "@/lib/db";
import { audit, notify } from "@/lib/audit";
import { finalizeCampaign } from "@/lib/engine";

export const dynamic = "force-dynamic";

/**
 * Amazon SES → SNS → HTTPS endpoint for delivery, bounce, complaint and reject events.
 * Every message is cryptographically verified against the SNS signing certificate and
 * the topic must be listed in SES_SNS_TOPIC_ARNS.
 */
type SnsMessage = {
  Type: "Notification" | "SubscriptionConfirmation" | "UnsubscribeConfirmation";
  MessageId: string; TopicArn: string; Message: string; Timestamp: string; Signature: string; SignatureVersion: string; SigningCertURL: string;
  Subject?: string; SubscribeURL?: string; Token?: string;
};

const certCache = new Map<string, string>();
const SNS_HOST = /^sns\.[a-z0-9-]+\.amazonaws\.com(\.cn)?$/;

async function verifySns(m: SnsMessage) {
  const certUrl = new URL(m.SigningCertURL);
  if (certUrl.protocol !== "https:" || !SNS_HOST.test(certUrl.hostname) || !certUrl.pathname.endsWith(".pem")) return false;
  let cert = certCache.get(m.SigningCertURL);
  if (!cert) {
    const r = await fetch(m.SigningCertURL);
    if (!r.ok) return false;
    cert = await r.text();
    certCache.set(m.SigningCertURL, cert);
  }
  const keys = m.Type === "Notification"
    ? ["Message", "MessageId", ...(m.Subject ? ["Subject"] : []), "Timestamp", "TopicArn", "Type"]
    : ["Message", "MessageId", "SubscribeURL", "Timestamp", "Token", "TopicArn", "Type"];
  const str = keys.map((k) => `${k}\n${m[k as keyof SnsMessage]}\n`).join("");
  const v = createVerify(m.SignatureVersion === "2" ? "RSA-SHA256" : "RSA-SHA1");
  v.update(str, "utf8");
  return v.verify(cert, m.Signature, "base64");
}

export async function POST(req: NextRequest) {
  let m: SnsMessage;
  try {
    m = JSON.parse(await req.text());
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }
  const allowed = (process.env.SES_SNS_TOPIC_ARNS ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!allowed.includes(m.TopicArn)) return NextResponse.json({ error: "Topic not allowed" }, { status: 403 });
  if (!(await verifySns(m).catch(() => false))) return NextResponse.json({ error: "Invalid signature" }, { status: 403 });
  if (Date.now() - new Date(m.Timestamp).getTime() > 60 * 60 * 1000) return NextResponse.json({ error: "Stale message" }, { status: 400 });

  if (m.Type === "SubscriptionConfirmation" && m.SubscribeURL) {
    const u = new URL(m.SubscribeURL);
    if (u.protocol === "https:" && SNS_HOST.test(u.hostname)) await fetch(m.SubscribeURL);
    await audit(null, "webhook.subscribed", "SES", undefined, m.TopicArn);
    return NextResponse.json({ ok: true });
  }
  if (m.Type !== "Notification") return NextResponse.json({ ok: true });

  const ev = JSON.parse(m.Message);
  const type: string = ev.eventType ?? ev.notificationType; // event publishing vs. notifications
  const messageId: string | undefined = ev.mail?.messageId;
  if (!messageId) return NextResponse.json({ ok: true });
  const r = await prisma.campaignRecipient.findUnique({ where: { providerMessageId: messageId } });
  if (!r) return NextResponse.json({ ok: true, note: "unknown message" });

  const now = new Date();
  if (type === "Delivery") {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: r.status === "ACCEPTED" ? "DELIVERED" : r.status, lastEventAt: now, events: { create: { type: "DELIVERY", detail: ev.delivery?.smtpResponse?.slice(0, 300) } } } });
  } else if (type === "Bounce") {
    const permanent = ev.bounce?.bounceType === "Permanent";
    const detail = `${ev.bounce?.bounceType}/${ev.bounce?.bounceSubType}: ${ev.bounce?.bouncedRecipients?.[0]?.diagnosticCode ?? ""}`.slice(0, 300);
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: permanent ? "BOUNCED" : r.status, reason: permanent ? detail : r.reason, lastEventAt: now, events: { create: { type: permanent ? "BOUNCE" : "SOFT_BOUNCE", detail } } } });
    if (permanent) {
      await prisma.suppression.upsert({ where: { email: r.email }, create: { email: r.email, reason: "HARD_BOUNCE", detail }, update: {} });
      await audit(null, "email.bounced", "Contact", r.contactId, `${r.email}: ${detail}`);
    }
  } else if (type === "Complaint") {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "COMPLAINED", lastEventAt: now, events: { create: { type: "COMPLAINT", detail: ev.complaint?.complaintFeedbackType ?? "abuse" } } } });
    await prisma.suppression.upsert({ where: { email: r.email }, create: { email: r.email, reason: "COMPLAINT", detail: "Recipient marked the email as spam" }, update: {} });
    await prisma.contact.update({ where: { id: r.contactId }, data: { marketingConsent: "WITHDRAWN", consents: { create: { status: "WITHDRAWN", source: "Spam complaint" } } } });
    await notify({ key: `complaint:${r.id}`, level: "error", title: "Spam complaint received", body: `${r.email} complained. The address has been suppressed.`, link: `/contacts/${r.contactId}` });
  } else if (type === "Reject") {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "REJECTED", reason: ev.reject?.reason, lastEventAt: now, events: { create: { type: "REJECT", detail: ev.reject?.reason } } } });
  } else {
    await prisma.deliveryEvent.create({ data: { recipientId: r.id, type: String(type).toUpperCase().slice(0, 30) } });
  }
  await finalizeCampaign(r.campaignId).catch(() => {});
  return NextResponse.json({ ok: true });
}
