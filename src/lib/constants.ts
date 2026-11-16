import type { Audience, CampaignStatus, ContactCategory, Role } from "@prisma/client";

export const INTERNAL_CATEGORIES: ContactCategory[] = ["STAFF", "MANAGEMENT", "CONTRACTOR"];
export const EXTERNAL_CATEGORIES: ContactCategory[] = ["CUSTOMER", "FORMER_CUSTOMER", "PARTNER", "PROSPECT", "SUPPLIER", "CONSULTANT", "STAKEHOLDER"];
export const ALL_CATEGORIES: ContactCategory[] = [...INTERNAL_CATEGORIES, ...EXTERNAL_CATEGORIES];

export const CATEGORY_LABEL: Record<ContactCategory, string> = {
  STAFF: "Staff",
  MANAGEMENT: "Management",
  CONTRACTOR: "Contractor",
  CUSTOMER: "Customer",
  FORMER_CUSTOMER: "Former customer",
  PARTNER: "Business partner",
  PROSPECT: "Prospect",
  SUPPLIER: "Supplier",
  CONSULTANT: "Consultant",
  STAKEHOLDER: "Stakeholder",
};

/** Directory groups used by the sidebar. */
export const CONTACT_GROUPS: Record<string, { label: string; categories: ContactCategory[] }> = {
  all: { label: "All Contacts", categories: ALL_CATEGORIES },
  staff: { label: "Staff", categories: INTERNAL_CATEGORIES },
  customers: { label: "Customers", categories: ["CUSTOMER", "FORMER_CUSTOMER"] },
  partners: { label: "Partners & Suppliers", categories: ["PARTNER", "SUPPLIER", "CONSULTANT", "STAKEHOLDER"] },
  prospects: { label: "Prospects", categories: ["PROSPECT"] },
};

export const isInternal = (c: ContactCategory) => INTERNAL_CATEGORIES.includes(c);
export const audienceOf = (c: ContactCategory): Audience => (isInternal(c) ? "INTERNAL" : "EXTERNAL");

export const ROLE_LABEL: Record<Role, string> = {
  SUPER_ADMIN: "ICT Administrator",
  COMMS_OFFICER: "Communications Officer",
  HR: "HR Personnel",
  APPROVER: "Management / Approver",
  AUDITOR: "Read-only Auditor",
};

export const AUDIENCE_LABEL: Record<Audience, string> = { INTERNAL: "Internal (Staff)", EXTERNAL: "External", BOTH: "Staff + External" };

export const STATUS_TONE: Record<CampaignStatus, "neutral" | "info" | "ok" | "warn" | "bad" | "brand"> = {
  DRAFT: "neutral",
  AWAITING_APPROVAL: "warn",
  CHANGES_REQUESTED: "warn",
  APPROVED: "info",
  SCHEDULED: "info",
  PROCESSING: "brand",
  SENT: "ok",
  PARTIALLY_DELIVERED: "warn",
  FAILED: "bad",
  PAUSED: "neutral",
  CANCELLED: "neutral",
};

export const DEPARTMENTS = ["Engineering", "Projects", "ICT", "Human Resources", "Business Development", "Customer Relations", "Finance", "Procurement", "Administration", "Management", "HSE"];

export const DEFAULT_SENDERS = [
  { id: "communications", name: "AOJ Global Communications", email: "communications@aojglobal.com" },
  { id: "hr", name: "AOJ Global Human Resources", email: "hr@aojglobal.com" },
  { id: "customers", name: "AOJ Global Customer Relations", email: "customers@aojglobal.com" },
  { id: "notifications", name: "AOJ Global", email: "notifications@aojglobal.com" },
];
