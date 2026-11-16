"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import {
  BarChart3, Bell, BookUser, Briefcase, CalendarDays, CheckCircle2, FileClock, Handshake, HelpCircle, Image as ImageIcon, LayoutDashboard,
  LayoutTemplate, ListFilter, LogOut, Megaphone, Menu, Search, Settings, ShieldCheck, Upload, UserRound, Users, Workflow, X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS = {
  dashboard: LayoutDashboard, contacts: BookUser, staff: Users, customers: Briefcase, partners: Handshake, prospects: UserRound, segments: ListFilter,
  import: Upload, calendar: CalendarDays, templates: LayoutTemplate, campaigns: Megaphone, automations: Workflow, approvals: CheckCircle2,
  analytics: BarChart3, media: ImageIcon, settings: Settings, users: ShieldCheck, audit: FileClock,
};
export type IconName = keyof typeof ICONS;
export type NavItem = { href: string; label: string; icon: IconName; badge?: number; section?: string };

function isActive(href: string, path: string, search: URLSearchParams) {
  const [p, q] = href.split("?");
  if (p === "/") return path === "/";
  if (q) return path === p && search.toString() === q;
  if (p === "/contacts") return path === "/contacts" && !search.get("group");
  if (p === "/settings") return path === "/settings";
  return path === p || path.startsWith(p + "/");
}

export function Shell({ nav, user, unread, logoutAction, children }: { nav: NavItem[]; user: { name: string; role: string; initials: string }; unread: number; logoutAction: () => Promise<void>; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const search = useSearchParams();
  let lastSection: string | undefined;

  const sidebar = (
    <nav className="flex h-full flex-col">
      <Link href="/" className="flex items-center gap-3 px-5 py-5" onClick={() => setOpen(false)}>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="AOJ Global" className="h-10 w-10 rounded-lg bg-white object-contain p-0.5" />
        <div>
          <div className="text-[15px] font-bold leading-none text-white">AOJ Engage</div>
          <div className="mt-1 text-[10px] tracking-[0.18em] text-navy-300">AOJ GLOBAL</div>
        </div>
      </Link>
      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-6">
        {nav.map((item) => {
          const Icon = ICONS[item.icon];
          const header = item.section && item.section !== lastSection ? item.section : null;
          lastSection = item.section;
          const active = isActive(item.href, path, search);
          return (
            <div key={item.href}>
              {header && <div className="px-3 pb-1.5 pt-5 text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-300/80">{header}</div>}
              <Link
                href={item.href}
                onClick={() => setOpen(false)}
                className={cn("flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition", active ? "bg-white/10 font-semibold text-white" : "text-navy-100/80 hover:bg-white/5 hover:text-white")}
              >
                <Icon className={cn("h-4 w-4", active ? "text-brand" : "")} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {!!item.badge && <span className="rounded-full bg-brand px-1.5 text-[11px] font-bold text-white">{item.badge}</span>}
              </Link>
            </div>
          );
        })}
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-64">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-navy lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-navy/60" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 bg-navy">
            <button className="absolute right-3 top-5 text-white" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-line bg-white/90 px-4 backdrop-blur md:px-8">
        <button className="btn-ghost -ml-2 px-2 lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <form action="/search" className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input name="q" placeholder="Search contacts, campaigns, templates…" className="input h-9 pl-9" aria-label="Global search" />
        </form>
        <div className="ml-auto flex items-center gap-1">
          <Link href="/help" className="btn-ghost px-2" aria-label="Help">
            <HelpCircle className="h-5 w-5" />
          </Link>
          <Link href="/notifications" className="btn-ghost relative px-2" aria-label={`Notifications (${unread} unread)`}>
            <Bell className="h-5 w-5" />
            {unread > 0 && <span className="absolute right-0.5 top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <div className="ml-2 hidden text-right sm:block">
            <div className="text-sm font-semibold leading-tight text-navy">{user.name}</div>
            <div className="text-xs text-muted">{user.role}</div>
          </div>
          <div className="ml-2 grid h-9 w-9 place-items-center rounded-full bg-navy-50 text-xs font-bold text-navy">{user.initials}</div>
          <form action={logoutAction}>
            <button className="btn-ghost px-2" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </header>
      <main className="mx-auto max-w-[1400px] px-4 py-6 md:px-8 md:py-8">{children}</main>
    </div>
  );
}
