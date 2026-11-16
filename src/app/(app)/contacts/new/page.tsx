import type { ContactCategory } from "@prisma/client";
import { requireUser } from "@/lib/auth";
import { visibleCategories } from "@/lib/queries";
import { PageHeader, Notice } from "@/components/ui";
import { ContactForm } from "@/components/contact-form";
import { createContact } from "@/actions/contacts";

export const metadata = { title: "Add contact" };

export default async function NewContactPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const user = await requireUser();
  const cats = visibleCategories(user.role, "write");
  const { category } = await searchParams;
  const initial = cats.includes(category as ContactCategory) ? (category as ContactCategory) : cats[0];
  return (
    <div className="max-w-4xl">
      <PageHeader title="Add contact" back={{ href: "/contacts", label: "Contacts" }} description="The email address is checked for format and duplicates when you save." />
      {cats.length === 0 ? <Notice tone="warn">Your role cannot add contacts.</Notice> : <ContactForm action={createContact} categories={cats} values={{ category: initial }} submitLabel="Save contact" />}
    </div>
  );
}
