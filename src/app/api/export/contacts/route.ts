import { NextResponse, type NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { audit } from "@/lib/audit";
import { CONTACT_GROUPS } from "@/lib/constants";
import { visibleCategories } from "@/lib/queries";
import { toCsv } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "Unauthorised" }, { status: 401 });
  if (user.role === "APPROVER") return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const group = req.nextUrl.searchParams.get("group") ?? "all";
  const allowed = visibleCategories(user.role);
  const cats = (CONTACT_GROUPS[group] ?? CONTACT_GROUPS.all).categories.filter((c) => allowed.includes(c));
  const status = req.nextUrl.searchParams.get("status");
  const contacts = await prisma.contact.findMany({
    where: { category: { in: cats }, ...(status === "all" ? {} : status === "inactive" ? { status: "INACTIVE" } : { status: "ACTIVE" }) },
    orderBy: [{ lastName: "asc" }],
    include: { customerProfile: true, staffProfile: true },
  });
  const rows = contacts.map((c) => ({
    first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone ?? "", category: c.category, organisation: c.organisation ?? "",
    department: c.department ?? "", job_title: c.jobTitle ?? "", city: c.city ?? "",
    // Birthdays only for roles that may see them.
    birthday: user.role === "SUPER_ADMIN" || user.role === "HR" || !["STAFF", "MANAGEMENT", "CONTRACTOR"].includes(c.category) ? (c.birthMonth ? `${c.birthDay}/${c.birthMonth}` : "") : "",
    status: c.status, marketing_consent: c.marketingConsent, relationship_status: c.customerProfile?.relationshipStatus ?? "", date_joined: c.staffProfile?.dateJoined?.toISOString().slice(0, 10) ?? "",
  }));
  await audit(user.id, "contact.exported", "Contact", undefined, `${rows.length} rows (${group})`);
  return new NextResponse(toCsv(rows), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="aoj-contacts-${group}-${new Date().toISOString().slice(0, 10)}.csv"` } });
}
