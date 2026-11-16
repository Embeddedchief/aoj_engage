"use server";

import type { Audience, ContactCategory } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertUser } from "@/lib/auth";
import { audit } from "@/lib/audit";
import { run, str, type ActionResult } from "@/lib/action";
import { canWorkWithAudience, can } from "@/lib/permissions";
import type { SegmentRules } from "@/lib/segments";

const list = (fd: FormData, k: string) => fd.getAll(k).map(String).filter(Boolean);
const csv = (fd: FormData, k: string) => str(fd, k).split(",").map((s) => s.trim()).filter(Boolean);

export async function saveSegment(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertUser();
    if (!can(user.role, "campaigns:write")) throw new Error("Not permitted.");
    const audience = str(fd, "audience") as Audience;
    if (!["INTERNAL", "EXTERNAL", "BOTH"].includes(audience) || !canWorkWithAudience(user.role, audience)) throw new Error("You cannot create segments for this audience.");
    const rules: SegmentRules = {
      categories: list(fd, "categories") as ContactCategory[],
      departments: list(fd, "departments"),
      cities: csv(fd, "cities"),
      relationshipStatus: list(fd, "relationshipStatus"),
      projectStages: list(fd, "projectStages"),
      birthdayThisMonth: fd.get("birthdayThisMonth") === "on",
      marketingConsentOnly: fd.get("marketingConsentOnly") === "on",
    };
    const name = str(fd, "name");
    if (!name) throw new Error("Give the segment a name.");
    const id = str(fd, "id");
    const data = { name, description: str(fd, "description") || null, audience, rules: rules as object };
    const s = id ? await prisma.segment.update({ where: { id }, data }) : await prisma.segment.create({ data });
    await audit(user.id, id ? "segment.updated" : "segment.created", "Segment", s.id, name);
    return { ok: true, redirectTo: "/segments" };
  });
}

export async function deleteSegment(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const user = await assertUser();
    if (!can(user.role, "campaigns:write")) throw new Error("Not permitted.");
    const id = str(fd, "id");
    const used = await prisma.campaign.count({ where: { segmentId: id } });
    if (used) return { ok: false, error: `This segment is used by ${used} campaign(s) and is kept for history.` };
    await prisma.segment.delete({ where: { id } });
    await audit(user.id, "segment.deleted", "Segment", id);
    return { ok: true };
  });
}
