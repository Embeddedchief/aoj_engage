import { redirect } from "next/navigation";
import { ArrowRight } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/auth";
import { ActionForm, Submit } from "@/components/forms";
import { login } from "../actions";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; changed?: string }> }) {
  if ((await prisma.user.count()) === 0) redirect("/setup");
  if (await getCurrentUser()) redirect("/");
  const { next, changed } = await searchParams;
  return (
    <div className="rounded-3xl border border-line bg-white p-6 shadow-card">
      <h2 className="text-lg font-extrabold text-navy">Sign in</h2>
      <p className="mt-0.5 text-xs text-muted">Use the account issued by the ICT Administrator.</p>
      {changed && <div className="mt-3 rounded-2xl bg-emerald-50 px-3 py-2 text-xs font-medium text-ok">Password updated. Sign in with your new password.</div>}
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
      <p className="mt-4 text-[11px] leading-relaxed text-muted"><span className="font-semibold text-navy">First time here?</span> Sign in with the temporary login the admin gave you, then change your password at first login. Forgot it? The admin can reset it and give you a new temporary login.</p>
    </div>
  );
}
