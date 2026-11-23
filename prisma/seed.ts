/**
 * Idempotent seed — safe to run on every deployment.
 * Creates catalogue rows only when they don't exist yet, so edits made in the app are never overwritten.
 * Set SEED_DEMO_DATA=true to add fictitious sample contacts and history (never in production).
 */
import { PrismaClient, type ContactCategory } from "@prisma/client";
import { hash } from "@node-rs/argon2";
import { AUTOMATION_CATALOG, EVENT_CATALOG, SEGMENT_CATALOG, TEMPLATE_CATALOG } from "../src/lib/catalog";
import { DEFAULT_SETTINGS } from "../src/lib/settings";

// Local runs: load .env when present (Vercel injects environment variables directly).
try {
  process.loadEnvFile?.(".env");
} catch {
  /* no .env file */
}

const prisma = new PrismaClient();

async function main() {
  // Settings
  await prisma.setting.upsert({ where: { key: "app" }, create: { key: "app", value: DEFAULT_SETTINGS as object }, update: {} });

  // Root administrator: created once, never overwritten. The seeded password must be changed at first sign-in.
  // Override with ROOT_ADMIN_NAME / ROOT_ADMIN_EMAIL / ROOT_ADMIN_PASSWORD in the environment if needed.
  const rootEmail = (process.env.ROOT_ADMIN_EMAIL || "samuelab.aoj@gmail.com").trim().toLowerCase();
  if (!(await prisma.user.findUnique({ where: { email: rootEmail } }))) {
    const root = await prisma.user.create({
      data: {
        name: process.env.ROOT_ADMIN_NAME || "Admin",
        email: rootEmail,
        role: "SUPER_ADMIN",
        department: "ICT",
        position: "Root Administrator",
        passwordHash: await hash(process.env.ROOT_ADMIN_PASSWORD || "admin123$$", { algorithm: 2, memoryCost: 19456, timeCost: 2, parallelism: 1 }),
        mustChangePassword: true,
      },
    });
    await prisma.auditLog.create({ data: { userId: root.id, action: "auth.setup", entity: "User", entityId: root.id, detail: "Root administrator created by deployment seed" } });
    console.log(`Root administrator created: ${rootEmail}`);
  }

  // Templates
  for (const t of TEMPLATE_CATALOG) {
    const exists = await prisma.template.findUnique({ where: { key: t.key } });
    if (exists) continue;
    await prisma.template.create({
      data: {
        key: t.key, name: t.name, category: t.category, audience: t.audience, department: t.department, createdBy: "System", updatedBy: "System",
        versions: { create: { version: 1, subject: t.subject, preheader: t.preheader, blocks: t.blocks as object[], note: "Launch catalogue", createdBy: "System" } },
      },
    });
  }

  // Calendar
  for (const e of EVENT_CATALOG) {
    let ev = await prisma.calendarEvent.findUnique({ where: { key: e.key } });
    if (!ev) {
      ev = await prisma.calendarEvent.create({
        data: { key: e.key, name: e.name, description: e.description, category: e.category, rule: e.rule, month: e.month, day: e.day, easterOffset: e.easterOffset, audience: e.audience, active: e.active },
      });
    }
    for (const d of e.dates ?? []) {
      await prisma.eventDate.upsert({
        where: { eventId_year: { eventId: ev.id, year: d.year } },
        create: { eventId: ev.id, year: d.year, date: new Date(`${d.date}T00:00:00Z`), confirmed: false, source: "Provisional astronomical estimate" },
        update: {},
      });
    }
  }

  // Automations
  for (const a of AUTOMATION_CATALOG) {
    if (await prisma.automation.findUnique({ where: { key: a.key } })) continue;
    const template = await prisma.template.findUnique({ where: { key: a.templateKey } });
    const event = a.eventKey ? await prisma.calendarEvent.findUnique({ where: { key: a.eventKey } }) : null;
    if (!template) continue;
    await prisma.automation.create({
      data: {
        key: a.key, name: a.name, description: a.description, status: a.status, trigger: a.trigger, weekday: a.weekday, dayOfMonth: a.dayOfMonth, sendTime: a.sendTime,
        eventId: event?.id, audience: a.audience, categories: a.categories, templateId: template.id, senderIdentity: a.senderIdentity,
        isMarketing: a.isMarketing, requiresApproval: a.requiresApproval, leadDays: a.leadDays,
      },
    });
  }

  // Segments
  for (const s of SEGMENT_CATALOG) {
    await prisma.segment.upsert({ where: { name: s.name }, create: { ...s, rules: s.rules as object }, update: {} });
  }

  if (process.env.SEED_DEMO_DATA === "true") await demo();
  console.log("Seed complete.");
}

async function demo() {
  if ((await prisma.contact.count()) > 0) return;
  const now = new Date();
  const rel = (days: number) => {
    const d = new Date(now.getTime() + 3600_000 + days * 86400_000);
    return { m: d.getUTCMonth() + 1, d: d.getUTCDate() };
  };
  type P = [string, string, ContactCategory, string, string, string | null, { m: number; d: number } | null, string?, string?];
  // first, last, category, email, organisation/department, jobTitle, birthday, city, joined
  const people: P[] = [
    ["John", "Ade", "STAFF", "john.ade@example.com", "Engineering", "Mechanical Engineer", rel(6), "Lagos", "2021-11-22"],
    ["Mary", "James", "STAFF", "mary.james@example.com", "Human Resources", "HR Officer", rel(3), "Lagos", "2023-02-01"],
    ["Tunde", "Bakare", "STAFF", "tunde.bakare@example.com", "ICT", "ICT Administrator", rel(0), "Lagos", "2019-04-10"],
    ["Ngozi", "Okafor", "MANAGEMENT", "ngozi.okafor@example.com", "Management", "Head of Projects", { m: 3, d: 8 }, "Abuja", "2016-" + String(rel(4).m).padStart(2, "0") + "-" + String(rel(4).d).padStart(2, "0")],
    ["Ibrahim", "Musa", "STAFF", "ibrahim.musa@example.com", "Projects", "Site Supervisor", { m: 2, d: 29 }, "Abuja", "2022-06-15"],
    ["Chiamaka", "Eze", "STAFF", "chiamaka.eze@example.com", "Business Development", "BD Executive", rel(9), "Lagos", "2024-01-08"],
    ["Femi", "Adeyemi", "STAFF", "femi.adeyemi@example.com", "Engineering", "Electrical Engineer", { m: 7, d: 19 }, "Port Harcourt", "2020-09-01"],
    ["Aisha", "Bello", "STAFF", "aisha.bello@example.com", "Finance", "Accountant", { m: 1, d: 30 }, "Lagos", "2018-03-12"],
    ["Kelechi", "Nwosu", "CUSTOMER", "kelechi@abc-ltd.example.com", "ABC Ltd", "Facilities Manager", rel(5), "Lagos"],
    ["Olumide", "Coker", "CUSTOMER", "o.coker@lekki-towers.example.com", "Lekki Towers Ltd", "Project Director", { m: 12, d: 2 }, "Lagos"],
    ["Hauwa", "Garba", "CUSTOMER", "hauwa@northgate.example.org", "Northgate Hospitals", "Estates Lead", null, "Abuja"],
    ["Daniel", "Okon", "FORMER_CUSTOMER", "d.okon@deltaplaza.example.com", "Delta Plaza", "Owner", null, "Port Harcourt"],
    ["Sade", "Williams", "PARTNER", "sade@powerline.example.com", "Powerline Supplies", "Partnership Manager", null, "Lagos"],
    ["Emeka", "Obi", "PROSPECT", "emeka.obi@greenfield.example.com", "Greenfield Estates", "CEO", null, "Enugu"],
    ["Test", "Bounce", "CUSTOMER", "bounce.test@example.com", "Bounce Test Co", "Test", null, "Lagos"],
  ];
  for (const [first, last, category, email, org, job, bday, city, joined] of people) {
    const internal = ["STAFF", "MANAGEMENT"].includes(category);
    await prisma.contact.create({
      data: {
        firstName: first, lastName: last, email, category, city, jobTitle: job,
        department: internal ? org : null, organisation: internal ? "AOJ Global Concept Limited" : org,
        birthMonth: bday?.m, birthDay: bday?.d,
        marketingConsent: internal ? "UNKNOWN" : category === "PROSPECT" ? "UNKNOWN" : "GRANTED",
        staffProfile: internal ? { create: { dateJoined: joined ? new Date(`${joined}T00:00:00Z`) : null } } : undefined,
        customerProfile: !internal ? { create: { relationshipStatus: category === "FORMER_CUSTOMER" ? "Former" : category === "PROSPECT" ? "Prospect" : "Active", firstEngagement: new Date("2022-05-10T00:00:00Z"), relationshipManager: "Chiamaka Eze" } } : undefined,
        consents: !internal ? { create: { status: category === "PROSPECT" ? "UNKNOWN" : "GRANTED", source: "Demo data" } } : undefined,
      },
    });
  }
  const kel = await prisma.contact.findUnique({ where: { email: "kelechi@abc-ltd.example.com" } });
  const ola = await prisma.contact.findUnique({ where: { email: "o.coker@lekki-towers.example.com" } });
  if (kel) await prisma.project.create({ data: { name: "ABC Ltd Head Office HVAC Upgrade", contactId: kel.id, stage: "Completed", location: "Victoria Island, Lagos" } });
  if (ola) await prisma.project.create({ data: { name: "Lekki Towers MEP Installation", contactId: ola.id, stage: "Milestone", location: "Lekki, Lagos" } });

  // Six weeks of past "New Week – Staff" sends for analytics.
  const tv = await prisma.templateVersion.findFirst({ where: { template: { key: "new-week-staff" } } });
  const staff = await prisma.contact.findMany({ where: { category: { in: ["STAFF", "MANAGEMENT"] } } });
  if (tv) {
    for (let w = 6; w >= 1; w--) {
      const when = new Date(now.getTime() - w * 7 * 86400_000);
      const c = await prisma.campaign.create({
        data: { name: `Happy New Week – Staff (demo week -${w})`, type: "RELATIONSHIP", audience: "INTERNAL", status: "SENT", templateVersionId: tv.id, senderIdentity: "communications", scheduledAt: when, completedAt: when, requiresApproval: false, approvedRevision: 1, createdBy: "Demo data" },
      });
      for (const s of staff) {
        await prisma.campaignRecipient.create({ data: { campaignId: c.id, contactId: s.id, email: s.email, status: "ACCEPTED", sentAt: when, attempts: 1, events: { create: { type: "ACCEPTED", detail: "Demo data" } } } });
      }
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
