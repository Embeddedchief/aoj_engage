import { requireUser } from "@/lib/auth";
import { visibleCategories } from "@/lib/queries";
import { Notice, PageHeader } from "@/components/ui";
import { ImportWizard } from "@/components/import-wizard";

export const metadata = { title: "Import contacts" };

export default async function ImportPage() {
  const user = await requireUser();
  const cats = visibleCategories(user.role, "write");
  return (
    <>
      <PageHeader title="Import contacts" back={{ href: "/contacts", label: "Contacts" }} description="Bulk-add staff or customers from CSV or Excel. Invalid and duplicate records are never imported silently: you review every issue first." />
      {cats.length === 0 ? <Notice tone="warn">Your role cannot import contacts.</Notice> : <ImportWizard categories={cats} />}
    </>
  );
}
