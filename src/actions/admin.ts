"use server";
import { generateTempPassword, sendLoginDetails, sendPasswordChanged } from "@/lib/account-email";

import type { Role } from "@prisma/client";
import { prisma } from "@/lib/db";
import { assertPermission, assertUser, clientIp } from "@/lib/auth";
import { audit, notify } from "@/lib/audit";
import { run, str, type ActionResult } from "@/lib/action";
import { getSettings, saveSettings } from "@/lib/settings";
import { hashPassword, passwordProblem } from "@/lib/password";
import { notificationWhere } from "@/lib/queries";
import { isSafeUrl, isValidEmail, normEmail } from "@/lib/utils";

const ROLES: Role[] = ["SUPER_ADMIN", "COMMS_OFFICER", "HR", "APPROVER", "AUDITOR"];
const num = (fd: FormData, k: string, min: number, max: number) => Math.min(max, Math.max(min, Number(str(fd, k)) || min));

export async function saveBranding(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("settings:write");
    const website = str(fd, "website");
    const logoUrl = str(fd, "logoUrl");
    if (website && !isSafeUrl(website)) throw new Error("Website must start with https://");
    if (logoUrl && !/^https:\/\//.test(logoUrl)) throw new Error("Logo URL must start with https:// (email clients block other images).");
    const socials = ["LinkedIn", "Facebook", "Instagram", "X"].map((label) => ({ label, url: str(fd, `social_${label}`) })).filter((s) => s.url && isSafeUrl(s.url));
    await saveSettings({ brand: { companyName: str(fd, "companyName"), shortName: str(fd, "shortName"), website, email: str(fd, "email"), phone: str(fd, "phone"), address: str(fd, "address"), logoUrl, socials } });
    await audit(u.id, "settings.branding", "Settings", undefined, undefined, await clientIp());
    return { ok: true, message: "Branding saved." };
  });
}

export async function saveSenders(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("settings:write");
    const ids = fd.getAll("senderId").map(String);
    const senders = ids.map((id, i) => ({ id, name: String(fd.getAll("senderName")[i] ?? "").trim(), email: normEmail(String(fd.getAll("senderEmail")[i] ?? "")) })).filter((s) => s.id && s.name && s.email);
    for (const s of senders) if (!isValidEmail(s.email)) throw new Error(`${s.email} is not a valid address.`);
    const newEmail = normEmail(str(fd, "newEmail"));
    if (newEmail) {
      if (!isValidEmail(newEmail)) throw new Error("New sender email is invalid.");
      senders.push({ id: str(fd, "newId").toLowerCase().replace(/[^a-z0-9-]/g, "") || newEmail.split("@")[0], name: str(fd, "newName") || "AOJ Global", email: newEmail });
    }
    if (!senders.length) throw new Error("Keep at least one sender identity.");
    await saveSettings({ senders, defaultSendTime: str(fd, "defaultSendTime") || "08:00" });
    await audit(u.id, "settings.senders", "Settings", undefined, senders.map((s) => s.email).join(", "));
    return { ok: true, message: "Sender identities saved. Each address must be verified in Amazon SES before it can send." };
  });
}

export async function savePolicies(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("settings:write");
    const reminders = [...new Set(str(fd, "reminderDays").split(",").map((s) => Number(s.trim())).filter((n) => n > 0 && n <= 90))].sort((a, b) => b - a);
    await saveSettings({
      limits: { routinePerWeek: num(fd, "routinePerWeek", 1, 7), perCampaignMax: num(fd, "perCampaignMax", 1, 100000), dailyMax: num(fd, "dailyMax", 1, 1000000), batchSize: num(fd, "batchSize", 10, 1000), approvalThreshold: num(fd, "approvalThreshold", 1, 100000) },
      approvals: { manualCampaignsRequireApproval: fd.get("manualCampaignsRequireApproval") === "on" },
      reminders: { defaultDays: reminders },
      privacy: { retentionMonths: num(fd, "retentionMonths", 6, 120), purposeStatement: str(fd, "purposeStatement") },
      sending: { ...(await getSettings()).sending, testRecipientDomains: str(fd, "testRecipientDomains").split(",").map((d) => d.trim().toLowerCase()).filter(Boolean) },
    });
    await audit(u.id, "settings.policies", "Settings");
    return { ok: true, message: "Policies saved." };
  });
}

export async function setSuspension(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("settings:write");
    const suspended = str(fd, "suspended") === "true";
    const s = await getSettings();
    await saveSettings({ sending: { ...s.sending, suspended, suspendedReason: suspended ? str(fd, "reason") || `Suspended by ${u.name}` : undefined } });
    await audit(u.id, suspended ? "sending.suspended" : "sending.resumed", "Settings", undefined, str(fd, "reason"), await clientIp());
    await notify({ roles: ["SUPER_ADMIN", "COMMS_OFFICER", "APPROVER"], level: suspended ? "error" : "success", title: suspended ? "Emergency sending suspension activated" : "Sending resumed", body: `By ${u.name}${str(fd, "reason") ? `: ${str(fd, "reason")}` : ""}` });
    return { ok: true, message: suspended ? "All sending is suspended." : "Sending resumed." };
  });
}

// ── Users ──
export async function createUser(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("users:write");
    const email = normEmail(str(fd, "email"));
    const role = str(fd, "role") as Role;
    if (!isValidEmail(email)) throw new Error("Enter a valid email.");
    if (!ROLES.includes(role)) throw new Error("Choose a role.");
    if (!str(fd, "name")) throw new Error("Enter the person's name.");
    if (await prisma.user.findUnique({ where: { email } })) throw new Error("An account with this email already exists.");
    const pw = str(fd, "password") || generateTempPassword();
    const problem = passwordProblem(pw);
    if (problem) throw new Error(problem);
    const created = await prisma.user.create({ data: { email, name: str(fd, "name"), role, department: str(fd, "department") || null, position: str(fd, "position") || null, passwordHash: await hashPassword(pw), mustChangePassword: true } });
    await audit(u.id, "user.created", "User", created.id, `${email} as ${role}`, await clientIp());
    const mail = await sendLoginDetails({ to: email, name: created.name, tempPassword: pw, invitedBy: u.name });
    return { ok: true, message: `Account created for ${email}. Temporary password: ${pw}. ${mailNote(mail)}` };
  });
}

export async function updateUser(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("users:write");
    const id = str(fd, "id");
    const target = await prisma.user.findUniqueOrThrow({ where: { id } });
    const role = str(fd, "role") as Role;
    const active = str(fd, "active") !== "false";
    if (id === u.id && (role !== "SUPER_ADMIN" || !active)) throw new Error("You cannot remove your own administrator access.");
    if (target.role === "SUPER_ADMIN" && (role !== "SUPER_ADMIN" || !active)) {
      const admins = await prisma.user.count({ where: { role: "SUPER_ADMIN", active: true } });
      if (admins <= 1) throw new Error("At least one active ICT Administrator is required.");
    }
    const pw = str(fd, "password");
    if (pw && passwordProblem(pw)) throw new Error(passwordProblem(pw)!);
    const roleChanged = ROLES.includes(role) && role !== target.role;
    await prisma.user.update({
      where: { id },
      data: {
        role: ROLES.includes(role) ? role : target.role, active,
        ...(pw ? { passwordHash: await hashPassword(pw), failedLogins: 0, lockedUntil: null, mustChangePassword: true } : {}),
        // Invalidate sessions on any security-relevant change.
        ...(pw || !active || roleChanged ? { sessionEpoch: { increment: 1 } } : {}),
      },
    });
    await audit(u.id, roleChanged ? "user.permissions_changed" : "user.updated", "User", id, `${target.email}: role=${role}, active=${active}${pw ? ", password reset" : ""}`, await clientIp());
    return { ok: true, message: "User updated." };
  });
}

function mailNote(r: { ok: boolean; mode: string } & ({ simulated?: boolean } | { error?: string })) {
  if (!r.ok) return "The login email could not be sent, so share the password with them directly.";
  return r.mode === "simulation" ? "No email provider is connected yet, so share the password with them directly." : "Their login details have been emailed to them.";
}

/** Admin password reset: issues a new temporary password, signs the user out and emails them. */
export async function resetUserPassword(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("users:write");
    const target = await prisma.user.findUniqueOrThrow({ where: { id: str(fd, "id") } });
    const pw = generateTempPassword();
    await prisma.user.update({ where: { id: target.id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: true, failedLogins: 0, lockedUntil: null, sessionEpoch: { increment: 1 } } });
    await audit(u.id, "user.password_reset", "User", target.id, target.email, await clientIp());
    const mail = await sendLoginDetails({ to: target.email, name: target.name, tempPassword: pw, invitedBy: u.name, reset: true });
    return { ok: true, message: `New temporary password for ${target.name}: ${pw}. ${mailNote(mail)}` };
  });
}

export async function changeOwnPassword(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertUser();
    const { verifyPassword } = await import("@/lib/password");
    if (!(await verifyPassword(u.passwordHash, str(fd, "current")))) throw new Error("Current password is incorrect.");
    const pw = str(fd, "password");
    const problem = passwordProblem(pw);
    if (problem) throw new Error(problem);
    if (await verifyPassword(u.passwordHash, pw)) throw new Error("Choose a password different from the current one.");
    await prisma.user.update({ where: { id: u.id }, data: { passwordHash: await hashPassword(pw), mustChangePassword: false, sessionEpoch: { increment: 1 } } });
    await audit(u.id, "user.password_changed", "User", u.id);
    await sendPasswordChanged({ to: u.email, name: u.name }).catch(() => undefined);
    return { ok: true, redirectTo: "/login?changed=1" };
  });
}

// ── Suppressions ──
export async function addSuppression(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("campaigns:write");
    const email = normEmail(str(fd, "email"));
    if (!isValidEmail(email)) throw new Error("Enter a valid email.");
    await prisma.suppression.upsert({ where: { email }, create: { email, reason: "MANUAL", detail: str(fd, "detail") || `Added by ${u.name}` }, update: {} });
    await audit(u.id, "suppression.added", "Suppression", undefined, email);
    return { ok: true, message: `${email} suppressed.` };
  });
}

// ── Media ──
export async function addMedia(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("media:write");
    const url = str(fd, "url");
    if (!/^https:\/\//.test(url)) throw new Error("Use an https:// image URL (e.g. from the company website or S3).");
    if (!/\.(png|jpe?g|gif|webp|svg)(\?.*)?$/i.test(url)) throw new Error("The URL must point to an image file (.png, .jpg, .gif, .webp, .svg).");
    await prisma.mediaAsset.create({ data: { name: str(fd, "name") || url.split("/").pop()!.slice(0, 80), url, kind: str(fd, "kind") || "Banner", createdBy: u.name } });
    await audit(u.id, "media.added", "MediaAsset", undefined, url);
    return { ok: true, message: "Added to the media library." };
  });
}

const MAX_UPLOAD = 4 * 1024 * 1024;

/** Detect the real image type from the file's first bytes (never trust the browser-supplied type). SVG is refused: it can carry scripts. */
function sniffImage(b: Buffer): string | null {
  if (b.length > 8 && b[0] === 0x89 && b.toString("ascii", 1, 4) === "PNG") return "image/png";
  if (b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length > 6 && b.toString("ascii", 0, 4) === "GIF8") return "image/gif";
  if (b.length > 12 && b.toString("ascii", 0, 4) === "RIFF" && b.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  return null;
}

/** Upload a flyer / image. Returns its public URL in `data.url` for the template editor and broadcast composer. */
export async function uploadMedia(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("media:write");
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image to upload.");
    if (file.size > MAX_UPLOAD) throw new Error("That image is larger than 4 MB. Save it smaller (e.g. export as JPG) and try again.");
    const bytes = Buffer.from(await file.arrayBuffer());
    const mime = sniffImage(bytes);
    if (!mime) throw new Error("Only JPG, PNG, GIF or WebP images can be uploaded.");
    const dim = (k: string) => { const n = Number(str(fd, k)); return Number.isInteger(n) && n > 0 && n < 20000 ? n : null; };
    const name = (str(fd, "name") || file.name.replace(/\.[a-z0-9]+$/i, "") || "Flyer").slice(0, 80);
    const asset = await prisma.mediaAsset.create({
      data: { name, url: "", kind: str(fd, "kind") || "Flyer", data: bytes, mime, size: bytes.length, width: dim("width"), height: dim("height"), createdBy: u.name },
      select: { id: true },
    });
    const url = `/email/media/${asset.id}`;
    await prisma.mediaAsset.update({ where: { id: asset.id }, data: { url } });
    await audit(u.id, "media.uploaded", "MediaAsset", asset.id, `${name} (${Math.round(bytes.length / 1024)} KB)`);
    return { ok: true, message: "Uploaded to the media library.", data: { url, name } };
  });
}

export async function deleteMedia(_: ActionResult | null, fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertPermission("media:write");
    await prisma.mediaAsset.delete({ where: { id: str(fd, "id") } });
    await audit(u.id, "media.deleted", "MediaAsset", str(fd, "id"));
    return { ok: true };
  });
}

// ── Notifications ──
export async function markAllRead(_: ActionResult | null, _fd: FormData): Promise<ActionResult> {
  return run(async () => {
    const u = await assertUser();
    const unread = await prisma.notification.findMany({ where: { AND: [notificationWhere(u), { NOT: { readBy: { has: u.id } } }] }, select: { id: true } });
    await prisma.notification.updateMany({ where: { id: { in: unread.map((n) => n.id) } }, data: { readBy: { push: u.id } } });
    return { ok: true };
  });
}
