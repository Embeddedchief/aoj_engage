import type { Audience, ContactCategory, Prisma } from "@prisma/client";
import { prisma } from "./db";
import { EXTERNAL_CATEGORIES, INTERNAL_CATEGORIES } from "./constants";
import { lagosParts } from "./time";
import { isValidEmail } from "./utils";

export type SegmentRules = {
  categories?: ContactCategory[];
  departments?: string[];
  cities?: string[];
  relationshipStatus?: string[]; // customer profile status: Active, Completed, Former, Prospect
  projectStages?: string[]; // has a project at one of these stages
  birthdayThisMonth?: boolean;
  marketingConsentOnly?: boolean;
};

export function audienceCategories(a: Audience): ContactCategory[] {
  return a === "INTERNAL" ? INTERNAL_CATEGORIES : a === "EXTERNAL" ? EXTERNAL_CATEGORIES : [...INTERNAL_CATEGORIES, ...EXTERNAL_CATEGORIES];
}

/** Builds a Prisma filter for an audience, optional category subset and optional segment rules. */
export function contactWhere(opts: { audience: Audience; categories?: ContactCategory[]; rules?: SegmentRules | null; includeInactive?: boolean; now?: Date }): Prisma.ContactWhereInput {
  const allowed = audienceCategories(opts.audience);
  let cats = opts.categories?.length ? opts.categories.filter((c) => allowed.includes(c)) : allowed;
  const r = opts.rules ?? {};
  if (r.categories?.length) cats = cats.filter((c) => r.categories!.includes(c));
  const and: Prisma.ContactWhereInput[] = [{ category: { in: cats } }];
  if (!opts.includeInactive) and.push({ status: "ACTIVE" });
  if (r.departments?.length) and.push({ department: { in: r.departments } });
  if (r.cities?.length) and.push({ city: { in: r.cities, mode: "insensitive" } });
  if (r.relationshipStatus?.length) and.push({ customerProfile: { relationshipStatus: { in: r.relationshipStatus } } });
  if (r.projectStages?.length) and.push({ projects: { some: { stage: { in: r.projectStages } } } });
  if (r.birthdayThisMonth) and.push({ birthMonth: lagosParts(opts.now).month, birthdayCommsAllowed: true });
  if (r.marketingConsentOnly) and.push({ marketingConsent: "GRANTED" });
  return { AND: and };
}

export async function segmentWhere(segmentId: string | null | undefined, audience: Audience, categories?: ContactCategory[]) {
  const seg = segmentId ? await prisma.segment.findUnique({ where: { id: segmentId } }) : null;
  return contactWhere({ audience, categories, rules: (seg?.rules as SegmentRules) ?? null });
}

export function describeRules(r: SegmentRules) {
  const parts: string[] = [];
  if (r.categories?.length) parts.push(`Category: ${r.categories.map((c) => c.toLowerCase().replace("_", " ")).join(", ")}`);
  if (r.departments?.length) parts.push(`Department: ${r.departments.join(", ")}`);
  if (r.cities?.length) parts.push(`City: ${r.cities.join(", ")}`);
  if (r.relationshipStatus?.length) parts.push(`Relationship: ${r.relationshipStatus.join(", ")}`);
  if (r.projectStages?.length) parts.push(`Project stage: ${r.projectStages.join(", ")}`);
  if (r.birthdayThisMonth) parts.push("Birthday this month");
  if (r.marketingConsentOnly) parts.push("Marketing consent granted");
  return parts.length ? parts.join(" · ") : "All active contacts in audience";
}

/** Pre-send recipient analysis shown before approval (spec 13.4). */
export async function analyseRecipients(where: Prisma.ContactWhereInput, opts: { isMarketing: boolean; batchSize: number }) {
  const all = await prisma.contact.findMany({ where: { AND: [where] }, select: { id: true, email: true, status: true, marketingConsent: true } });
  const supp = new Set((await prisma.suppression.findMany({ where: { email: { in: all.map((c) => c.email) } }, select: { email: true } })).map((s) => s.email));
  const seen = new Set<string>();
  let duplicates = 0, invalid = 0, suppressed = 0, noConsent = 0;
  const eligible: string[] = [];
  for (const c of all) {
    if (seen.has(c.email)) { duplicates++; continue; }
    seen.add(c.email);
    if (!isValidEmail(c.email)) { invalid++; continue; }
    if (supp.has(c.email)) { suppressed++; continue; }
    if (opts.isMarketing && c.marketingConsent !== "GRANTED") { noConsent++; continue; }
    eligible.push(c.id);
  }
  return {
    total: all.length,
    active: all.filter((c) => c.status === "ACTIVE").length,
    eligible: eligible.length,
    eligibleIds: eligible,
    suppressed,
    invalid,
    duplicates,
    noConsent,
    batches: Math.max(1, Math.ceil(eligible.length / Math.max(1, opts.batchSize))),
  };
}
