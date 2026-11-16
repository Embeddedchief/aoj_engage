import type { Role } from "@prisma/client";
import { prisma } from "./db";
import { getSettings } from "./settings";
import { visibleAudiences, visibleCategories } from "./queries";
import { canWorkWithAudience } from "./permissions";

/** Options needed by the campaign wizard, filtered to what the role may use. */
export async function campaignFormData(role: Role) {
  const auds = visibleAudiences(role).filter((a) => canWorkWithAudience(role, a));
  const [templates, segments, contacts, settings] = await Promise.all([
    prisma.template.findMany({ where: { active: true, audience: { in: auds } }, orderBy: { name: "asc" }, select: { id: true, name: true, audience: true, currentVersion: true } }),
    prisma.segment.findMany({ where: { audience: { in: auds } }, orderBy: { name: "asc" }, select: { id: true, name: true, audience: true } }),
    prisma.contact.findMany({ where: { status: "ACTIVE", category: { in: visibleCategories(role) } }, orderBy: { firstName: "asc" }, take: 2000, select: { id: true, firstName: true, lastName: true, email: true, category: true } }),
    getSettings(),
  ]);
  return {
    audiences: auds,
    templates: templates.map((t) => ({ id: t.id, name: t.name, audience: t.audience, version: t.currentVersion })),
    segments,
    contacts: contacts.map((c) => ({ id: c.id, name: `${c.firstName} ${c.lastName}`, email: c.email, category: c.category })),
    senders: settings.senders,
  };
}
