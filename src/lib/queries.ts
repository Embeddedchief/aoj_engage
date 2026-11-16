import type { Prisma, Role } from "@prisma/client";
import { allowedAudiences } from "./permissions";
import { audienceCategories } from "./segments";
import { ALL_CATEGORIES } from "./constants";

export function notificationWhere(user: { id: string; role: Role }): Prisma.NotificationWhereInput {
  return { OR: [{ userId: user.id }, { userId: null, roles: { has: user.role } }] };
}

/** Contact categories a role may read or write. */
export function visibleCategories(role: Role, mode: "read" | "write" = "read") {
  const auds = allowedAudiences(role, mode).filter((a) => a !== "BOTH");
  const cats = auds.flatMap((a) => audienceCategories(a));
  return ALL_CATEGORIES.filter((c) => cats.includes(c));
}

/** Campaign/template audiences a role may see (HR: internal only). */
export function visibleAudiences(role: Role) {
  return allowedAudiences(role, "read");
}
