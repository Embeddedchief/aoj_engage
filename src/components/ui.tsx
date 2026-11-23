import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, back }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-4 pt-2 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
          {back ? (
            <Link href={back.href} className="transition hover:text-brand">← {back.label}</Link>
          ) : (
            <>
              <Link href="/" className="transition hover:text-brand">AOJ Engage</Link>
              <span className="text-muted/50">›</span>
              <span className="text-ink">{title}</span>
            </>
          )}
        </div>
        <h1 className="text-[28px] font-extrabold leading-tight tracking-tight text-navy md:text-[32px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClass }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-6 pb-1 pt-5">
          <h2 className="text-[15px] font-bold tracking-tight text-navy">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("px-6 pb-6 pt-4", bodyClass)}>{children}</div>
    </section>
  );
}

const TONES = {
  neutral: "bg-navy-50 text-navy-500 ring-navy-100",
  info: "bg-sky-50 text-sky-800 ring-sky-100",
  ok: "bg-emerald-50 text-ok ring-emerald-100",
  warn: "bg-amber-50 text-warn ring-amber-100",
  bad: "bg-red-50 text-bad ring-red-100",
  brand: "bg-brand-50 text-brand-700 ring-brand-100",
};
export type Tone = keyof typeof TONES;

export function Badge({ tone = "neutral", children, className }: { tone?: Tone; children: React.ReactNode; className?: string }) {
  return <span className={cn("inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset", TONES[tone], className)}>{children}</span>;
}

export function StatCard({ label, value, hint, icon: Icon, tone = "neutral", href }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "neutral" | "brand" | "ok" | "warn" | "bad"; href?: string }) {
  const dot = { neutral: "bg-navy-100", brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", bad: "bg-bad" }[tone];
  const body = (
    <div className="card card-hover group flex h-full flex-col justify-between gap-4 p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="text-sm font-medium text-muted">{label}</div>
        {Icon && (
          <div className="grid h-9 w-9 place-items-center rounded-full border border-line text-navy transition duration-300 group-hover:rotate-[-10deg] group-hover:border-navy group-hover:bg-navy group-hover:text-white">
            <Icon className="h-4 w-4" aria-hidden />
          </div>
        )}
      </div>
      <div>
        <div className="text-[34px] font-extrabold leading-none tracking-tight tabular-nums text-navy">{value}</div>
        {hint && <div className="mt-2 flex items-center gap-1.5 text-xs text-muted"><span className={cn("h-1.5 w-1.5 rounded-full", dot)} />{hint}</div>}
      </div>
    </div>
  );
  return href ? <Link href={href} className="block h-full">{body}</Link> : body;
}

export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && <div className="mb-3 grid h-14 w-14 animate-float place-items-center rounded-2xl bg-canvas"><Icon className="h-6 w-6 text-navy-300" aria-hidden /></div>}
      <div className="font-semibold text-navy">{title}</div>
      {children && <div className="mt-1 max-w-md text-sm text-muted">{children}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function Field({ label, hint, children, className }: { label: string; hint?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <label className={cn("block", className)}>
      <span className="label">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-muted">{hint}</span>}
    </label>
  );
}

export function Tabs({ items, active }: { items: { href: string; label: string; count?: number }[]; active: string }) {
  return (
    <div className="no-print mb-5 flex w-fit max-w-full gap-1 overflow-x-auto rounded-full bg-white p-1 shadow-card">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn("whitespace-nowrap rounded-full px-4 py-1.5 text-sm font-medium transition", t.href === active ? "bg-navy text-white shadow-lift" : "text-muted hover:bg-canvas hover:text-ink")}
        >
          {t.label}
          {t.count !== undefined && <span className={cn("ml-1.5 rounded-full px-1.5 text-xs", t.href === active ? "bg-white/15 text-white" : "bg-canvas text-muted")}>{t.count}</span>}
        </Link>
      ))}
    </div>
  );
}

export function KeyVal({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
      {items.map(([k, v]) => (
        <div key={k} className="min-w-0">
          <dt className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-ink">{v || <span className="text-muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = "info", children, title }: { tone?: "info" | "warn" | "bad" | "ok"; title?: string; children: React.ReactNode }) {
  const s = { info: "border-sky-200 bg-sky-50 text-sky-900", warn: "border-amber-200 bg-amber-50 text-amber-900", bad: "border-red-200 bg-red-50 text-red-900", ok: "border-emerald-200 bg-emerald-50 text-emerald-900" }[tone];
  return (
    <div className={cn("animate-rise rounded-2xl border px-4 py-3 text-sm", s)}>
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}
