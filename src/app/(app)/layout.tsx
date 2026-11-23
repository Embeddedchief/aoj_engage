import { Suspense } from "react";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { can } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/constants";
import { Shell, type NavItem } from "@/components/shell";
import { logout } from "../(auth)/actions";
import { notificationWhere } from "@/lib/queries";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const r = user.role;
  // First sign-in with an issued password: must choose a new one before using the app.
  if (user.mustChangePassword && (await headers()).get("x-pathname") !== "/settings/account") redirect("/settings/account?first=1");
  const [unread, pending] = await Promise.all([
    prisma.notification.count({ where: { AND: [notificationWhere(user), { NOT: { readBy: { has: user.id } } }] } }),
    can(r, "campaigns:approve") ? prisma.campaign.count({ where: { status: "AWAITING_APPROVAL" } }) : Promise.resolve(0),
  ]);

  const nav: (NavItem | false)[] = [
    { href: "/", label: "Overview", icon: "dashboard" },
    (can(r, "contacts:read:internal") || can(r, "contacts:read:external")) && { href: "/contacts", label: "All Contacts", icon: "contacts", section: "Contacts" },
    can(r, "contacts:read:internal") && { href: "/staff", label: "Staff", icon: "staff", section: "Contacts" },
    can(r, "contacts:read:external") && { href: "/customers", label: "Customers", icon: "customers", section: "Contacts" },
    can(r, "contacts:read:external") && { href: "/contacts?group=partners", label: "Partners", icon: "partners", section: "Contacts" },
    can(r, "contacts:read:external") && { href: "/contacts?group=prospects", label: "Prospects", icon: "prospects", section: "Contacts" },
    { href: "/segments", label: "Segments", icon: "segments", section: "Contacts" },
    (can(r, "contacts:write:internal") || can(r, "contacts:write:external")) && { href: "/contacts/import", label: "Import", icon: "import", section: "Contacts" },
    can(r, "campaigns:write") && { href: "/broadcast", label: "Broadcast", icon: "broadcast", section: "Communicate" },
    { href: "/calendar", label: "Calendar", icon: "calendar", section: "Communicate" },
    { href: "/templates", label: "Templates", icon: "templates", section: "Communicate" },
    { href: "/campaigns", label: "Campaigns", icon: "campaigns", section: "Communicate" },
    { href: "/automations", label: "Automations", icon: "automations", section: "Communicate" },
    { href: "/approvals", label: "Approvals", icon: "approvals", section: "Communicate", badge: pending },
    can(r, "analytics:read") && { href: "/analytics", label: "Analytics", icon: "analytics", section: "Insight" },
    { href: "/media", label: "Media Library", icon: "media", section: "Insight" },
    can(r, "settings:write") && { href: "/settings", label: "Settings", icon: "settings", section: "Administration" },
    can(r, "users:write") && { href: "/settings/users", label: "Users & Roles", icon: "users", section: "Administration" },
    can(r, "audit:read") && { href: "/settings/audit", label: "Audit Logs", icon: "audit", section: "Administration" },
  ];

  const initials = user.name.split(/\s+/).map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <Suspense>
      <Shell nav={nav.filter(Boolean) as NavItem[]} user={{ name: user.name, email: user.email, role: ROLE_LABEL[user.role], initials }} canBroadcast={can(r, "campaigns:write")} unread={unread} logoutAction={logout}>
        {children}
      </Shell>
    </Suspense>
  );
}
