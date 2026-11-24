// Quick broadcast: type a message, pick its kind and who receives it, send.
// Shared by the composer (live preview) and the server action, so the preview is exactly what is sent.
import type { Audience, CampaignType, ContactCategory } from "@prisma/client";
import type { EmailBlock } from "./blocks";

export const BROADCAST_KINDS = {
  announcement: { label: "Announcement", art: "announcement", eyebrow: "Company announcement", type: "ANNOUNCEMENT" as CampaignType, marketing: false, hint: "News, policy updates, general information" },
  urgent: { label: "Urgent notice", art: "urgent", eyebrow: "Urgent · please read", type: "ANNOUNCEMENT" as CampaignType, marketing: false, hint: "Time-critical: safety, closures, immediate action" },
  meeting: { label: "Meeting", art: "meeting", eyebrow: "Meeting notice", type: "ANNOUNCEMENT" as CampaignType, marketing: false, hint: "Meeting invitations, schedule changes" },
  celebration: { label: "Celebration", art: "thanks", eyebrow: "Celebrating together", type: "ONE_TIME" as CampaignType, marketing: false, hint: "Congratulations, milestones, team wins" },
  advert: { label: "Advert / promotion", art: "services", eyebrow: "From AOJ Global", type: "RELATIONSHIP" as CampaignType, marketing: true, hint: "Services, offers, reminders of what we do (customers need consent)" },
} as const;
export type BroadcastKind = keyof typeof BROADCAST_KINDS;

export const BROADCAST_GROUPS = {
  staff: { label: "Staff only", audience: "INTERNAL" as Audience, categories: ["STAFF", "MANAGEMENT", "CONTRACTOR"] as ContactCategory[] },
  customers: { label: "Customers only", audience: "EXTERNAL" as Audience, categories: ["CUSTOMER"] as ContactCategory[] },
  partners: { label: "Partners & suppliers", audience: "EXTERNAL" as Audience, categories: ["PARTNER", "SUPPLIER", "CONSULTANT", "STAKEHOLDER"] as ContactCategory[] },
  external: { label: "All customers & partners", audience: "EXTERNAL" as Audience, categories: ["CUSTOMER", "PARTNER", "SUPPLIER", "CONSULTANT", "STAKEHOLDER"] as ContactCategory[] },
  everyone: { label: "Everyone", audience: "BOTH" as Audience, categories: ["STAFF", "MANAGEMENT", "CONTRACTOR", "CUSTOMER", "PARTNER", "SUPPLIER", "CONSULTANT", "STAKEHOLDER"] as ContactCategory[] },
} as const;
export type BroadcastGroup = keyof typeof BROADCAST_GROUPS;

export type BroadcastInput = {
  kind: BroadcastKind;
  subject: string;
  headline: string;
  message: string;
  buttonLabel?: string;
  buttonUrl?: string;
  signOff: string;
  /** Optional flyer (uploaded /email/media/<id> path or https link). */
  flyerUrl?: string;
  /** "top" replaces the occasion artwork; "below" places the flyer under the message. */
  flyerPosition?: "top" | "below";
  /** Optional link opened when the flyer is clicked. */
  flyerLink?: string;
};

/** Literal user text must not be treated as {{placeholders}} except the greeting we add. */
const lit = (t: string) => t.replace(/\{\{|\}\}/g, "");

export function buildBroadcastBlocks(i: BroadcastInput): EmailBlock[] {
  const k = BROADCAST_KINDS[i.kind] ?? BROADCAST_KINDS.announcement;
  const flyer = i.flyerUrl ? lit(i.flyerUrl) : "";
  const top = flyer && i.flyerPosition !== "below";
  const title = lit(i.headline || i.subject);
  const blocks: EmailBlock[] = [{ id: "logo", type: "logo" }];
  blocks.push(top
    ? { id: "banner", type: "banner", art: k.art, imageUrl: flyer, link: lit(i.flyerLink ?? ""), title, subtitle: k.eyebrow }
    : { id: "banner", type: "banner", art: k.art, title, subtitle: k.eyebrow });
  blocks.push(
    { id: "greet", type: "heading", text: "Dear {{first_name}}," },
    { id: "body", type: "paragraph", text: lit(i.message) },
  );
  if (flyer && !top) blocks.push({ id: "flyer", type: "image", url: flyer, alt: title, link: lit(i.flyerLink ?? ""), full: true });
  if (i.buttonLabel && i.buttonUrl) blocks.push({ id: "cta", type: "button", label: lit(i.buttonLabel), url: lit(i.buttonUrl) });
  blocks.push({ id: "sign", type: "signature", text: lit(i.signOff || "Regards,\n**Management**\nAOJ Global Concept Limited") }, { id: "contact", type: "contact" });
  return blocks;
}
