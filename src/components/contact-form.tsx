"use client";

import { useState } from "react";
import type { ContactCategory } from "@prisma/client";
import { ActionForm, Submit } from "./forms";
import { CATEGORY_LABEL, DEPARTMENTS, INTERNAL_CATEGORIES } from "@/lib/constants";
import { MONTHS } from "@/lib/time";
import type { ActionResult } from "@/lib/action";

export type ContactFormValues = {
  id?: string; firstName?: string; lastName?: string; preferredName?: string | null; email?: string; phone?: string | null; category?: ContactCategory;
  organisation?: string | null; jobTitle?: string | null; department?: string | null; city?: string | null; birthMonth?: number | null; birthDay?: number | null; birthYear?: number | null;
  anniversary?: string | null; notes?: string | null; marketingConsent?: string; birthdayCommsAllowed?: boolean;
  dateJoined?: string | null; employmentStatus?: string; manager?: string | null; birthdayVisibleToColleagues?: boolean;
  relationshipManager?: string | null; customerCategory?: string | null; firstEngagement?: string | null; language?: string; relationshipStatus?: string;
};

export function ContactForm({ action, values = {}, categories, submitLabel }: { action: (p: ActionResult | null, fd: FormData) => Promise<ActionResult>; values?: ContactFormValues; categories: ContactCategory[]; submitLabel: string }) {
  const [category, setCategory] = useState<ContactCategory>(values.category ?? categories[0]);
  const internal = INTERNAL_CATEGORIES.includes(category);
  const v = values;
  return (
    <ActionForm action={action} className="space-y-6">
      {v.id && <input type="hidden" name="id" value={v.id} />}
      <section className="card p-5">
        <h2 className="mb-4 text-sm font-semibold text-navy">Basic details</h2>
        <div className="grid gap-4 md:grid-cols-2">
          <L label="First name *"><input className="input" name="firstName" defaultValue={v.firstName} required maxLength={80} /></L>
          <L label="Last name *"><input className="input" name="lastName" defaultValue={v.lastName} required maxLength={80} /></L>
          <L label="Email address *"><input className="input" type="email" name="email" defaultValue={v.email} required /></L>
          <L label="Phone number"><input className="input" name="phone" defaultValue={v.phone ?? ""} /></L>
          <L label="Contact category *">
            <select className="input" name="category" value={category} onChange={(e) => setCategory(e.target.value as ContactCategory)}>
              {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </L>
          <L label="Preferred name" hint="Used for {{first_name}} in greetings when set"><input className="input" name="preferredName" defaultValue={v.preferredName ?? ""} /></L>
          <L label={internal ? "Organisation" : "Company / organisation"}><input className="input" name="organisation" defaultValue={v.organisation ?? (internal ? "AOJ Global Concept Limited" : "")} /></L>
          <L label="Job title"><input className="input" name="jobTitle" defaultValue={v.jobTitle ?? ""} /></L>
          {internal && (
            <L label="Department">
              <select className="input" name="department" defaultValue={v.department ?? ""}>
                <option value="">—</option>
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </L>
          )}
          <L label="City"><input className="input" name="city" defaultValue={v.city ?? ""} placeholder="e.g. Lagos" /></L>
        </div>
      </section>

      <section className="card p-5">
        <h2 className="mb-1 text-sm font-semibold text-navy">Important dates</h2>
        <p className="mb-4 text-xs text-muted">Optional. Birthdays are used only for greetings, and the year is never shown in messages.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <div>
            <span className="label">Birthday</span>
            <div className="grid grid-cols-[1fr_1.6fr_1.2fr] gap-2">
              <select className="input" name="birthDay" defaultValue={v.birthDay ?? ""} aria-label="Birth day">
                <option value="">Day</option>
                {Array.from({ length: 31 }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
              </select>
              <select className="input" name="birthMonth" defaultValue={v.birthMonth ?? ""} aria-label="Birth month">
                <option value="">Month</option>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <input className="input" name="birthYear" type="number" min={1920} max={2015} placeholder="Year (opt.)" defaultValue={v.birthYear ?? ""} aria-label="Birth year" />
            </div>
          </div>
          <L label="Anniversary (optional)"><input className="input" type="date" name="anniversary" defaultValue={v.anniversary ?? ""} /></L>
          <label className="flex items-center gap-2 text-sm md:col-span-2">
            <input type="checkbox" name="birthdayCommsAllowed" defaultChecked={v.birthdayCommsAllowed ?? true} className="h-4 w-4 accent-brand" />
            Send birthday greetings to this contact
          </label>
        </div>
      </section>

      {internal ? (
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-navy">Employment</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <L label="Date joined" hint="Drives employment-anniversary messages"><input className="input" type="date" name="dateJoined" defaultValue={v.dateJoined ?? ""} /></L>
            <L label="Employment status">
              <select className="input" name="employmentStatus" defaultValue={v.employmentStatus ?? "Active"}>
                {["Active", "Probation", "On leave", "Contract", "Exited"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </L>
            <L label="Manager"><input className="input" name="manager" defaultValue={v.manager ?? ""} /></L>
            <label className="flex items-center gap-2 self-end pb-2 text-sm">
              <input type="checkbox" name="birthdayVisibleToColleagues" defaultChecked={v.birthdayVisibleToColleagues ?? false} className="h-4 w-4 accent-brand" />
              Birthday may be shown to colleagues
            </label>
          </div>
        </section>
      ) : (
        <section className="card p-5">
          <h2 className="mb-4 text-sm font-semibold text-navy">Relationship & consent</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <L label="Relationship status">
              <select className="input" name="relationshipStatus" defaultValue={v.relationshipStatus ?? "Active"}>
                {["Active", "Completed", "Former", "Prospect", "Dormant"].map((s) => <option key={s}>{s}</option>)}
              </select>
            </L>
            <L label="Relationship manager"><input className="input" name="relationshipManager" defaultValue={v.relationshipManager ?? ""} /></L>
            <L label="Customer category"><input className="input" name="customerCategory" defaultValue={v.customerCategory ?? ""} placeholder="e.g. Corporate, Government, Residential" /></L>
            <L label="Date of first engagement"><input className="input" type="date" name="firstEngagement" defaultValue={v.firstEngagement ?? ""} /></L>
            <L label="Preferred language"><input className="input" name="language" defaultValue={v.language ?? "English"} /></L>
            <L label="Marketing consent" hint="Required for greetings and relationship emails (NDPA 2023). Project and operational emails don't need it.">
              <select className="input" name="marketingConsent" defaultValue={v.marketingConsent ?? "UNKNOWN"}>
                <option value="UNKNOWN">Not recorded</option>
                <option value="GRANTED">Granted</option>
                <option value="WITHDRAWN">Withdrawn / objected</option>
              </select>
            </L>
            <L label="Consent evidence / note" className="md:col-span-2"><input className="input" name="consentNote" placeholder="e.g. Signed form at onboarding meeting, 12 May 2026" /></L>
          </div>
        </section>
      )}

      <section className="card p-5">
        <L label="Notes"><textarea className="input min-h-24" name="notes" defaultValue={v.notes ?? ""} /></L>
      </section>
      <div className="flex justify-end"><Submit>{submitLabel}</Submit></div>
    </ActionForm>
  );
}

function L({ label, hint, children, className }: { label: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={`block ${className ?? ""}`}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}
