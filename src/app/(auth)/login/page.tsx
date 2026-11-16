import { redirect } from "next/navigation";
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
    <>
      <div className="mb-8 lg:hidden">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-brand text-sm font-extrabold text-white">AOJ</div>
      </div>
      <h1 className="text-2xl font-bold text-navy">Sign in to AOJ Engage</h1>
      <p className="mt-1 text-sm text-muted">Use the account issued by the ICT Administrator.</p>
      <ActionForm action={login} className="mt-8 space-y-4">
        <input type="hidden" name="next" value={next ?? ""} />
        <label className="block">
          <span className="label">Email</span>
          <input className="input" type="email" name="email" autoComplete="username" required autoFocus />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="input" type="password" name="password" autoComplete="current-password" required />
        </label>
        <Submit className="btn-primary w-full py-2.5">Sign in</Submit>
      </ActionForm>
      <p className="mt-6 text-xs text-muted">Forgotten your password? Ask the ICT Administrator to reset it from User Management.</p>
    </>
  );
}
