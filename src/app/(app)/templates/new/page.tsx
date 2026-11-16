import { requirePermission } from "@/lib/auth";
import { AUDIENCE_LABEL, DEPARTMENTS } from "@/lib/constants";
import { visibleAudiences } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { createTemplate } from "@/actions/templates";

export const metadata = { title: "New template" };

export default async function NewTemplatePage() {
  const user = await requirePermission("templates:write");
  const auds = visibleAudiences(user.role);
  return (
    <div className="max-w-2xl">
      <PageHeader title="New template" back={{ href: "/templates", label: "Templates" }} description="Start from a branded skeleton, then design it in the visual editor. You can also duplicate an existing template from the library." />
      <ActionForm action={createTemplate} className="card grid gap-4 p-5 md:grid-cols-2">
        <label className="md:col-span-2"><span className="label">Template name *</span><input className="input" name="name" required placeholder="e.g. Happy New Month – Customers V2" /></label>
        <label><span className="label">Category</span><input className="input" name="category" list="cats" placeholder="e.g. Festive" /><datalist id="cats">{["New Week", "New Month", "Birthday", "Anniversary", "Appreciation", "Festive", "Announcement", "Project", "Welcome", "Recognition"].map((c) => <option key={c} value={c} />)}</datalist></label>
        <label><span className="label">Audience *</span><select className="input" name="audience">{auds.map((a) => <option key={a} value={a}>{AUDIENCE_LABEL[a]}</option>)}</select></label>
        <label><span className="label">Owning department</span><select className="input" name="department">{["Communications", ...DEPARTMENTS].map((d) => <option key={d}>{d}</option>)}</select></label>
        <div className="flex items-end justify-end"><Submit>Create & open editor</Submit></div>
      </ActionForm>
    </div>
  );
}
