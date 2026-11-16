import { Tabs } from "@/components/ui";

export function SettingsTabs({ active }: { active: string }) {
  return (
    <Tabs
      active={active}
      items={[
        { href: "/settings", label: "Branding & delivery" },
        { href: "/settings/policies", label: "Policies & safety" },
        { href: "/settings/users", label: "Users & roles" },
        { href: "/settings/suppressions", label: "Suppression list" },
        { href: "/settings/audit", label: "Audit log" },
        { href: "/settings/account", label: "My account" },
      ]}
    />
  );
}
