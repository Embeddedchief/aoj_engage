import { prisma } from "./db";
import { audit } from "./audit";
import { verifyToken } from "./session";

/** Withdraws marketing consent (NDPA right to object). Operational/project emails are unaffected. */
export async function unsubscribeByToken(token: string, source: string) {
  const contactId = await verifyToken("unsubscribe", token);
  if (!contactId) return null;
  const c = await prisma.contact.findUnique({ where: { id: contactId } });
  if (!c) return null;
  if (c.marketingConsent !== "WITHDRAWN") {
    await prisma.$transaction([
      prisma.contact.update({ where: { id: c.id }, data: { marketingConsent: "WITHDRAWN" } }),
      prisma.consentRecord.create({ data: { contactId: c.id, status: "WITHDRAWN", source } }),
    ]);
    await audit(null, "consent.withdrawn", "Contact", c.id, `${c.email} via ${source}`);
  }
  return c;
}
