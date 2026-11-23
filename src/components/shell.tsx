"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight, BarChart3, Bell, BookUser, Briefcase, CalendarDays, CheckCircle2, FileClock, Handshake, HelpCircle, Image as ImageIcon, LayoutDashboard,
  LayoutTemplate, ListFilter, LogOut, Megaphone, Menu, Search, Settings, ShieldCheck, Sparkles, Upload, UserRound, Users, Workflow, X,
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

type ShellUser = { name: string; email: string; role: string; initials: string };

export function Shell({ nav, user, unread, canBroadcast, logoutAction, children }: { nav: NavItem[]; user: ShellUser; unread: number; canBroadcast: boolean; logoutAction: () => Promise<void>; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const search = useSearchParams();
  const searchRef = useRef<HTMLInputElement>(null);
  let lastSection: string | undefined;

  // ⌘K / Ctrl+K focuses global search
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  useEffect(() => setOpen(false), [path]);

  const sidebar = (
    <nav className="flex h-full flex-col">
      <Link href="/" className="group flex items-center gap-3 px-5 pb-4 pt-5">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/icon.png" alt="AOJ Global" className="h-11 w-11 rounded-2xl bg-white object-contain p-0.5 ring-1 ring-line transition group-hover:rotate-[-6deg] group-hover:scale-105" />
        <div className="min-w-0">
          <div className="flex items-center gap-1.5 text-[15px] font-extrabold leading-none tracking-tight text-navy">
            AOJ Engage
          </div>
          <div className="mt-1.5 inline-flex items-center gap-1 rounded-full bg-brand-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-brand">
            <span className="relative flex h-1.5 w-1.5"><span className="absolute inset-0 animate-ping2 rounded-full bg-brand" /><span className="relative h-1.5 w-1.5 rounded-full bg-brand" /></span>
            Broadcast hub
          </div>
        </div>
      </Link>

      <div className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-4">
        {nav.map((item) => {
          const Icon = ICONS[item.icon];
          const header = item.section && item.section !== lastSection ? item.section : null;
          lastSection = item.section;
          const active = isActive(item.href, path, search);
          return (
            <div key={item.href}>
              {header && <div className="px-3 pb-1.5 pt-5 text-[10px] font-bold uppercase tracking-[0.18em] text-muted/70">{header}</div>}
              <Link
                href={item.href}
                className={cn(
                  "group relative flex items-center gap-3 rounded-full px-3.5 py-2 text-[13.5px] transition-all duration-200",
                  active ? "bg-navy font-semibold text-white shadow-lift" : "text-muted hover:translate-x-0.5 hover:bg-canvas hover:text-ink",
                )}
              >
                <Icon className={cn("h-[17px] w-[17px] transition", active ? "text-white" : "group-hover:text-brand")} aria-hidden />
                <span className="flex-1">{item.label}</span>
                {!!item.badge && <span className={cn("grid h-5 min-w-5 place-items-center rounded-full px-1.5 text-[10px] font-bold", active ? "bg-brand text-white" : "bg-brand text-white")}>{item.badge}</span>}
              </Link>
            </div>
          );
        })}
      </div>

      <div className="p-3">
        <div className="hatch relative overflow-hidden rounded-3xl bg-navy p-3.5 text-white">
          <div className="absolute -right-6 -top-6 h-24 w-24 animate-drift rounded-full bg-brand/40 blur-2xl" />
          <div className="relative">
            <div className="flex items-center gap-2 text-sm font-bold"><Megaphone className="h-4 w-4 text-brand-300" /> Broadcast centre</div>
            <p className="mt-1 hidden text-xs leading-relaxed text-white/60 [@media(min-height:960px)]:block">Adverts, greetings and announcements to every AOJ audience.</p>
            {canBroadcast ? (
              <Link href="/campaigns/new" className="mt-3 flex items-center justify-between rounded-full bg-white py-1.5 pl-4 pr-1.5 text-xs font-bold text-navy transition hover:bg-brand-50">
                New broadcast <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-white"><ArrowUpRight className="h-3.5 w-3.5" /></span>
              </Link>
            ) : (
              <Link href="/campaigns" className="mt-3 flex items-center justify-between rounded-full bg-white py-1.5 pl-4 pr-1.5 text-xs font-bold text-navy transition hover:bg-brand-50">
                View broadcasts <span className="grid h-7 w-7 place-items-center rounded-full bg-brand text-white"><ArrowUpRight className="h-3.5 w-3.5" /></span>
              </Link>
            )}
          </div>
        </div>
      </div>
    </nav>
  );

  return (
    <div className="min-h-screen lg:pl-[17.5rem]">
      <aside className="fixed bottom-3 left-3 top-3 z-30 hidden w-64 overflow-hidden rounded-4xl bg-white shadow-card lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 animate-rise bg-navy/50 backdrop-blur-sm" onClick={() => setOpen(false)} />
          <aside className="absolute bottom-3 left-3 top-3 w-72 animate-rise overflow-hidden rounded-4xl bg-white shadow-lift">
            <button className="absolute right-4 top-6 z-10 rounded-full p-1 text-muted hover:bg-canvas" onClick={() => setOpen(false)} aria-label="Close menu">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}

      <header className="sticky top-0 z-20 flex h-[4.5rem] items-center gap-3 bg-canvas/80 px-4 backdrop-blur-md md:px-6 lg:pr-6">
        <button className="grid h-10 w-10 place-items-center rounded-full bg-white shadow-card lg:hidden" onClick={() => setOpen(true)} aria-label="Open menu">
          <Menu className="h-5 w-5" />
        </button>
        <form action="/search" className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" aria-hidden />
          <input ref={searchRef} name="q" placeholder="Search contacts, broadcasts, templates…" className="h-11 w-full rounded-full border border-transparent bg-white pl-11 pr-14 text-sm shadow-card outline-none transition placeholder:text-muted/70 focus:border-navy-100 focus:ring-4 focus:ring-navy/5" aria-label="Global search" />
          <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-lg border border-line bg-canvas px-1.5 py-0.5 text-[10px] font-semibold text-muted sm:block">⌘K</kbd>
        </form>
        <div className="ml-auto flex items-center gap-2">
          <Link href="/assistant" className="group hidden items-center gap-2 rounded-full bg-navy py-2.5 pl-3 pr-4 text-xs font-semibold text-white shadow-lift transition hover:-translate-y-px md:flex">
            <Sparkles className="h-4 w-4 text-brand-300 transition group-hover:rotate-12" /> Engage assistant
          </Link>
          <Link href="/help" className="hidden h-10 w-10 place-items-center rounded-full bg-white text-muted shadow-card transition hover:text-ink sm:grid" aria-label="Help">
            <HelpCircle className="h-[18px] w-[18px]" />
          </Link>
          <Link href="/notifications" className="relative grid h-10 w-10 place-items-center rounded-full bg-white text-muted shadow-card transition hover:text-ink" aria-label={`Notifications (${unread} unread)`}>
            <Bell className={cn("h-[18px] w-[18px]", unread > 0 && "animate-wiggle")} />
            {unread > 0 && <span className="absolute -right-0.5 -top-0.5 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-brand px-1 text-[10px] font-bold text-white ring-2 ring-canvas">{unread > 99 ? "99+" : unread}</span>}
          </Link>
          <Link href="/settings/account" className="ml-1 flex items-center gap-2.5 rounded-full py-1 pl-1 pr-1 transition hover:bg-white sm:pr-3">
            <div className="grid h-10 w-10 place-items-center rounded-full bg-gradient-to-br from-brand to-brand-700 text-xs font-bold text-white">{user.initials}</div>
            <div className="hidden leading-tight sm:block">
              <div className="text-sm font-bold text-navy">{user.name}</div>
              <div className="max-w-[160px] truncate text-[11px] text-muted">{user.email}</div>
            </div>
          </Link>
          <form action={logoutAction}>
            <button className="grid h-10 w-10 place-items-center rounded-full text-muted transition hover:bg-white hover:text-brand" aria-label="Sign out" title="Sign out">
              <LogOut className="h-4 w-4" />
            </button>
          </form>
        </div>
      </header>
      <main key={path} className="stagger mx-auto max-w-[1440px] px-4 pb-10 pt-2 md:px-6">{children}</main>
    </div>
  );
}
