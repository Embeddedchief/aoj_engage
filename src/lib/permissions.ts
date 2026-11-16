import type { Audience, ContactCategory, Role } from "@prisma/client";
import { isInternal } from "./constants";

export type Permission =
  | "contacts:read:internal" | "contacts:write:internal"
  | "contacts:read:external" | "contacts:write:external"
  | "templates:read" | "templates:write"
  | "campaigns:read" | "campaigns:write" | "campaigns:approve"
  | "calendar:write" | "automations:read" | "automations:write"
  | "analytics:read" | "media:write"
  | "settings:write" | "users:write" | "audit:read" | "engine:run";

const ROLE_PERMS: Record<Role, Permission[] | "*"> = {
  SUPER_ADMIN: "*",
  COMMS_OFFICER: [
    "contacts:read:internal", "contacts:read:external", "contacts:write:external",
    "templates:read", "templates:write", "campaigns:read", "campaigns:write",
    "calendar:write", "automations:read", "analytics:read", "media:write",
  ],
  HR: [
    "contacts:read:internal", "contacts:write:internal",
    "templates:read", "templates:write", "campaigns:read", "campaigns:write",
    "automations:read", "media:write",
  ],
  APPROVER: ["contacts:read:internal", "contacts:read:external", "templates:read", "campaigns:read", "campaigns:approve", "automations:read", "analytics:read"],
  AUDITOR: ["contacts:read:internal", "contacts:read:external", "templates:read", "campaigns:read", "automations:read", "analytics:read", "audit:read"],
};

export function can(role: Role, p: Permission) {
  const perms = ROLE_PERMS[role];
  return perms === "*" || perms.includes(p);
}

/** Which audiences a role may work with (HR is internal-only). */
export function allowedAudiences(role: Role, mode: "read" | "write"): Audience[] {
  const a: Audience[] = [];
  if (can(role, `contacts:${mode}:internal`)) a.push("INTERNAL");
  if (can(role, `contacts:${mode}:external`)) a.push("EXTERNAL");
  if (a.length === 2) a.push("BOTH");
  return a;
}

export function canAccessCategory(role: Role, c: ContactCategory, mode: "read" | "write") {
  return can(role, `contacts:${mode}:${isInternal(c) ? "internal" : "external"}`);
}

export function canWorkWithAudience(role: Role, audience: Audience) {
  if (audience === "BOTH") return can(role, "contacts:read:internal") && can(role, "contacts:read:external") && role !== "HR";
  return allowedAudiences(role, "read").includes(audience);
}
