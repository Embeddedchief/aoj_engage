import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can, canWorkWithAudience } from "@/lib/permissions";
import { toCsv } from "@/lib/utils";

export async function GET(_: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user || !can(user.role, "campaigns:read")) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  const { id } = await params;
  const c = await prisma.campaign.findUnique({ where: { id }, select: { name: true, audience: true } });
  if (!c || !canWorkWithAudience(user.role, c.audience)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  const rs = await prisma.campaignRecipient.findMany({ where: { campaignId: id }, orderBy: { email: "asc" }, include: { contact: { select: { firstName: true, lastName: true, category: true } } } });
  const csv = toCsv(rs.map((r) => ({ name: `${r.contact.firstName} ${r.contact.lastName}`, email: r.email, category: r.contact.category, status: r.status, detail: r.reason?.startsWith("years:") ? "" : r.reason ?? "", attempts: r.attempts, sent_at: r.sentAt?.toISOString() ?? "", provider_message_id: r.providerMessageId ?? "" })));
  const slug = c.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase().slice(0, 60);
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="campaign-${slug}.csv"` } });
}
