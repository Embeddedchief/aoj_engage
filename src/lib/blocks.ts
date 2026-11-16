// Email block model shared by the editor, renderer and seed catalogue.
export type EmailBlock =
  | { id: string; type: "logo" }
  | { id: string; type: "banner"; imageUrl?: string; title?: string; subtitle?: string; tone?: "brand" | "navy" | "festive" | "soft" }
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
    case "banner": return { id, type, title: "{{event_name}}", subtitle: "", tone: "brand" };
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
