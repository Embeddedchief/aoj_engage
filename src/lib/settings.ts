import { prisma } from "./db";
import { DEFAULT_SENDERS } from "./constants";
import type { Brand } from "./email/render";

export type AppSettings = {
  brand: Brand;
  senders: { id: string; name: string; email: string }[];
  defaultSendTime: string;
  limits: {
    routinePerWeek: number; // max routine relationship emails per external contact per 7 days
    perCampaignMax: number;
    dailyMax: number;
    batchSize: number; // messages processed per engine tick
    approvalThreshold: number; // recipients above this always need approval
  };
  approvals: { manualCampaignsRequireApproval: boolean };
  sending: { suspended: boolean; suspendedReason?: string; testRecipientDomains: string[] };
  reminders: { defaultDays: number[] };
  privacy: { retentionMonths: number; purposeStatement: string };
};

export const DEFAULT_SETTINGS: AppSettings = {
  brand: {
    companyName: "AOJ Global Concept Limited",
    shortName: "AOJ Global",
    website: "https://www.aojglobal.com",
    email: "info@aojglobal.com",
    phone: "",
    address: "Horizon Height Estate, Salem Bus-stop, Lagos, Nigeria",
    logoUrl: "",
    socials: [],
  },
  senders: DEFAULT_SENDERS,
  defaultSendTime: "08:00",
  limits: { routinePerWeek: 1, perCampaignMax: 2000, dailyMax: 300, batchSize: 150, approvalThreshold: 100 },
  approvals: { manualCampaignsRequireApproval: true },
  sending: { suspended: false, testRecipientDomains: ["aojglobal.com"] },
  reminders: { defaultDays: [14, 7, 3, 1] },
  privacy: {
    retentionMonths: 36,
    purposeStatement:
      "Contact details are processed to maintain corporate, employment and customer relationships with AOJ Global Concept Limited, in line with the Nigeria Data Protection Act 2023. Marketing communications are sent only with recorded consent, and recipients may object at any time.",
  },
};

function isObj(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function merge<T>(base: T, over: unknown): T {
  if (!isObj(over)) return base;
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) };
  for (const [k, v] of Object.entries(over)) {
    const b = (base as Record<string, unknown>)[k];
    out[k] = isObj(b) ? merge(b, v) : v;
  }
  return out as T;
}

export async function getSettings(): Promise<AppSettings> {
  const row = await prisma.setting.findUnique({ where: { key: "app" } });
  return merge(DEFAULT_SETTINGS, row?.value ?? {});
}

export async function saveSettings(patch: Partial<AppSettings>) {
  const next = merge(await getSettings(), patch);
  await prisma.setting.upsert({ where: { key: "app" }, create: { key: "app", value: next as object }, update: { value: next as object } });
  return next;
}

export function senderFor(s: AppSettings, id: string) {
  return s.senders.find((x) => x.id === id) ?? s.senders[0];
}
