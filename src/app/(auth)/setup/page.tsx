import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { ActionForm, Submit } from "@/components/forms";
import { setupAdmin } from "../actions";

export const metadata = { title: "First-time setup" };

export default async function SetupPage() {
  if ((await prisma.user.count()) > 0) redirect("/login");
  return (
    <div className="rounded-3xl border border-line bg-white p-6 shadow-card">
      <h2 className="text-lg font-extrabold text-navy">First-time setup</h2>
      <p className="mt-0.5 text-xs text-muted">Create the first ICT Administrator account. This page is only available once, until an administrator exists.</p>
      <ActionForm action={setupAdmin} className="mt-5 space-y-3.5">
        <label className="block">
          <span className="label">Full name</span>
          <input className="input" name="name" required />
        </label>
        <label className="block">
          <span className="label">Work email</span>
          <input className="input" type="email" name="email" required />
        </label>
        <label className="block">
          <span className="label">Password</span>
          <input className="input" type="password" name="password" minLength={12} autoComplete="new-password" required />
          <span className="mt-1 block text-xs text-muted">At least 12 characters, with letters and numbers.</span>
        </label>
        <label className="block">
          <span className="label">Confirm password</span>
          <input className="input" type="password" name="confirm" minLength={12} autoComplete="new-password" required />
        </label>
        <Submit className="btn-navy w-full py-2.5">Create administrator</Submit>
      </ActionForm>
    </div>
  );
}
