import Link from "next/link";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export function PageHeader({ title, description, actions, back }: { title: string; description?: React.ReactNode; actions?: React.ReactNode; back?: { href: string; label: string } }) {
  return (
    <div className="mb-6 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
      <div className="min-w-0">
        {back && (
          <Link href={back.href} className="mb-2 inline-block text-xs font-semibold uppercase tracking-wide text-muted hover:text-brand">
            ← {back.label}
          </Link>
        )}
        <h1 className="text-2xl font-bold tracking-tight text-navy">{title}</h1>
        {description && <p className="mt-1 max-w-3xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="no-print flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, actions, children, className, bodyClass }: { title?: React.ReactNode; actions?: React.ReactNode; children: React.ReactNode; className?: string; bodyClass?: string }) {
  return (
    <section className={cn("card", className)}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
          <h2 className="text-sm font-semibold text-navy">{title}</h2>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      <div className={cn("p-5", bodyClass)}>{children}</div>
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
  const iconTone = { neutral: "bg-navy-50 text-navy", brand: "bg-brand-50 text-brand", ok: "bg-emerald-50 text-ok", warn: "bg-amber-50 text-warn", bad: "bg-red-50 text-bad" }[tone];
  const body = (
    <div className="card flex h-full items-start justify-between gap-3 p-4 transition hover:border-navy-100">
      <div className="min-w-0">
        <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
        <div className="mt-1.5 text-2xl font-bold tabular-nums text-navy">{value}</div>
        {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
      </div>
      {Icon && (
        <div className={cn("rounded-lg p-2", iconTone)}>
          <Icon className="h-4 w-4" aria-hidden />
        </div>
      )}
    </div>
  );
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Empty({ icon: Icon, title, children, action }: { icon?: LucideIcon; title: string; children?: React.ReactNode; action?: React.ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      {Icon && <Icon className="mb-3 h-8 w-8 text-navy-300" aria-hidden />}
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
    <div className="no-print mb-5 flex gap-1 overflow-x-auto border-b border-line">
      {items.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={cn("-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium", t.href === active ? "border-brand text-navy" : "border-transparent text-muted hover:text-ink")}
        >
          {t.label}
          {t.count !== undefined && <span className="ml-1.5 rounded-full bg-navy-50 px-1.5 text-xs text-muted">{t.count}</span>}
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
          <dt className="text-xs font-semibold uppercase tracking-wide text-muted">{k}</dt>
          <dd className="mt-0.5 break-words text-ink">{v || <span className="text-muted">—</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

export function Notice({ tone = "info", children, title }: { tone?: "info" | "warn" | "bad" | "ok"; title?: string; children: React.ReactNode }) {
  const s = { info: "border-sky-200 bg-sky-50 text-sky-900", warn: "border-amber-200 bg-amber-50 text-amber-900", bad: "border-red-200 bg-red-50 text-red-900", ok: "border-emerald-200 bg-emerald-50 text-emerald-900" }[tone];
  return (
    <div className={cn("rounded-lg border px-4 py-3 text-sm", s)}>
      {title && <div className="font-semibold">{title}</div>}
      <div className={title ? "mt-0.5" : ""}>{children}</div>
    </div>
  );
}
