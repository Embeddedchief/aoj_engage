"use client";

import { useMemo, useState, useTransition } from "react";
import type { ConsentStatus, ContactCategory } from "@prisma/client";
import { CheckCircle2, FileSpreadsheet, Loader2 } from "lucide-react";
import { CATEGORY_LABEL } from "@/lib/constants";
import { IMPORT_FIELDS, guessMapping, type ImportFieldKey } from "@/lib/contact-parse";
import { commitImport, parseImportFile, validateImport, type ImportRow, type RowCheck } from "@/actions/contacts";
import { cn, toCsv } from "@/lib/utils";

type Parsed = { headers: string[]; rows: string[][]; fileName: string };
type Report = { row: number; email: string; result: string; detail: string }[];

export function ImportWizard({ categories }: { categories: ContactCategory[] }) {
  const [step, setStep] = useState(1);
  const [parsed, setParsed] = useState<Parsed | null>(null);
  const [mapping, setMapping] = useState<Partial<Record<ImportFieldKey, number>>>({});
  const [defaultCategory, setDefaultCategory] = useState<ContactCategory>(categories[0]);
  const [rows, setRows] = useState<ImportRow[]>([]);
  const [checks, setChecks] = useState<RowCheck[]>([]);
  const [consent, setConsent] = useState<ConsentStatus>("UNKNOWN");
  const [consentSource, setConsentSource] = useState("");
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [filter, setFilter] = useState<"all" | "error" | "duplicate" | "ok">("all");
  const [pending, start] = useTransition();

  const counts = useMemo(() => ({ ok: checks.filter((c) => c.status === "ok").length, error: checks.filter((c) => c.status === "error").length, duplicate: checks.filter((c) => c.status === "duplicate").length }), [checks]);
  const missingRequired = IMPORT_FIELDS.filter((f) => f.required && mapping[f.key] === undefined);

  function upload(fd: FormData) {
    setError(null);
    start(async () => {
      const r = await parseImportFile(null, fd);
      if (!r.ok) return setError(r.error ?? "Could not read file");
      const p = r.data as Parsed;
      setParsed(p);
      setMapping(guessMapping(p.headers));
      setStep(2);
    });
  }

  function buildRows() {
    return parsed!.rows.map((r) => Object.fromEntries(Object.entries(mapping).filter(([, i]) => i !== undefined).map(([k, i]) => [k, r[i as number] ?? ""])) as ImportRow);
  }

  function validate(next?: ImportRow[]) {
    const data = next ?? buildRows();
    setError(null);
    start(async () => {
      const r = await validateImport(data, defaultCategory);
      if (!r.ok) return setError(r.error ?? "Validation failed");
      setRows(data);
      setChecks(r.data as RowCheck[]);
      setStep(3);
    });
  }

  function edit(i: number, key: ImportFieldKey, value: string) {
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [key]: value } : r)));
  }

  function commit() {
    setError(null);
    start(async () => {
      const r = await commitImport(rows, defaultCategory, { status: consent, source: consentSource }, parsed?.fileName ?? "upload");
      if (!r.ok) return setError(r.error ?? "Import failed");
      setReport(r.data as Report);
      setMessage(r.message ?? null);
      setStep(4);
    });
  }

  function downloadReport() {
    const blob = new Blob([toCsv(report ?? [])], { type: "text/csv" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `import-report-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }

  const shown = checks.filter((c) => filter === "all" || c.status === filter).slice(0, 200);
  const editable: ImportFieldKey[] = ["firstName", "lastName", "email", "category", "birthday"];

  return (
    <div className="space-y-5">
      <ol className="flex flex-wrap gap-2 text-sm">
        {["Upload", "Map columns", "Review & correct", "Report"].map((s, i) => (
          <li key={s} className={cn("flex items-center gap-2 rounded-full px-3 py-1", step === i + 1 ? "bg-navy text-white" : step > i + 1 ? "bg-emerald-50 text-ok" : "bg-white text-muted ring-1 ring-line")}>
            <span className="font-bold">{i + 1}</span> {s}
          </li>
        ))}
      </ol>
      {error && <div className="rounded-lg bg-red-50 px-4 py-3 text-sm text-red-900">{error}</div>}

      {step === 1 && (
        <form action={upload} className="card p-6">
          <label className="flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-line px-6 py-12 text-center hover:border-brand">
            <FileSpreadsheet className="mb-3 h-10 w-10 text-navy-300" />
            <span className="font-semibold text-navy">Choose a CSV or Excel (.xlsx) file</span>
            <span className="mt-1 text-sm text-muted">Up to 5,000 rows. The first row must contain column headings.</span>
            <input type="file" name="file" accept=".csv,.xlsx,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="mt-4 text-sm" required />
          </label>
          <div className="mt-4 flex items-center justify-between gap-3">
            <a className="link text-sm" href={`data:text/csv;charset=utf-8,${encodeURIComponent("First Name,Last Name,Email,Category,Birthday,Company,Department,Job Title,Phone,City\nJohn,Ade,john@example.com,Customer,12/03/1990,ABC Ltd,,Facilities Manager,,Lagos\nMary,James,mary@example.com,Staff,18/06/1995,AOJ Global,Human Resources,HR Officer,,Lagos\n")}`} download="aoj-engage-import-template.csv">Download a sample template</a>
            <button className="btn-primary" disabled={pending}>{pending && <Loader2 className="h-4 w-4 animate-spin" />} Upload & detect columns</button>
          </div>
        </form>
      )}

      {step === 2 && parsed && (
        <div className="card p-6">
          <p className="mb-4 text-sm text-muted"><strong className="text-navy">{parsed.fileName}</strong> — {parsed.rows.length} row(s) and {parsed.headers.length} columns detected. Match each AOJ Engage field to a column in your file.</p>
          <div className="grid gap-3 md:grid-cols-2">
            {IMPORT_FIELDS.map((f) => (
              <label key={f.key} className="flex items-center gap-3">
                <span className="w-44 text-sm font-medium">{f.label}{f.required && <span className="text-brand"> *</span>}</span>
                <select className="input" value={mapping[f.key] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [f.key]: e.target.value === "" ? undefined : Number(e.target.value) }))}>
                  <option value="">— Not imported —</option>
                  {parsed.headers.map((h, i) => <option key={i} value={i}>{h} (e.g. {parsed.rows[0]?.[i]?.slice(0, 24) || "empty"})</option>)}
                </select>
              </label>
            ))}
          </div>
          <label className="mt-5 flex items-center gap-3">
            <span className="w-44 text-sm font-medium">Default category</span>
            <select className="input max-w-xs" value={defaultCategory} onChange={(e) => setDefaultCategory(e.target.value as ContactCategory)}>
              {categories.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <span className="text-xs text-muted">Used when a row has no category</span>
          </label>
          <div className="mt-6 flex justify-between">
            <button className="btn-ghost" onClick={() => setStep(1)}>Back</button>
            <button className="btn-primary" disabled={pending || missingRequired.length > 0} onClick={() => validate()}>
              {pending && <Loader2 className="h-4 w-4 animate-spin" />}
              {missingRequired.length ? `Map ${missingRequired.map((f) => f.label).join(", ")}` : "Validate rows"}
            </button>
          </div>
        </div>
      )}

      {step === 3 && (
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Stat label="Ready to import" value={counts.ok} tone="text-ok" onClick={() => setFilter("ok")} active={filter === "ok"} />
            <Stat label="Errors to correct" value={counts.error} tone="text-bad" onClick={() => setFilter("error")} active={filter === "error"} />
            <Stat label="Duplicates (skipped)" value={counts.duplicate} tone="text-warn" onClick={() => setFilter("duplicate")} active={filter === "duplicate"} />
          </div>
          <div className="card overflow-hidden">
            <div className="flex items-center justify-between border-b border-line px-4 py-2 text-sm">
              <span className="text-muted">Edit cells to correct errors, then re-validate. Showing {shown.length} of {checks.filter((c) => filter === "all" || c.status === filter).length}.</span>
              <button className="link text-xs" onClick={() => setFilter("all")}>Show all</button>
            </div>
            <div className="max-h-[480px] overflow-auto">
              <table className="table">
                <thead className="sticky top-0"><tr><th>Row</th>{editable.map((k) => <th key={k}>{IMPORT_FIELDS.find((f) => f.key === k)!.label}</th>)}<th>Result</th></tr></thead>
                <tbody>
                  {shown.map((c) => (
                    <tr key={c.index} className={c.status === "error" ? "bg-red-50/40" : c.status === "duplicate" ? "bg-amber-50/40" : ""}>
                      <td className="text-muted">{c.index + 2}</td>
                      {editable.map((k) => (
                        <td key={k} className="py-1.5">
                          <input className="input py-1 text-xs" value={rows[c.index]?.[k] ?? ""} onChange={(e) => edit(c.index, k, e.target.value)} disabled={mapping[k] === undefined && k !== "category"} />
                        </td>
                      ))}
                      <td className="text-xs">{c.status === "ok" ? <span className="text-ok">Ready</span> : <span className={c.status === "error" ? "text-bad" : "text-warn"}>{c.messages.join("; ")}</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
          {categories.some((c) => !["STAFF", "MANAGEMENT", "CONTRACTOR"].includes(c)) && (
            <div className="card grid gap-3 p-5 md:grid-cols-2">
              <label><span className="label">Marketing consent for external contacts in this file</span>
                <select className="input" value={consent} onChange={(e) => setConsent(e.target.value as ConsentStatus)}>
                  <option value="UNKNOWN">Not recorded (excluded from marketing emails)</option>
                  <option value="GRANTED">Consent granted — I hold evidence</option>
                </select>
              </label>
              <label><span className="label">Consent source / evidence</span><input className="input" value={consentSource} onChange={(e) => setConsentSource(e.target.value)} placeholder="e.g. 2026 customer onboarding forms" /></label>
              <p className="text-xs text-muted md:col-span-2">Uploading an address does not by itself permit promotional email (NDPA 2023). Only mark consent as granted if you can evidence it.</p>
            </div>
          )}
          <div className="flex flex-wrap justify-between gap-2">
            <button className="btn-ghost" onClick={() => setStep(2)}>Back to mapping</button>
            <div className="flex gap-2">
              <button className="btn-secondary" disabled={pending} onClick={() => validate(rows)}>Re-validate</button>
              <button className="btn-primary" disabled={pending || counts.ok === 0 || (consent === "GRANTED" && !consentSource)} onClick={commit}>
                {pending && <Loader2 className="h-4 w-4 animate-spin" />} Import {counts.ok} contact{counts.ok === 1 ? "" : "s"}
              </button>
            </div>
          </div>
        </div>
      )}

      {step === 4 && report && (
        <div className="card p-6">
          <div className="flex items-center gap-3"><CheckCircle2 className="h-6 w-6 text-ok" /><span className="font-semibold text-navy">{message}</span></div>
          <div className="mt-4 max-h-80 overflow-auto rounded-lg border border-line">
            <table className="table"><thead><tr><th>Row</th><th>Email</th><th>Result</th><th>Detail</th></tr></thead>
              <tbody>{report.slice(0, 300).map((r, i) => <tr key={i}><td>{r.row}</td><td>{r.email}</td><td className={r.result === "Imported" ? "text-ok" : "text-warn"}>{r.result}</td><td className="text-xs text-muted">{r.detail}</td></tr>)}</tbody>
            </table>
          </div>
          <div className="mt-4 flex gap-2">
            <button className="btn-secondary" onClick={downloadReport}>Download import report (CSV)</button>
            <a href="/contacts" className="btn-primary">Go to contacts</a>
          </div>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value, tone, onClick, active }: { label: string; value: number; tone: string; onClick: () => void; active: boolean }) {
  return (
    <button onClick={onClick} className={cn("card p-4 text-left", active && "ring-2 ring-brand/30")}>
      <div className="text-xs font-semibold uppercase tracking-wide text-muted">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold", tone)}>{value}</div>
    </button>
  );
}
