import { notFound } from "next/navigation";
import { requirePermission } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { ALL_CATEGORIES, AUDIENCE_LABEL, CATEGORY_LABEL, DEPARTMENTS } from "@/lib/constants";
import type { SegmentRules } from "@/lib/segments";
import { visibleAudiences } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { saveSegment } from "@/actions/segments";

export const metadata = { title: "Segment" };

export default async function SegmentEditor({ params }: { params: Promise<{ id: string }> }) {
  const user = await requirePermission("campaigns:write");
  const { id } = await params;
  const seg = id === "new" ? null : await prisma.segment.findUnique({ where: { id } });
  if (id !== "new" && !seg) notFound();
  const r = (seg?.rules ?? {}) as SegmentRules;
  const auds = visibleAudiences(user.role);
  const Check = ({ name, value, checked, label }: { name: string; value: string; checked?: boolean; label: string }) => (
    <label className="flex items-center gap-2 text-sm"><input type="checkbox" name={name} value={value} defaultChecked={checked} className="h-4 w-4 accent-brand" />{label}</label>
  );
  return (
    <div className="max-w-3xl">
      <PageHeader title={seg ? `Edit “${seg.name}”` : "New segment"} back={{ href: "/segments", label: "Segments" }} description="Leave a rule empty to include everyone in the audience. Only active contacts are ever included." />
      <ActionForm action={saveSegment} className="space-y-5">
        {seg && <input type="hidden" name="id" value={seg.id} />}
        <div className="card grid gap-4 p-5 md:grid-cols-2">
          <label><span className="label">Name *</span><input className="input" name="name" defaultValue={seg?.name} required /></label>
          <label><span className="label">Audience *</span><select className="input" name="audience" defaultValue={seg?.audience ?? auds[0]}>{auds.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</select></label>
          <label className="md:col-span-2"><span className="label">Description</span><input className="input" name="description" defaultValue={seg?.description ?? ""} /></label>
        </div>
        <div className="card space-y-5 p-5">
          <fieldset><legend className="label">Categories</legend><div className="grid grid-cols-2 gap-2 md:grid-cols-3">{ALL_CATEGORIES.map((c) => <Check key={c} name="categories" value={c} checked={r.categories?.includes(c)} label={CATEGORY_LABEL[c]} />)}</div></fieldset>
          <fieldset><legend className="label">Departments (staff)</legend><div className="grid grid-cols-2 gap-2 md:grid-cols-3">{DEPARTMENTS.map((d) => <Check key={d} name="departments" value={d} checked={r.departments?.includes(d)} label={d} />)}</div></fieldset>
          <label className="block"><span className="label">Cities (comma-separated)</span><input className="input" name="cities" defaultValue={r.cities?.join(", ")} placeholder="Lagos, Abuja" /></label>
          <fieldset><legend className="label">Customer relationship status</legend><div className="flex flex-wrap gap-4">{["Active", "Completed", "Former", "Prospect", "Dormant"].map((s) => <Check key={s} name="relationshipStatus" value={s} checked={r.relationshipStatus?.includes(s)} label={s} />)}</div></fieldset>
          <fieldset><legend className="label">Has a project at stage</legend><div className="flex flex-wrap gap-4">{["Awarded", "Commenced", "Milestone", "Completed", "Maintenance"].map((s) => <Check key={s} name="projectStages" value={s} checked={r.projectStages?.includes(s)} label={s} />)}</div></fieldset>
          <div className="flex flex-wrap gap-6">
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="birthdayThisMonth" defaultChecked={r.birthdayThisMonth} className="h-4 w-4 accent-brand" />Birthday this month</label>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="marketingConsentOnly" defaultChecked={r.marketingConsentOnly} className="h-4 w-4 accent-brand" />Marketing consent granted only</label>
          </div>
        </div>
        <div className="flex justify-end"><Submit>Save segment</Submit></div>
      </ActionForm>
    </div>
  );
}
