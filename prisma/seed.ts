/**
 * Idempotent seed — safe to run on every deployment.
 * Creates catalogue rows only when they don't exist yet, so edits made in the app are never overwritten.
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
  const existing = await prisma.setting.findUnique({ where: { key: "app" } });
  if (!existing) await prisma.setting.create({ data: { key: "app", value: DEFAULT_SETTINGS as object } });
  else {
    // Upgrade values still at the original launch defaults; anything edited in Settings is left alone.
    const v = existing.value as { brand?: Record<string, unknown>; limits?: Record<string, unknown> };
    let changed = false;
    if (v.brand?.address === "Lagos, Nigeria") { v.brand.address = DEFAULT_SETTINGS.brand.address; changed = true; }
    if (v.brand?.website === "https://aojglobal.com") { v.brand.website = DEFAULT_SETTINGS.brand.website; changed = true; }
    if (v.limits?.dailyMax === 5000) { v.limits.dailyMax = DEFAULT_SETTINGS.limits.dailyMax; changed = true; }
    if (changed) await prisma.setting.update({ where: { key: "app" }, data: { value: v as object } });
  }

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
    const exists = await prisma.template.findUnique({ where: { key: t.key }, include: { versions: { orderBy: { version: "desc" }, take: 1 } } });
    if (exists) {
      const latest = exists.versions[0];
      const hasArt = JSON.stringify(latest?.blocks ?? []).includes('"art"');
      if (exists.currentVersion === 1 && latest?.version === 1 && latest.createdBy === "System" && !hasArt) {
        await prisma.$transaction([
          prisma.templateVersion.create({ data: { templateId: exists.id, version: 2, subject: latest.subject, preheader: latest.preheader, blocks: t.blocks as object[], note: "Design refresh: occasion artwork and AOJ credentials", createdBy: "System" } }),
          prisma.template.update({ where: { id: exists.id }, data: { currentVersion: 2, updatedBy: "System" } }),
        ]);
      }
      continue;
    }
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

  console.log("Seed complete.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
