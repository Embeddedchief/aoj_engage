import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { verifyToken } from "@/lib/session";
import { unsubscribeByToken } from "@/lib/unsubscribe";
import { getSettings } from "@/lib/settings";

export const dynamic = "force-dynamic";
export const metadata = { title: "Communication preferences" };

// GET only shows a confirmation: link scanners must never unsubscribe people.
export default async function UnsubscribePage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ done?: string }> }) {
  const { token } = await params;
  const { done } = await searchParams;
  const id = await verifyToken("unsubscribe", token);
  const contact = id ? await prisma.contact.findUnique({ where: { id }, select: { firstName: true, marketingConsent: true } }) : null;
  const s = await getSettings();

  async function confirm() {
    "use server";
    await unsubscribeByToken(token, "Unsubscribe page");
    redirect(`/u/${token}?done=1`);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas p-6">
      <div className="card w-full max-w-md p-8 text-center">
        <div className="mx-auto mb-5 grid h-12 w-12 place-items-center rounded-xl bg-brand text-sm font-extrabold text-white">AOJ</div>
        {!contact ? (
          <p className="text-sm text-muted">This link is invalid or has expired.</p>
        ) : done || contact.marketingConsent === "WITHDRAWN" ? (
          <>
            <h1 className="text-xl font-bold text-navy">You&apos;re unsubscribed</h1>
            <p className="mt-2 text-sm text-muted">{contact.firstName}, you will no longer receive greetings or relationship emails from {s.brand.companyName}. We may still contact you about active projects or contractual matters.</p>
          </>
        ) : (
          <>
            <h1 className="text-xl font-bold text-navy">Communication preferences</h1>
            <p className="mt-2 text-sm text-muted">Hello {contact.firstName}, would you like to stop receiving greetings and relationship emails from {s.brand.companyName}?</p>
            <form action={confirm} className="mt-6"><button className="btn-primary w-full">Unsubscribe me</button></form>
          </>
        )}
      </div>
    </div>
  );
}
