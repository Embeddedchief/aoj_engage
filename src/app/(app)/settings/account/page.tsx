import { requireUser } from "@/lib/auth";
import { can } from "@/lib/permissions";
import { ROLE_LABEL } from "@/lib/constants";
import { Card, KeyVal, PageHeader } from "@/components/ui";
import { ActionForm, Submit } from "@/components/forms";
import { changeOwnPassword } from "@/actions/admin";
import { SettingsTabs } from "../tabs";

export const metadata = { title: "My account" };

export default async function AccountPage() {
  const u = await requireUser();
  return (
    <>
      <PageHeader title={can(u.role, "settings:write") ? "Settings" : "My account"} />
      {can(u.role, "settings:write") && <SettingsTabs active="/settings/account" />}
      <div className="grid max-w-4xl gap-6 md:grid-cols-2">
        <Card title="Profile"><KeyVal items={[["Name", u.name], ["Email", u.email], ["Role", ROLE_LABEL[u.role]], ["Department", u.department]]} /></Card>
        <Card title="Change password">
          <ActionForm action={changeOwnPassword} className="space-y-3">
            <input className="input" type="password" name="current" placeholder="Current password" required autoComplete="current-password" />
            <input className="input" type="password" name="password" placeholder="New password (12+ characters)" required autoComplete="new-password" />
            <Submit className="btn-primary w-full">Update password</Submit>
            <p className="text-xs text-muted">You will be signed out of all sessions.</p>
          </ActionForm>
        </Card>
      </div>
    </>
  );
}
