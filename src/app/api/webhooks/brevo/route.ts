import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { prisma } from "@/lib/db";
import { notify } from "@/lib/audit";

export const dynamic = "force-dynamic";

/** Brevo transactional webhook: https://<APP_URL>/api/webhooks/brevo?token=<BREVO_WEBHOOK_SECRET>
 *  Events: delivered, hard_bounce, soft_bounce, invalid_email, blocked, spam, unsubscribed. */
type BrevoEvent = { event?: string; email?: string; "message-id"?: string; reason?: string };

function authorised(req: NextRequest) {
  const secret = process.env.BREVO_WEBHOOK_SECRET;
  const token = req.nextUrl.searchParams.get("token") ?? "";
  if (!secret) return false;
  const a = Buffer.from(token), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(req: NextRequest) {
  if (!authorised(req)) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const body = (await req.json().catch(() => null)) as BrevoEvent | BrevoEvent[] | null;
  const events = Array.isArray(body) ? body : body ? [body] : [];
  for (const ev of events) await handle(ev);
  return NextResponse.json({ ok: true });
}

async function handle(ev: BrevoEvent) {
  const messageId = ev["message-id"];
  const type = (ev.event ?? "").toLowerCase();
  if (!messageId || !type) return;
  const r = await prisma.campaignRecipient.findUnique({ where: { providerMessageId: messageId } });
  if (!r) return;
  const now = new Date();
  const detail = ev.reason?.slice(0, 300);

  if (type === "delivered") {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: r.status === "ACCEPTED" ? "DELIVERED" : r.status, lastEventAt: now, events: { create: { type: "DELIVERY" } } } });
  } else if (type === "hard_bounce" || type === "invalid_email") {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "BOUNCED", reason: detail ?? type, lastEventAt: now, events: { create: { type: "BOUNCE", detail } } } });
    await prisma.suppression.upsert({ where: { email: r.email }, create: { email: r.email, reason: "HARD_BOUNCE", detail: detail ?? type }, update: {} });
  } else if (type === "soft_bounce") {
    await prisma.deliveryEvent.create({ data: { recipientId: r.id, type: "SOFT_BOUNCE", detail } });
  } else if (type === "blocked") {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "REJECTED", reason: detail ?? "Blocked by provider", lastEventAt: now, events: { create: { type: "REJECT", detail } } } });
  } else if (type === "spam") {
    await prisma.campaignRecipient.update({ where: { id: r.id }, data: { status: "COMPLAINED", lastEventAt: now, events: { create: { type: "COMPLAINT", detail: "Marked as spam" } } } });
    await prisma.suppression.upsert({ where: { email: r.email }, create: { email: r.email, reason: "COMPLAINT", detail: "Recipient marked the email as spam" }, update: {} });
    await prisma.contact.update({ where: { id: r.contactId }, data: { marketingConsent: "WITHDRAWN", consents: { create: { status: "WITHDRAWN", source: "Spam complaint" } } } });
    await notify({ key: `complaint:${r.id}`, level: "error", title: "Spam complaint received", body: `${r.email} complained. The address has been suppressed.`, link: `/contacts/${r.contactId}` });
  } else if (type === "unsubscribed") {
    await prisma.contact.update({ where: { id: r.contactId }, data: { marketingConsent: "WITHDRAWN", consents: { create: { status: "WITHDRAWN", source: "Unsubscribed via Brevo" } } } });
    await prisma.deliveryEvent.create({ data: { recipientId: r.id, type: "UNSUBSCRIBE" } });
  }
}
