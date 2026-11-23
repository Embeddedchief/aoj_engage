import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ActionForm, Submit } from "@/components/forms";
import { login } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  if ((await prisma.user.count()) === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const { next } = await searchParams;
  return (
    <div className="rounded-3xl border border-line bg-white p-6 shadow-card">
      <h2 className="text-lg font-extrabold text-navy">Sign in</h2>
      <p className="mt-0.5 text-xs text-muted">Use the account issued by the ICT Administrator.</p>
      <ActionForm action={login} className="mt-5 space-y-3.5">
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="block">
          <span className="label">Email</span>
          <input className="input" type="email" name="email" autoComplete="username" required autoFocus placeholder="you@aojglobal.com" />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="input" type="password" name="password" autoComplete="current-password" required placeholder="••••••••••" />
        </label>
        <Submit className="btn-navy group w-full justify-between py-1.5 pl-5 pr-1.5">
          Sign in <span className="grid h-8 w-8 place-items-center rounded-full bg-brand transition group-hover:translate-x-0.5"><ArrowRight className="h-4 w-4" /></span>
        </Submit>
      </ActionForm>
      <p className="mt-4 text-[11px] text-muted">Forgotten your password? Ask the ICT Administrator to reset it from Users &amp; Roles.</p>
    </div>
  );
}
