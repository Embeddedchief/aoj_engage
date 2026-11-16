import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { canAccessCategory } from "@/lib/permissions";
import { visibleCategories } from "@/lib/queries";
import { PageHeader } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
import { updateContact } from "@/actions/contacts";

export const metadata = { title: "Edit contact" };

const d = (x: Date | null | undefined) => (x ? x.toISOString().slice(0, 10) : null);

export default async function EditContactPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const c = await prisma.contact.findUnique({ where: { id }, include: { staffProfile: true, customerProfile: true } });
  if (!c || !canAccessCategory(user.role, c.category, "write")) notFound();
  return (
    <div className="max-w-4xl">
      <PageHeader title={`Edit ${c.firstName} ${c.lastName}`} back={{ href: `/contacts/${c.id}`, label: "Contact profile" }} />
      <ContactForm
        action={updateContact}
        categories={visibleCategories(user.role, "write")}
        submitLabel="Save changes"
        values={{
          ...c, anniversary: d(c.anniversary), dateJoined: d(c.staffProfile?.dateJoined), employmentStatus: c.staffProfile?.employmentStatus, manager: c.staffProfile?.manager,
          birthdayVisibleToColleagues: c.staffProfile?.birthdayVisibleToColleagues, relationshipManager: c.customerProfile?.relationshipManager, customerCategory: c.customerProfile?.customerCategory,
          firstEngagement: d(c.customerProfile?.firstEngagement), language: c.customerProfile?.language, relationshipStatus: c.customerProfile?.relationshipStatus,
        }}
      />
    </div>
  );
}
