import type { EmailBlock } from "../blocks";
import { escapeHtml, isSafeUrl } from "../utils";
import { MONTHS } from "../time";

export type Brand = {
  companyName: string;
  shortName: string;
  website: string;
  email: string;
  phone: string;
  address: string;
  logoUrl?: string;
  socials: { label: string; url: string }[];
};

export type RenderVars = Record<string, string | number | null | undefined>;
export type RenderFlags = Record<string, boolean>;

/** Every placeholder the engine understands, with a description for the editor. */
export const PLACEHOLDERS: { key: string; description: string }[] = [
  { key: "first_name", description: "Recipient first (or preferred) name" },
  { key: "last_name", description: "Recipient last name" },
  { key: "full_name", description: "Recipient full name" },
  { key: "recipient_company", description: "Recipient's organisation" },
  { key: "department", description: "Staff department" },
  { key: "job_title", description: "Recipient job title" },
  { key: "project_name", description: "Associated project" },
  { key: "years_of_service", description: "Completed years (anniversaries)" },
  { key: "event_name", description: "Occasion name" },
  { key: "event_date", description: "Occasion date" },
  { key: "current_month", description: "Month of sending" },
  { key: "current_year", description: "Year of sending" },
  { key: "company_name", description: "AOJ Global Concept Limited" },
  { key: "company_website", description: "Company website" },
  { key: "sender_name", description: "Signing team or person" },
  { key: "sender_position", description: "Signer position" },
];

export const CONDITION_FLAGS = ["staff", "customer", "partner", "prospect", "internal", "external", "milestone"];

const VAR_RE = /\{\{\s*([a-z_]+)\s*\}\}/g;
const IF_RE = /\{\{#if\s+([a-z_]+)\s*\}\}([\s\S]*?)(?:\{\{else\}\}([\s\S]*?))?\{\{\/if\}\}/g;

export function applyConditionals(text: string, flags: RenderFlags) {
  return text.replace(IF_RE, (_, flag: string, yes: string, no?: string) => (flags[flag] ? yes : no ?? ""));
}

/** Replace placeholders. `escape` html-escapes values (always on for HTML output). */
export function fill(text: string, vars: RenderVars, flags: RenderFlags, escape: boolean) {
  const t = applyConditionals(text, flags);
  return t.replace(VAR_RE, (m, key: string) => {
    const v = vars[key];
    if (v === undefined || v === null || v === "") return escape ? `<span style="background:#FDECEC;color:#B4362A">[${key}]</span>` : `[${key}]`;
    return escape ? escapeHtml(String(v)) : String(v);
  });
}

/** Lists unknown placeholders and placeholders with no value for this recipient. */
export function analysePlaceholders(texts: string[], vars: RenderVars, flags: RenderFlags) {
  const known = new Set(PLACEHOLDERS.map((p) => p.key));
  const unknown = new Set<string>();
  const missing = new Set<string>();
  for (const raw of texts) {
    const t = applyConditionals(raw, flags);
    for (const m of t.matchAll(VAR_RE)) {
      const k = m[1];
      if (!known.has(k)) unknown.add(k);
      else if (vars[k] === undefined || vars[k] === null || vars[k] === "") missing.add(k);
    }
  }
  return { unknown: [...unknown], missing: [...missing] };
}

export function blockTexts(blocks: EmailBlock[], subject = "", preheader = "") {
  const out = [subject, preheader];
  for (const b of blocks) {
    if ("text" in b && b.text) out.push(b.text);
    if (b.type === "banner") out.push(b.title ?? "", b.subtitle ?? "");
    if (b.type === "button") out.push(b.label, b.url);
    if (b.type === "image") out.push(b.url);
  }
  return out;
}

export function findInvalidLinks(blocks: EmailBlock[], vars: RenderVars, flags: RenderFlags) {
  const bad: string[] = [];
  for (const b of blocks) {
    const urls = b.type === "button" ? [b.url] : b.type === "image" ? [b.url] : b.type === "banner" && b.imageUrl ? [b.imageUrl] : [];
    for (const u of urls) {
      const v = fill(u, vars, flags, false).trim();
      if (!v || !isSafeUrl(v)) bad.push(`${b.type}: ${v || "(empty)"}`);
    }
  }
  return bad;
}

const C = { brand: "#E4572E", navy: "#0E2240", ink: "#1B2433", muted: "#5F6B7D", line: "#E6E3DD", canvas: "#F4F2EE" };
const FONT = "Inter,'Segoe UI',Helvetica,Arial,sans-serif";

/** Paragraph text → HTML: blank line = new paragraph, single newline = <br>, **bold**. */
function richText(text: string, vars: RenderVars, flags: RenderFlags, style: string) {
  const filled = fill(text, vars, flags, true);
  return filled
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p style="margin:0 0 16px;${style}">${p.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>").replace(/\n/g, "<br>")}</p>`)
    .join("");
}

const BANNER_BG: Record<string, [string, string]> = {
  brand: ["#E4572E", "linear-gradient(135deg,#E4572E 0%,#C9441E 55%,#0E2240 140%)"],
  navy: ["#0E2240", "linear-gradient(135deg,#0E2240 0%,#16305A 70%,#E4572E 160%)"],
  festive: ["#7A1F1F", "linear-gradient(135deg,#7A1F1F 0%,#B4362A 50%,#C99A2E 130%)"],
  soft: ["#FDF1EC", "linear-gradient(135deg,#FDF1EC 0%,#FBE0D5 100%)"],
};

function renderBlock(b: EmailBlock, vars: RenderVars, flags: RenderFlags, brand: Brand): string {
  const f = (t: string) => fill(t, vars, flags, true);
  switch (b.type) {
    case "logo":
      return `<tr><td style="padding:28px 40px 8px">${
        brand.logoUrl && isSafeUrl(brand.logoUrl)
          ? `<img src="${escapeHtml(brand.logoUrl)}" alt="${escapeHtml(brand.companyName)}" height="40" style="display:block;height:40px;border:0">`
          : `<table role="presentation" cellpadding="0" cellspacing="0"><tr>
              <td style="background:${C.brand};border-radius:8px;width:40px;height:40px;text-align:center;font:800 15px ${FONT};color:#fff;letter-spacing:.5px">AOJ</td>
              <td style="padding-left:10px;font:700 14px ${FONT};color:${C.navy};letter-spacing:1.5px">AOJ GLOBAL<br><span style="font-weight:500;font-size:10px;color:${C.muted};letter-spacing:1.2px">CONCEPT LIMITED</span></td>
            </tr></table>`
      }</td></tr>`;
    case "banner": {
      const [solid, grad] = BANNER_BG[b.tone ?? "brand"];
      const light = b.tone === "soft";
      const img = b.imageUrl && isSafeUrl(fill(b.imageUrl, vars, flags, false))
        ? `<img src="${escapeHtml(fill(b.imageUrl, vars, flags, false))}" alt="" width="520" style="display:block;width:100%;max-width:520px;border-radius:12px 12px 0 0;border:0">`
        : "";
      const text = b.title || b.subtitle
        ? `<div style="padding:28px 28px 26px;background:${solid};background-image:${grad};border-radius:${img ? "0 0 12px 12px" : "12px"}">
            ${b.title ? `<div style="font:700 26px/1.25 ${FONT};color:${light ? C.navy : "#fff"}">${f(b.title)}</div>` : ""}
            ${b.subtitle ? `<div style="margin-top:8px;font:400 15px/1.5 ${FONT};color:${light ? C.muted : "rgba(255,255,255,.88)"}">${f(b.subtitle)}</div>` : ""}
          </div>`
        : "";
      return `<tr><td style="padding:16px 40px 8px">${img}${text}</td></tr>`;
    }
    case "heading":
      return `<tr><td style="padding:24px 40px 4px;font:700 22px/1.3 ${FONT};color:${C.navy}">${f(b.text)}</td></tr>`;
    case "paragraph":
      return `<tr><td style="padding:12px 40px 0">${richText(b.text, vars, flags, `font:400 15px/1.65 ${FONT};color:${C.ink}`)}</td></tr>`;
    case "image": {
      const u = fill(b.url, vars, flags, false);
      if (!isSafeUrl(u)) return "";
      return `<tr><td style="padding:12px 40px"><img src="${escapeHtml(u)}" alt="${escapeHtml(b.alt ?? "")}" width="520" style="display:block;width:100%;max-width:520px;border-radius:10px;border:0"></td></tr>`;
    }
    case "button": {
      const u = fill(b.url, vars, flags, false);
      if (!isSafeUrl(u)) return "";
      return `<tr><td style="padding:12px 40px 20px"><a href="${escapeHtml(u)}" style="display:inline-block;background:${C.brand};color:#fff;text-decoration:none;font:600 14px ${FONT};padding:13px 26px;border-radius:8px">${f(b.label)}</a></td></tr>`;
    }
    case "divider":
      return `<tr><td style="padding:16px 40px"><div style="border-top:1px solid ${C.line};height:1px;line-height:1px">&nbsp;</div></td></tr>`;
    case "signature":
      return `<tr><td style="padding:8px 40px 24px">${richText(b.text, vars, flags, `font:400 15px/1.6 ${FONT};color:${C.ink}`).replace(/<p style="margin:0 0 16px;/g, '<p style="margin:0;')}</td></tr>`;
    case "contact":
      return `<tr><td style="padding:0 40px 24px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas};border-radius:10px"><tr><td style="padding:16px 20px;font:400 13px/1.7 ${FONT};color:${C.muted}">
        <strong style="color:${C.navy}">${escapeHtml(brand.companyName)}</strong><br>
        ${brand.address ? escapeHtml(brand.address) + "<br>" : ""}
        ${brand.phone ? escapeHtml(brand.phone) + " &nbsp;·&nbsp; " : ""}<a href="mailto:${escapeHtml(brand.email)}" style="color:${C.brand};text-decoration:none">${escapeHtml(brand.email)}</a> &nbsp;·&nbsp; <a href="${escapeHtml(brand.website)}" style="color:${C.brand};text-decoration:none">${escapeHtml(brand.website.replace(/^https?:\/\//, ""))}</a>
      </td></tr></table></td></tr>`;
    case "social":
      if (!brand.socials.length) return "";
      return `<tr><td style="padding:0 40px 20px;font:600 12px ${FONT}">${brand.socials
        .filter((s) => isSafeUrl(s.url))
        .map((s) => `<a href="${escapeHtml(s.url)}" style="color:${C.navy};text-decoration:none;margin-right:16px">${escapeHtml(s.label)}</a>`)
        .join("")}</td></tr>`;
    case "footer":
      return b.text ? `<tr><td style="padding:0 40px 20px;font:400 12px/1.6 ${FONT};color:${C.muted}">${f(b.text)}</td></tr>` : "";
  }
}

export type RenderOptions = {
  subject: string;
  preheader?: string | null;
  blocks: EmailBlock[];
  vars: RenderVars;
  flags: RenderFlags;
  brand: Brand;
  unsubscribeUrl?: string | null;
  footerNote?: string;
  isTest?: boolean;
};

export function renderEmail(o: RenderOptions) {
  const subject = fill(o.subject, o.vars, o.flags, false).replace(/[\r\n]+/g, " ").trim();
  const pre = o.preheader ? fill(o.preheader, o.vars, o.flags, true) : "";
  const body = o.blocks.map((b) => renderBlock(b, o.vars, o.flags, o.brand)).join("\n");
  const testBar = o.isTest
    ? `<tr><td style="background:#FFF4D6;color:#7A5300;font:700 12px ${FONT};text-align:center;padding:10px;letter-spacing:.5px">TEST EMAIL — NOT A LIVE CAMPAIGN DELIVERY</td></tr>`
    : "";
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light"><title>${escapeHtml(subject)}</title>
<style>@media (max-width:620px){.card{border-radius:0!important}.card td{padding-left:22px!important;padding-right:22px!important}}</style></head>
<body style="margin:0;padding:0;background:${C.canvas}">
<div style="display:none;max-height:0;overflow:hidden;opacity:0">${pre}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${C.canvas}"><tr><td align="center" style="padding:28px 12px">
<table role="presentation" class="card" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid ${C.line}">
<tr><td style="height:5px;background:${C.brand};background-image:linear-gradient(90deg,${C.brand},${C.navy});font-size:0;line-height:0">&nbsp;</td></tr>
${testBar}
${body}
</table>
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px"><tr><td style="padding:20px 24px;text-align:center;font:400 12px/1.6 ${FONT};color:${C.muted}">
${escapeHtml(o.brand.companyName)} · Mechanical, Electrical &amp; Piping Engineering<br>
${o.footerNote ? escapeHtml(o.footerNote) + "<br>" : ""}
${o.unsubscribeUrl ? `<a href="${escapeHtml(o.unsubscribeUrl)}" style="color:${C.muted}">Manage communication preferences / unsubscribe</a>` : ""}
</td></tr></table>
</td></tr></table></body></html>`;
  return { subject: (o.isTest ? "[TEST] " : "") + subject, html, text: toPlainText(o) };
}

function toPlainText(o: RenderOptions) {
  const lines: string[] = [];
  for (const b of o.blocks) {
    const f = (t: string) => fill(t, o.vars, o.flags, false);
    if (b.type === "banner" && b.title) lines.push(f(b.title).toUpperCase());
    if (b.type === "heading" || b.type === "paragraph" || b.type === "signature") lines.push(f(b.text).replace(/\*\*/g, ""));
    if (b.type === "button") lines.push(`${f(b.label)}: ${f(b.url)}`);
    if (b.type === "contact") lines.push(`${o.brand.companyName} | ${o.brand.email} | ${o.brand.website}`);
  }
  if (o.unsubscribeUrl) lines.push(`Unsubscribe: ${o.unsubscribeUrl}`);
  return lines.join("\n\n");
}

/** Standard variable set for a recipient. */
export function contactVars(
  c: { firstName: string; lastName: string; preferredName?: string | null; organisation?: string | null; department?: string | null; jobTitle?: string | null },
  extra: { brand: Brand; senderName: string; senderPosition?: string; eventName?: string | null; eventDate?: string | null; projectName?: string | null; yearsOfService?: number | null; when?: Date }
): RenderVars {
  const when = extra.when ?? new Date();
  const m = new Date(when.getTime() + 3600000);
  return {
    first_name: c.preferredName || c.firstName,
    last_name: c.lastName,
    full_name: `${c.firstName} ${c.lastName}`,
    recipient_company: c.organisation ?? "",
    department: c.department ?? "",
    job_title: c.jobTitle ?? "",
    project_name: extra.projectName ?? "",
    years_of_service: extra.yearsOfService ?? "",
    event_name: extra.eventName ?? "",
    event_date: extra.eventDate ?? "",
    current_month: MONTHS[m.getUTCMonth()],
    current_year: m.getUTCFullYear(),
    company_name: extra.brand.companyName,
    company_website: extra.brand.website,
    sender_name: extra.senderName,
    sender_position: extra.senderPosition ?? "",
  };
}

export function contactFlags(category: string, yearsOfService?: number | null): RenderFlags {
  const internal = ["STAFF", "MANAGEMENT", "CONTRACTOR"].includes(category);
  return {
    staff: internal,
    internal,
    external: !internal,
    customer: category === "CUSTOMER" || category === "FORMER_CUSTOMER",
    partner: ["PARTNER", "SUPPLIER", "CONSULTANT", "STAKEHOLDER"].includes(category),
    prospect: category === "PROSPECT",
    milestone: !!yearsOfService && yearsOfService % 5 === 0,
  };
}
