// Email block model shared by the editor, renderer and seed catalogue.
export type EmailBlock =
  | { id: string; type: "logo" }
  | { id: string; type: "banner"; art?: string; imageUrl?: string; title?: string; subtitle?: string; tone?: "brand" | "navy" | "festive" | "soft" }
  | { id: string; type: "heading"; text: string }
  | { id: string; type: "paragraph"; text: string }
  | { id: string; type: "image"; url: string; alt?: string }
  | { id: string; type: "button"; label: string; url: string }
  | { id: string; type: "divider" }
  | { id: string; type: "signature"; text: string }
  | { id: string; type: "contact" }
  | { id: string; type: "social" }
  | { id: string; type: "footer"; text?: string };

export type BlockType = EmailBlock["type"];

/** Occasion artwork shipped in public/email/art/<key>.jpg (rendered by scripts/email-art.mjs). */
export const EMAIL_ART: { key: string; label: string }[] = [
  { key: "birthday", label: "Birthday – balloons & confetti" },
  { key: "christmas", label: "Christmas – trees & snow" },
  { key: "new-year", label: "New Year – fireworks" },
  { key: "eid", label: "Eid – crescent & lanterns" },
  { key: "easter", label: "Easter – sunrise" },
  { key: "nigeria", label: "Nigeria – green white green" },
  { key: "new-week", label: "New week – sunrise" },
  { key: "new-month", label: "New month – calendar" },
  { key: "anniversary", label: "Anniversary – laurel" },
  { key: "thanks", label: "Thank you – hearts" },
  { key: "recognition", label: "Recognition – trophy" },
  { key: "welcome", label: "Welcome – AOJ skyline" },
  { key: "services", label: "Our services – MEP" },
  { key: "project", label: "Project – construction" },
  { key: "engineering", label: "Engineering – blueprint" },
  { key: "women", label: "Women's Day – flowers" },
  { key: "announcement", label: "Announcement – megaphone" },
  { key: "urgent", label: "Urgent – alert" },
  { key: "meeting", label: "Meeting – calendar & clock" },
];

export const BLOCK_LABELS: Record<BlockType, string> = {
  logo: "Logo",
  banner: "Banner",
  heading: "Heading",
  paragraph: "Paragraph",
  image: "Image",
  button: "Button",
  divider: "Divider",
  signature: "Signature",
  contact: "Contact information",
  social: "Social links",
  footer: "Footer",
};

let n = 0;
export const bid = () => `b${Date.now().toString(36)}${(n++).toString(36)}${Math.random().toString(36).slice(2, 6)}`;

export function newBlock(type: BlockType): EmailBlock {
  const id = bid();
  switch (type) {
    case "logo": return { id, type };
    case "banner": return { id, type, art: "announcement", title: "{{event_name}}", subtitle: "", tone: "brand" };
    case "heading": return { id, type, text: "Heading" };
    case "paragraph": return { id, type, text: "Write your message here." };
    case "image": return { id, type, url: "", alt: "" };
    case "button": return { id, type, label: "Visit our website", url: "{{company_website}}" };
    case "divider": return { id, type };
    case "signature": return { id, type, text: "Warm regards,\n{{sender_name}}\n{{company_name}}" };
    case "contact": return { id, type };
    case "social": return { id, type };
    case "footer": return { id, type, text: "" };
  }
}
